/**
 * Account and sync routes. Every error answer has a `code` the app translates.
 *
 *   POST   /api/auth/register         { name, email, password }        -> session
 *   POST   /api/auth/login            { email, password }              -> session
 *   POST   /api/auth/refresh          { refreshToken }                 -> new session (rotated)
 *   POST   /api/auth/logout           { refreshToken }                 -> { ok }
 *   POST   /api/auth/forgot           { email }                        -> { ok } (code sent by email, never returned)
 *   POST   /api/auth/reset            { email, code, newPassword }     -> { ok }
 *   POST   /api/auth/change-password  { currentPassword, newPassword } -> session   (signed in)
 *   DELETE /api/auth/account          { password }                     -> { ok }    (signed in)
 *   POST   /api/sync                  { cursor, changes }              -> { changes, cursor, hasMore } (signed in)
 *
 * session = { user: { id, name, email }, accessToken, refreshToken }
 */
const express = require('express');
const rateLimit = require('express-rate-limit');

const accounts = require('../lib/accounts');
const { requireAccount } = require('../lib/auth');
const { mailConfigured, resetEmail, sendMail } = require('../lib/mail');
const { applySync } = require('../lib/sync');

const limited = (max, minutes) => rateLimit({
  windowMs: minutes * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.', code: 'RATE_LIMITED' },
});

// Per email address too, so one account can't be flooded from many addresses.
const resetRequests = new Map();
function tooManyResets(email) {
  const now = Date.now();
  const recent = (resetRequests.get(email) ?? []).filter((time) => now - time < 60 * 60 * 1000);
  recent.push(now);
  resetRequests.set(email, recent);
  if (resetRequests.size > 10_000) resetRequests.clear();
  return recent.length > 3;
}

function fail(res, error, fallbackMessage) {
  if (error instanceof accounts.AccountError || (error.status && error.status < 500 && error.code)) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  // Log the failure type only: never passwords, tokens, codes or email addresses.
  console.error(fallbackMessage, error.code || error.name || 'error');
  return res.status(500).json({ message: fallbackMessage, code: 'SERVER_ERROR' });
}

function accountRoutes(prisma, { isProduction, deleteAccountData }) {
  const router = express.Router();
  const signInLimit = limited(20, 15);
  const resetLimit = limited(10, 15);

  router.post('/api/auth/register', signInLimit, async (req, res) => {
    try {
      res.status(201).json(await accounts.register(prisma, req.body));
    } catch (error) {
      fail(res, error, 'Unable to create the account.');
    }
  });

  router.post('/api/auth/login', signInLimit, async (req, res) => {
    try {
      res.json(await accounts.login(prisma, req.body));
    } catch (error) {
      fail(res, error, 'Unable to sign in.');
    }
  });

  router.post('/api/auth/refresh', limited(120, 15), async (req, res) => {
    try {
      res.json(await accounts.refreshSession(prisma, req.body?.refreshToken));
    } catch (error) {
      fail(res, error, 'Unable to renew the session.');
    }
  });

  router.post('/api/auth/logout', async (req, res) => {
    try {
      await accounts.revokeSession(prisma, req.body?.refreshToken);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'Unable to sign out.');
    }
  });

  router.post('/api/auth/forgot', resetLimit, async (req, res) => {
    try {
      const email = accounts.normalizeEmail(req.body?.email);
      if (!mailConfigured() && isProduction) {
        return res.status(503).json({ message: 'Password reset by email is not available yet.', code: 'RESET_UNAVAILABLE' });
      }
      if (tooManyResets(email)) return res.status(429).json({ message: 'Too many attempts.', code: 'RATE_LIMITED' });
      await accounts.startPasswordReset(prisma, req.body, async (to, code) => {
        if (!mailConfigured()) {
          // Development only (production refused above): the code goes to the server console.
          console.log(`ORDINA dev: password reset code for ${to}: ${code}`);
          return;
        }
        await sendMail({ to, ...resetEmail(code) });
      });
      // Same answer whether or not the account exists.
      return res.json({ ok: true });
    } catch (error) {
      return fail(res, error, 'Unable to send the reset code.');
    }
  });

  router.post('/api/auth/reset', resetLimit, async (req, res) => {
    try {
      await accounts.finishPasswordReset(prisma, req.body);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error, 'Unable to reset the password.');
    }
  });

  router.post('/api/auth/change-password', signInLimit, async (req, res) => {
    const userId = requireAccount(req, res);
    if (!userId) return;
    try {
      res.json(await accounts.changePassword(prisma, userId, req.body));
    } catch (error) {
      fail(res, error, 'Unable to change the password.');
    }
  });

  router.delete('/api/auth/account', signInLimit, async (req, res) => {
    const userId = requireAccount(req, res);
    if (!userId) return;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(401).json({ message: 'Please log in again.', code: 'SESSION_EXPIRED' });
      if (!(await accounts.verifyPassword(user.passwordHash, req.body?.password))) {
        return res.status(400).json({ message: 'Your password is not correct.', code: 'WRONG_PASSWORD' });
      }
      await deleteAccountData(userId);
      return res.json({ ok: true });
    } catch (error) {
      return fail(res, error, 'Unable to delete the account.');
    }
  });

  router.post('/api/sync', limited(240, 15), express.json({ limit: '25mb' }), async (req, res) => {
    const userId = requireAccount(req, res);
    if (!userId) return;
    try {
      res.json(await applySync(prisma, userId, req.body));
    } catch (error) {
      fail(res, error, 'Sync failed.');
    }
  });

  return router;
}

module.exports = { accountRoutes };
