const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'replace-me-in-production';

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function readUserId(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

function requireUser(req, res) {
  const userId = readUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Authentication required.' });
    return null;
  }
  return userId;
}

module.exports = { signToken, requireUser, JWT_SECRET };
