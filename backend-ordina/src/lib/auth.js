const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'replace-me-in-production';

/**
 * Token kinds:
 * - "access": a signed-in email account (15 minutes, renewed with a refresh token);
 * - "device": a phone without an account, for ORDINA AI only;
 * - none: version 1 tokens, treated like device tokens.
 */
function signToken(user, typ = 'device') {
  return jwt.sign({ sub: String(user.id), typ }, JWT_SECRET, { expiresIn: typ === 'access' ? '15m' : '30d' });
}

function readToken(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return { userId, typ: payload.typ === 'access' ? 'access' : 'device' };
  } catch {
    return null;
  }
}

/** Any valid token (account or device): used by ORDINA AI. */
function requireUser(req, res) {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: 'Authentication required.', code: 'SESSION_EXPIRED' });
    return null;
  }
  return token.userId;
}

/** A signed-in email account only: account settings, backup and sync. */
function requireAccount(req, res) {
  const token = readToken(req);
  if (!token || token.typ !== 'access') {
    res.status(401).json({ message: 'Please log in again.', code: 'SESSION_EXPIRED' });
    return null;
  }
  return token.userId;
}

module.exports = { signToken, readToken, requireUser, requireAccount, JWT_SECRET };
