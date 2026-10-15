const crypto = require('crypto');
const argon2 = require('argon2');
const prisma = require('./prisma');
const { signToken } = require('./auth');

function sessionBody(user) {
  return {
    user: { id: user.id, name: user.displayName, email: user.email },
    token: signToken(user),
  };
}

async function randomPasswordHash() {
  return argon2.hash(crypto.randomBytes(32).toString('hex'));
}

async function upsertOAuthUser({ email, name, googleId, appleId }) {
  const normalized = email ? String(email).trim().toLowerCase() : null;
  let user = null;
  if (googleId) user = await prisma.user.findFirst({ where: { googleId } });
  if (!user && appleId) user = await prisma.user.findFirst({ where: { appleId } });
  if (!user && normalized) user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user && !normalized) {
    const error = new Error('The identity provider did not share an email address for this account.');
    error.status = 400;
    throw error;
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalized,
        displayName: String(name || normalized.split('@')[0]).trim(),
        passwordHash: await randomPasswordHash(),
        googleId: googleId || undefined,
        appleId: appleId || undefined,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: googleId || user.googleId || undefined,
        appleId: appleId || user.appleId || undefined,
      },
    });
  }
  return sessionBody(user);
}

function googleAudiences() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  ].filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const allowed = googleAudiences();
  if (!allowed.length) {
    const error = new Error('Google sign-in is not configured. Set the matching Google client IDs on the API.');
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    const error = new Error('Google token was rejected.');
    error.status = 401;
    throw error;
  }
  const payload = await response.json();
  if (!allowed.includes(payload.aud)) {
    const error = new Error('Google client id mismatch. Use the same Web client ID on the app and API.');
    error.status = 401;
    throw error;
  }
  if (payload.email_verified === 'false' || payload.email_verified === false) {
    const error = new Error('Google email is not verified.');
    error.status = 401;
    throw error;
  }
  return {
    email: payload.email,
    name: payload.name || payload.email,
    googleId: payload.sub,
  };
}

async function verifyAppleIdentityToken(identityToken) {
  const audiences = [process.env.APPLE_CLIENT_ID, process.env.APPLE_BUNDLE_ID].filter(Boolean);
  if (!audiences.length) {
    const error = new Error('Apple sign-in is not configured. Set APPLE_CLIENT_ID on the API (iOS bundle id or Services ID).');
    error.status = 503;
    throw error;
  }
  const { createRemoteJWKSet, jwtVerify } = require('jose');
  const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  const { payload } = await jwtVerify(identityToken, JWKS, {
    issuer: 'https://appleid.apple.com',
    audience: audiences,
  });
  return {
    email: payload.email,
    name: payload.email ? String(payload.email).split('@')[0] : 'Apple user',
    appleId: payload.sub,
  };
}

module.exports = { upsertOAuthUser, verifyGoogleIdToken, verifyAppleIdentityToken };
