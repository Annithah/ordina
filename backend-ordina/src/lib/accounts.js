/**
 * Email accounts: input checks, password hashing (argon2), and sign-in sessions.
 *
 * A session is a short-lived access token (JWT, 15 minutes) plus a refresh token (random, 60
 * days). Only the SHA-256 hash of a refresh token is stored. Every refresh rotates it; using an
 * already-rotated token again (a sign it was stolen) revokes all of that user's sessions.
 * Errors carry a `code` the app translates (see frontend i18n serverErrors.*).
 */
const crypto = require('node:crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('./auth');

const ACCESS_TTL = '15m';
const REFRESH_DAYS = 60;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const NAME_MAX = 80;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESET_CODE_MINUTES = 15;
const RESET_MAX_ATTEMPTS = 5;

class AccountError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function checkEmail(email) {
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new AccountError(400, 'INVALID_EMAIL', 'Please enter a valid email address.');
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new AccountError(400, 'WEAK_PASSWORD', `Use at least ${PASSWORD_MIN} characters for your password.`);
  }
}

/** Checks sign-up input. Returns clean values or throws AccountError. */
function validateRegistration(body) {
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!name || name.length > NAME_MAX) throw new AccountError(400, 'NAME_REQUIRED', 'Please enter your full name.');
  checkEmail(email);
  checkPassword(password);
  return { name, email, password };
}

const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id });
const verifyPassword = (hash, password) => argon2.verify(hash, String(password || '')).catch(() => false);

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { id: user.id, name: user.displayName, email: user.email };
}

function accessToken(user) {
  return jwt.sign({ sub: String(user.id), typ: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

/** Creates a new session for the user. */
async function issueSession(prisma, user) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000) },
  });
  return { user: publicUser(user), accessToken: accessToken(user), refreshToken };
}

async function revokeAllSessions(prisma, userId) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Exchanges a refresh token for a new pair (rotation). Throws 401 SESSION_EXPIRED. */
async function refreshSession(prisma, token) {
  const expired = () => new AccountError(401, 'SESSION_EXPIRED', 'Your session has expired. Please log in again.');
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw expired();
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row) throw expired();
  if (row.revokedAt) {
    // A rotated token was used again: someone else may have it. End every session.
    await revokeAllSessions(prisma, row.userId);
    throw expired();
  }
  if (row.expiresAt.getTime() < Date.now()) throw expired();
  const claimed = await prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!claimed.count) throw expired();
  return issueSession(prisma, row.user);
}

async function revokeSession(prisma, token) {
  if (typeof token !== 'string' || !token) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

async function register(prisma, body) {
  const { name, email, password } = validateRegistration(body);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AccountError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  try {
    const user = await prisma.user.create({ data: { email, displayName: name, passwordHash: await hashPassword(password) } });
    return issueSession(prisma, user);
  } catch (error) {
    if (error.code === 'P2002') throw new AccountError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    throw error;
  }
}

async function login(prisma, body) {
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  const invalid = () => new AccountError(401, 'INVALID_LOGIN', 'Wrong email or password.');
  if (!email || typeof password !== 'string' || !password) throw invalid();
  const user = await prisma.user.findUnique({ where: { email } });
  // Device accounts (ORDINA AI without an account) can never sign in with a password.
  if (!user || email.endsWith('@device.ordina.local')) {
    await hashPassword('timing-safe-dummy');
    throw invalid();
  }
  if (!(await verifyPassword(user.passwordHash, password))) throw invalid();
  return issueSession(prisma, user);
}

function resetCode() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Starts a password reset. Always answers the same way whether or not the account exists.
 * `send(email, code)` delivers the code; it must throw if email delivery is not available.
 */
async function startPasswordReset(prisma, body, send) {
  const email = normalizeEmail(body?.email);
  checkEmail(email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || email.endsWith('@device.ordina.local')) return;
  const code = resetCode();
  await prisma.passwordReset.updateMany({ where: { userId: user.id, used: false }, data: { used: true } });
  await prisma.passwordReset.create({
    data: { userId: user.id, codeHash: await argon2.hash(code), expiresAt: new Date(Date.now() + RESET_CODE_MINUTES * 60 * 1000) },
  });
  await send(email, code);
}

async function finishPasswordReset(prisma, body) {
  const email = normalizeEmail(body?.email);
  const code = String(body?.code ?? '').trim();
  const password = body?.newPassword ?? body?.password;
  const invalid = () => new AccountError(400, 'INVALID_CODE', 'This code is wrong or has expired.');
  checkEmail(email);
  checkPassword(password);
  if (!/^\d{6}$/.test(code)) throw invalid();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw invalid();
  const reset = await prisma.passwordReset.findFirst({
    where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!reset || reset.attempts >= RESET_MAX_ATTEMPTS) throw invalid();
  if (!(await argon2.verify(reset.codeHash, code).catch(() => false))) {
    await prisma.passwordReset.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    throw invalid();
  }
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: reset.id }, data: { used: true } }),
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } }),
  ]);
  await revokeAllSessions(prisma, user.id);
}

/** Changes the password, signs out every other phone, and returns a fresh session for this one. */
async function changePassword(prisma, userId, body) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AccountError(401, 'SESSION_EXPIRED');
  if (!(await verifyPassword(user.passwordHash, body?.currentPassword))) throw new AccountError(400, 'WRONG_PASSWORD', 'Your current password is not correct.');
  checkPassword(body?.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(body.newPassword) } });
  await revokeAllSessions(prisma, userId);
  return issueSession(prisma, user);
}

module.exports = {
  AccountError,
  PASSWORD_MIN,
  normalizeEmail,
  validateRegistration,
  hashToken,
  publicUser,
  issueSession,
  refreshSession,
  revokeSession,
  revokeAllSessions,
  register,
  login,
  resetCode,
  startPasswordReset,
  finishPasswordReset,
  changePassword,
  verifyPassword,
};
