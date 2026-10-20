require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const prisma = require('./lib/prisma');
const { signToken, requireUser } = require('./lib/auth');
const { sendMail } = require('./lib/mail');
const { upsertOAuthUser, verifyGoogleIdToken, verifyAppleIdentityToken } = require('./lib/oauth');
const ai = require('./lib/ai');
const schedule = require('./lib/schedule');
const taskValidation = require('./lib/task-validation');
const gemini = require('./lib/gemini');
const planner = require('./lib/planner');
const planService = require('./lib/plan-service');

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';

// Behind Railway's (or any) HTTPS proxy: trust one hop so rate limits see the real client IP.
if (isProduction || process.env.TRUST_PROXY) app.set('trust proxy', 1);

app.use(helmet());
// The Android app is not a browser and needs no CORS. Browsers are only allowed from CORS_ORIGINS
// (comma-separated); in development every origin is allowed for the Expo web build.
const corsOrigins = String(process.env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins.length ? corsOrigins : !isProduction,
  credentials: true,
}));
// Voice, photo and short video clips are sent inline as base64, so AI routes accept larger bodies.
app.use('/api/ai', express.json({ limit: '30mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
// Method, path, status and timing only: no request bodies, so no task text or prompts in logs.
app.use(morgan(isProduction ? ':method :url :status :response-time ms' : 'dev'));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));
// Stricter limits where guessing or cost matters.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes and try again.' } });
app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot', '/api/auth/reset', '/account/delete', '/api/device/session'], authLimiter);
app.use('/api/ai', rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { message: 'You are sending requests very quickly. Please wait a moment.' } }));

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      service: 'ordina-backend',
      db: 'sqlite',
      timestamp: new Date().toISOString(),
      features: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        googleAuth: Boolean(
          process.env.GOOGLE_CLIENT_ID
            || process.env.GOOGLE_IOS_CLIENT_ID
            || process.env.GOOGLE_ANDROID_CLIENT_ID
            || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
        ),
        appleAuth: Boolean(process.env.APPLE_CLIENT_ID || process.env.APPLE_BUNDLE_ID),
        smtp: Boolean(process.env.SMTP_HOST),
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Database unavailable', error: isProduction ? undefined : error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const passwordHash = require('argon2').hash(password);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        displayName: String(name).trim(),
        passwordHash: await passwordHash,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
      },
    });

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
      },
      token: signToken(user),
    });
  } catch (error) {
    console.error('Register error:', error.code || error.message);
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    return res.status(500).json({ message: 'Unable to register user.', error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const valid = await require('argon2').verify(user.passwordHash, String(password));
    if (!valid) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    return res.json({
      user: {
        id: user.id,
        name: user.displayName,
        email: user.email,
      },
      token: signToken(user),
    });
  } catch (error) {
    console.error('Login error:', error.code || error.message);
    return res.status(500).json({ message: 'Unable to sign in.', error: error.message });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const idToken = String(req.body?.idToken || req.body?.id_token || '').trim();
    if (!idToken) return res.status(400).json({ message: 'Google idToken is required.' });
    const identity = await verifyGoogleIdToken(idToken);
    return res.json(await upsertOAuthUser(identity));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Google sign-in failed.' });
  }
});

app.post('/api/auth/apple', async (req, res) => {
  try {
    const identityToken = String(req.body?.identityToken || req.body?.idToken || '').trim();
    if (!identityToken) return res.status(400).json({ message: 'Apple identityToken is required.' });
    const identity = await verifyAppleIdentityToken(identityToken);
    if (req.body?.fullName) {
      const parts = [req.body.fullName.givenName, req.body.fullName.familyName].filter(Boolean);
      if (parts.length) identity.name = parts.join(' ');
    }
    return res.json(await upsertOAuthUser(identity));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Apple sign-in failed.' });
  }
});

app.post('/api/auth/forgot', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      if (isProduction && !process.env.SMTP_HOST) {
        return res.status(503).json({ emailed: false, message: 'Password reset by email is not available yet. Please contact support.' });
      }
      return res.json({ emailed: Boolean(process.env.SMTP_HOST), message: 'If that account exists, a reset code was issued.' });
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await prisma.passwordReset.updateMany({ where: { userId: user.id, used: false }, data: { used: true } });
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: await require('argon2').hash(code),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const mailed = await sendMail({
      to: email,
      subject: 'ORDINA password reset code',
      text: `Your ORDINA reset code is ${code}. It expires in 15 minutes.`,
    });
    if (!mailed.sent) {
      // Returning the code is only acceptable on a developer's machine: in production it would
      // let anyone reset any account by knowing its email address.
      if (isProduction) {
        await prisma.passwordReset.updateMany({ where: { userId: user.id, used: false }, data: { used: true } });
        return res.status(503).json({ emailed: false, message: 'Password reset by email is not available yet. Please contact support.' });
      }
      return res.json({
        emailed: false,
        code,
        message: 'Email delivery is not configured (SMTP_HOST missing). Use this 6-digit code now to set a new password.',
      });
    }
    return res.json({ emailed: true, message: 'A reset code was sent to your email.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to start password reset.', error: error.message });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || req.body?.password || '');
    if (!email || !code || newPassword.length < 8) {
      return res.status(400).json({ message: 'Email, 6-digit code, and a new password (8+ characters) are required.' });
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: 'Invalid reset code.' });
    const resets = await prisma.passwordReset.findMany({
      where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    let matched = null;
    for (const reset of resets) {
      if (await require('argon2').verify(reset.codeHash, code)) {
        matched = reset;
        break;
      }
    }
    if (!matched) return res.status(400).json({ message: 'Invalid or expired reset code.' });
    await prisma.passwordReset.update({ where: { id: matched.id }, data: { used: true } });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await require('argon2').hash(newPassword) },
    });
    return res.json({ ok: true, message: 'Password updated. You can sign in with the new password.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to reset password.', error: error.message });
  }
});

/** Deletes a user and everything they own. Used by the app and by the public deletion page. */
async function deleteAccountData(userId) {
  // Delete explicitly, in dependency order, rather than relying on cascades.
  await prisma.$transaction([
      prisma.taskCategory.deleteMany({ where: { task: { userId } } }),
      prisma.taskDeadline.deleteMany({ where: { task: { userId } } }),
      prisma.planningProfile.deleteMany({ where: { userId } }),
      prisma.aiPlanConfirmation.deleteMany({ where: { userId } }),
      prisma.reminder.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.aiMessage.deleteMany({ where: { userId } }),
      prisma.passwordReset.deleteMany({ where: { userId } }),
      prisma.place.deleteMany({ where: { userId } }),
      prisma.task.updateMany({ where: { userId }, data: { parentTaskId: null } }),
      prisma.task.deleteMany({ where: { userId } }),
      prisma.goal.deleteMany({ where: { userId } }),
      prisma.project.deleteMany({ where: { userId } }),
      prisma.category.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
}

app.delete('/api/auth/account', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await deleteAccountData(userId);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to delete the account. Try again later.' });
  }
});

/**
 * Offline (development) mode: the phone keeps tasks on the device and has no email account.
 * It identifies itself with a random device id and gets a token only for ORDINA AI, so the
 * learned planning profile is kept per phone. Nothing else is stored for the device.
 */
app.post('/api/device/session', async (req, res) => {
  const deviceId = String(req.body?.deviceId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(deviceId)) {
    return res.status(400).json({ message: 'A valid device id is required.' });
  }
  const email = `device-${deviceId}@device.ordina.local`;
  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const name = String(req.body?.name || '').trim().slice(0, 80) || 'ORDINA device';
      user = await prisma.user.create({
        data: {
          email,
          displayName: name,
          // Random, never shown: device accounts cannot sign in with a password.
          passwordHash: await require('argon2').hash(require('node:crypto').randomBytes(32).toString('hex')),
        },
      });
    }
    return res.json({ token: signToken(user) });
  } catch (error) {
    console.error('Device session failed:', error.code || error.message);
    return res.status(500).json({ message: 'Could not start an ORDINA AI session.' });
  }
});

/** Public account-deletion page (Google Play requires a web link as well as in-app deletion). */
function deletionPage(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delete your ORDINA AI account</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F8FAFC;color:#0F172A;margin:0;padding:24px}
main{max-width:480px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px}
h1{font-size:22px;margin:0 0 8px}p,li{line-height:1.5;color:#334155}label{display:block;font-weight:600;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #CBD5E1;border-radius:10px;font-size:16px}
button{margin-top:18px;width:100%;padding:14px;border:0;border-radius:12px;background:#EF4444;color:#fff;font-size:16px;font-weight:700}
.ok{color:#15803D}.err{color:#B91C1C}</style></head><body><main>${body}</main></body></html>`;
}

const DELETION_FORM = `<h1>Delete your ORDINA AI account</h1>
<p>This permanently deletes your account and all its data: tasks, plans, AI chat history, learned planning preferences and settings. It cannot be undone.</p>
<p>You can also delete your account inside the app: <strong>Profile &rarr; Delete account</strong>.</p>
<form method="post" action="/account/delete">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Permanently delete my account</button></form>`;

app.get('/account/delete', (_req, res) => {
  res.type('html').send(deletionPage(DELETION_FORM));
});

app.post('/account/delete', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const fail = () => res.status(400).type('html').send(deletionPage(`<p class="err">That email and password did not match an account.</p>${DELETION_FORM}`));
  if (!email || !password) return fail();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await require('argon2').verify(user.passwordHash, password).catch(() => false))) return fail();
    await deleteAccountData(user.id);
    return res.type('html').send(deletionPage('<h1>Account deleted</h1><p class="ok">Your ORDINA AI account and all its data have been permanently deleted.</p>'));
  } catch (error) {
    console.error('Web account deletion failed:', error.code || error.message);
    return res.status(500).type('html').send(deletionPage('<p class="err">Something went wrong. Please try again later.</p>'));
  }
});

app.get('/api/projects', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const projects = await prisma.project.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { tasks: true } });
    res.json({ projects: projects.map((project) => {
      const completed = project.tasks.filter((task) => task.status === 'completed').length;
      const overdue = project.tasks.filter((task) => task.dueAt && task.dueAt < new Date() && task.status !== 'completed').length;
      return { ...project, id: String(project.id), dueDate: project.dueDate?.toISOString(), tasksTotal: project.tasks.length, tasksCompleted: completed, tasksOverdue: overdue, progress: project.tasks.length ? Math.round((completed / project.tasks.length) * 100) : 0 };
    }) });
  } catch (error) { res.status(500).json({ message: 'Unable to load projects.', error: error.message }); }
});

app.post('/api/projects', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { name, description, color, dueDate, startDate, status, priority } = req.body ?? {};
    if (!name) return res.status(400).json({ message: 'Project name is required.' });
    const project = await prisma.project.create({
      data: {
        userId,
        name: String(name).trim(),
        description,
        color: color || '#5C4DF2',
        status: status || 'active',
        priority: priority || 'medium',
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
    });
    res.status(201).json({ project: { ...project, id: String(project.id) } });
  } catch (error) { res.status(400).json({ message: 'Unable to create project.', error: error.message }); }
});

app.patch('/api/projects/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const allowed = {};
    for (const key of ['name', 'description', 'color', 'status', 'priority', 'dueDate', 'startDate']) {
      if (req.body?.[key] !== undefined) {
        allowed[key] = key.endsWith('Date') && req.body[key] ? new Date(req.body[key]) : req.body[key];
      }
    }
    const project = await prisma.project.updateMany({ where: { id: Number(req.params.id), userId }, data: allowed });
    if (!project.count) return res.status(404).json({ message: 'Project not found.' });
    res.json({ ok: true });
  } catch (error) { res.status(400).json({ message: 'Unable to update project.', error: error.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.project.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.status(204).end();
});

function pickFields(body, keys) {
  const data = {};
  for (const key of keys) {
    if (body?.[key] !== undefined) data[key] = body[key];
  }
  return data;
}

app.get('/api/goals', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const records = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: { tasks: true },
  });
  res.json({
    goals: records.map((goal) => {
      const related = goal.tasks;
      const completed = related.filter((task) => task.status === 'completed').length;
      const progress = related.length ? Math.round((completed / related.length) * 100) : (goal.target ? Math.round((goal.current / goal.target) * 100) : (goal.completed ? 100 : 0));
      return { ...goal, progress, tasksTotal: related.length, tasksCompleted: completed };
    }),
  });
});

app.post('/api/goals', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const data = pickFields(req.body ?? {}, ['title', 'description', 'status', 'priority', 'target', 'current', 'dueDate', 'projectId', 'completed']);
    if (!data.title) return res.status(400).json({ message: 'Goal title is required.' });
    if (data.dueDate) data.dueDate = new Date(data.dueDate);
    if (data.projectId) data.projectId = Number(data.projectId);
    if (data.completed) data.status = 'completed';
    const goal = await prisma.goal.create({ data: { ...data, userId } });
    res.status(201).json({ goal });
  } catch (error) { res.status(400).json({ message: 'Unable to create goal.', error: error.message }); }
});

app.patch('/api/goals/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const data = pickFields(req.body ?? {}, ['title', 'description', 'status', 'priority', 'target', 'current', 'dueDate', 'projectId', 'completed']);
  if (data.dueDate) data.dueDate = new Date(data.dueDate);
  if (data.projectId !== undefined) data.projectId = data.projectId ? Number(data.projectId) : null;
  if (data.completed === true) data.status = 'completed';
  if (data.completed === false && data.status === undefined) data.status = 'in_progress';
  const result = await prisma.goal.updateMany({ where: { id: Number(req.params.id), userId }, data });
  if (!result.count) return res.status(404).json({ message: 'Goal not found.' });
  res.json({ ok: true });
});

app.delete('/api/goals/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.goal.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.status(204).end();
});

app.get('/api/reminders', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const reminders = await prisma.reminder.findMany({ where: { userId }, orderBy: { remindAt: 'asc' } });
  res.json({ reminders });
});

app.post('/api/reminders', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const data = pickFields(req.body ?? {}, ['title', 'remindAt', 'enabled', 'status', 'taskId', 'projectId', 'goalId', 'kind', 'latitude', 'longitude', 'radiusMeters', 'placeName', 'placeId']);
    const kind = data.kind === 'arrival' ? 'arrival' : 'time';
    let latitude = data.latitude == null ? null : Number(data.latitude);
    let longitude = data.longitude == null ? null : Number(data.longitude);
    let radiusMeters = data.radiusMeters == null ? null : Number(data.radiusMeters);
    let placeName = data.placeName ? String(data.placeName) : null;
    if (data.placeId) {
      const place = await prisma.place.findFirst({ where: { id: Number(data.placeId), userId } });
      if (!place) return res.status(400).json({ message: 'Place not found.' });
      latitude = place.latitude;
      longitude = place.longitude;
      radiusMeters = place.radiusMeters;
      placeName = place.name;
    }
    if (kind === 'arrival' && (latitude == null || longitude == null)) {
      return res.status(400).json({ message: 'Arrival reminders need a saved place or coordinates.' });
    }
    const remindAt = data.remindAt ? new Date(data.remindAt) : (kind === 'arrival' ? new Date('2099-01-01T00:00:00.000Z') : null);
    if (!data.title || !remindAt || Number.isNaN(remindAt.getTime())) {
      return res.status(400).json({ message: 'Title and reminder date/time are required.' });
    }
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title: String(data.title).trim(),
        remindAt,
        kind,
        latitude,
        longitude,
        radiusMeters,
        placeName,
        enabled: data.enabled !== false,
        status: data.status || 'scheduled',
        taskId: data.taskId ? Number(data.taskId) : null,
        projectId: data.projectId ? Number(data.projectId) : null,
        goalId: data.goalId ? Number(data.goalId) : null,
      },
    });
    res.status(201).json({ reminder });
  } catch (error) { res.status(400).json({ message: 'Unable to create reminder.', error: error.message }); }
});

app.get('/api/places', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const places = await prisma.place.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  res.json({ places });
});

app.post('/api/places', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const { name, latitude, longitude, radiusMeters } = req.body ?? {};
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ message: 'Place name, latitude, and longitude are required.' });
    }
    const place = await prisma.place.create({
      data: {
        userId,
        name: String(name).trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusMeters: Number(radiusMeters || 150),
      },
    });
    res.status(201).json({ place });
  } catch (error) {
    res.status(400).json({ message: 'Unable to save place.', error: error.message });
  }
});

app.delete('/api/places/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.place.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.json({ ok: true });
});

app.patch('/api/reminders/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const data = pickFields(req.body ?? {}, ['title', 'remindAt', 'enabled', 'status', 'completed', 'taskId', 'projectId', 'goalId']);
  if (data.remindAt) {
    data.remindAt = new Date(data.remindAt);
    if (Number.isNaN(data.remindAt.getTime())) return res.status(400).json({ message: 'Invalid reminder date/time.' });
  }
  if (data.completed === true) data.status = 'completed';
  const result = await prisma.reminder.updateMany({ where: { id: Number(req.params.id), userId }, data });
  if (!result.count) return res.status(404).json({ message: 'Reminder not found.' });
  res.json({ ok: true });
});

app.delete('/api/reminders/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.reminder.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.status(204).end();
});

app.get('/api/notifications', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const notifications = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  res.json({ notifications });
});

app.patch('/api/notifications/:id/read', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.notification.updateMany({ where: { id: Number(req.params.id), userId }, data: { read: true } });
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  res.json({ ok: true });
});

function mapTask(task) {
  return {
    id: String(task.id),
    title: task.title,
    description: task.description || '',
    status: task.status === 'completed' ? 'completed' : task.status === 'in_progress' ? 'in_progress' : 'todo',
    priority: task.priority <= 1 ? 'low' : task.priority === 2 ? 'medium' : 'high',
    category: task.categories?.[0]?.category?.name?.toLowerCase() || 'work',
    projectId: task.projectId ? String(task.projectId) : undefined,
    goalId: task.goalId ? String(task.goalId) : undefined,
    parentTaskId: task.parentTaskId ? String(task.parentTaskId) : undefined,
    dueDate: task.dueAt ? task.dueAt.toISOString().slice(0, 10) : task.occurrenceDate || undefined,
    startTime: task.startTime || undefined,
    duration: task.duration || undefined,
    recurrence: task.recurrence || 'none',
    recurrenceRule: task.recurrenceRule || undefined,
    reminder: Boolean(task.reminderEnabled),
    contactName: task.contactName || undefined,
    contactPhone: task.contactPhone || undefined,
    deadline: task.deadline?.deadline || undefined,
    completed: task.status === 'completed',
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function materializeRecurrence(userId) {
  const today = schedule.toDateKey(new Date());
  const tomorrow = schedule.addDays(today, 1);
  const parents = await prisma.task.findMany({
    where: { userId, parentTaskId: null, recurrence: { not: 'none' }, status: { not: 'archived' } },
  });
  for (const parent of parents) {
    for (const dateKey of [today, tomorrow]) {
      if (!schedule.matchesRecurrence(parent, dateKey)) continue;
      const existing = await prisma.task.findFirst({
        where: { userId, parentTaskId: parent.id, occurrenceDate: dateKey },
      });
      if (existing) continue;
      await prisma.task.create({
        data: {
          userId,
          parentTaskId: parent.id,
          projectId: parent.projectId,
          goalId: parent.goalId,
          title: parent.title,
          description: parent.description,
          status: 'pending',
          priority: parent.priority,
          dueAt: new Date(`${dateKey}T12:00:00.000Z`),
          startTime: parent.startTime,
          duration: parent.duration,
          recurrence: 'none',
          occurrenceDate: dateKey,
          reminderEnabled: parent.reminderEnabled,
        },
      });
    }
  }
}

async function notify(userId, title, message, type, relatedType, relatedId) {
  return prisma.notification.create({
    data: { userId, title, message, type: type || 'info', relatedType: relatedType || null, relatedId: relatedId || null },
  });
}

/** Recent chat (last 3 hours) so ORDINA can understand answers to its own questions. */
async function recentConversation(userId) {
  const rows = await prisma.aiMessage.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return rows.reverse().map((row) => {
    let actions = null;
    try {
      actions = row.actions ? JSON.parse(row.actions) : null;
    } catch {
      actions = null;
    }
    return { role: row.role, content: row.content, actions };
  });
}

async function ownedTasks(userId) {
  const rows = await prisma.task.findMany({
    where: { userId },
    orderBy: { dueAt: 'asc' },
    include: TASK_INCLUDE,
  });
  return rows
    .filter((task) => task.recurrence === 'none' || task.parentTaskId)
    .map(mapTask);
}

function calendarBusyTasks(events) {
  if (!Array.isArray(events)) return [];
  return events.slice(0, 100).flatMap((event) => {
    const date = String(event?.date || '');
    const startTime = String(event?.startTime || '');
    const durationMinutes = Number(event?.durationMinutes);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return [];
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return [];
    return [{
      title: String(event?.title || 'Google Calendar event').slice(0, 200),
      dueDate: date,
      startTime,
      duration: `${durationMinutes}m`,
      completed: false,
    }];
  });
}

function taskPriority(value) {
  return value === 'high' || value === 3 ? 3 : value === 'medium' || value === 2 ? 2 : 1;
}

function taskDate(dueDate) {
  if (!dueDate) return null;
  const value = `${dueDate}T12:00:00.000Z`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function taskPayload(body, userId, existing = {}) {
  let projectId = existing.projectId ?? null;
  if (body.projectId !== undefined) {
    projectId = body.projectId && Number(body.projectId) > 0 ? Number(body.projectId) : null;
  }
  let goalId = existing.goalId ?? null;
  if (body.goalId !== undefined) {
    goalId = body.goalId && Number(body.goalId) > 0 ? Number(body.goalId) : null;
  }

  const requestedStatus = body.status ?? existing.status ?? 'pending';
  const normalizedStatus = requestedStatus === 'todo' || requestedStatus === 'pending'
    ? 'pending'
    : requestedStatus === 'in_progress'
      ? 'in_progress'
      : requestedStatus === 'completed'
        ? 'completed'
        : existing.status || 'pending';

  const status = body.completed ? 'completed' : normalizedStatus;
  return {
    userId,
    title: String(body.title ?? existing.title ?? '').trim(),
    description: body.description ?? existing.description ?? null,
    status,
    priority: taskPriority(body.priority ?? existing.priority),
    dueAt: taskDate(body.dueDate ?? (existing.dueAt && existing.dueAt.toISOString().slice(0, 10))),
    projectId,
    goalId,
    startTime: body.startTime ?? existing.startTime ?? null,
    duration: body.duration ?? existing.duration ?? null,
    recurrence: body.recurrence ?? existing.recurrence ?? 'none',
    recurrenceRule: body.recurrenceRule ?? existing.recurrenceRule ?? null,
    reminderEnabled: body.reminder === undefined ? Boolean(existing.reminderEnabled) : Boolean(body.reminder),
    contactName: body.contactName === undefined ? existing.contactName ?? null : body.contactName || null,
    contactPhone: body.contactPhone === undefined ? existing.contactPhone ?? null : body.contactPhone || null,
    // Editing a completed task must not reset when it was completed.
    completedAt: status === 'completed' ? existing.completedAt ?? new Date() : null,
  };
}

const TASK_INCLUDE = { categories: { include: { category: true } }, deadline: true };

/** Sets or clears a task's deadline ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM"). */
async function setTaskDeadline(taskId, deadline) {
  if (deadline === undefined) return;
  if (!deadline) {
    await prisma.taskDeadline.deleteMany({ where: { taskId } });
    return;
  }
  await prisma.taskDeadline.upsert({ where: { taskId }, update: { deadline }, create: { taskId, deadline } });
}

/** Stores the task's single category through the existing categories / task_categories tables. */
async function setTaskCategory(userId, taskId, category) {
  if (category === undefined) return;
  await prisma.taskCategory.deleteMany({ where: { taskId } });
  if (!category) return;
  const row = await prisma.category.upsert({
    where: { userId_name: { userId, name: category } },
    update: {},
    create: { userId, name: category },
  });
  await prisma.taskCategory.create({ data: { taskId, categoryId: row.id } });
}

function validationFailure(res, errors) {
  return res.status(400).json({ message: taskValidation.firstError(errors), errors });
}

app.post('/api/ai/interpret', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const message = String(req.body?.message || req.body?.prompt || '').trim();
  if (!message) return res.status(400).json({ message: 'A message is required.' });
  try {
    await materializeRecurrence(userId);
    const existingTasks = [
      ...await ownedTasks(userId),
      ...calendarBusyTasks(req.body?.calendarEvents),
    ];
    const result = await ai.interpret({
      message,
      timezone: req.body?.timezone,
      existingTasks,
      contacts: req.body?.contacts,
      conversation: await recentConversation(userId),
    });
    await prisma.aiMessage.create({ data: { userId, role: 'user', content: message } });
    await prisma.aiMessage.create({
      data: { userId, role: 'assistant', content: result.message || '', actions: JSON.stringify(result) },
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
});

async function interpretMediaRoute(req, res) {
  const userId = requireUser(req, res);
  if (!userId) return;
  const media = String(req.body?.media || req.body?.image || '').trim();
  if (!media) return res.status(400).json({ message: 'An image or video is required.' });
  const mimeType = String(req.body?.mimeType || 'image/jpeg');
  if (!/^(image|video)\//.test(mimeType)) return res.status(400).json({ message: 'Only images and videos are supported.' });
  try {
    await materializeRecurrence(userId);
    const existingTasks = [
      ...await ownedTasks(userId),
      ...calendarBusyTasks(req.body?.calendarEvents),
    ];
    const result = await ai.interpretMedia({
      media,
      mimeType,
      note: req.body?.note,
      timezone: req.body?.timezone,
      existingTasks,
    });
    const label = mimeType.startsWith('video/') ? '[video]' : '[image]';
    await prisma.aiMessage.create({ data: { userId, role: 'user', content: req.body?.note ? `${label} ${req.body.note}` : label } });
    await prisma.aiMessage.create({
      data: { userId, role: 'assistant', content: result.message || '', actions: JSON.stringify(result) },
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

app.post('/api/ai/from-media', interpretMediaRoute);
app.post('/api/ai/from-image', interpretMediaRoute);

app.post('/api/ai/transcribe', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const text = await ai.transcribe(req.body?.audio, req.body?.mimeType);
    return res.json({ text });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
});

app.post('/api/ai/confirm', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const actions = req.body?.tasks || [];
  const reschedule = req.body?.reschedule;
  const arrivalReminders = req.body?.arrivalReminders || [];
  try {
    const availablePlaces = arrivalReminders.length
      ? await prisma.place.findMany({ where: { userId } })
      : [];
    const resolvedArrivalPlaces = arrivalReminders.map((item) => {
      const needle = String(item.placeName || item.place || '').toLowerCase().trim();
      return availablePlaces.find((row) => {
        const name = String(row.name || '').toLowerCase();
        return name === needle || name.includes(needle) || needle.includes(name);
      });
    });
    if (resolvedArrivalPlaces.some((place) => !place)) {
      const missing = resolvedArrivalPlaces.findIndex((place) => !place);
      const item = arrivalReminders[missing];
      return res.status(400).json({
        message: `Save a place named “${item.placeName || 'home or work'}” in Integrations first, then confirm again.`,
      });
    }
    const created = [];
    const rescheduled = [];
    for (const item of actions) {
      const duration = item.durationMinutes
        ? `${Math.floor(item.durationMinutes / 60)}h ${item.durationMinutes % 60}m`
        : item.duration;
      // Plans ("plan my day/week") reorganize tasks the user already has: move them instead of duplicating.
      const existingTask = item.id
        ? await prisma.task.findFirst({ where: { id: Number(item.id), userId } })
        : null;
      if (existingTask) {
        const updated = await prisma.task.update({
          where: { id: existingTask.id },
          data: {
            dueAt: taskDate(item.date) ?? existingTask.dueAt,
            startTime: item.startTime || existingTask.startTime,
            duration: duration || existingTask.duration,
          },
          include: { categories: { include: { category: true } } },
        });
        rescheduled.push(mapTask(updated));
        continue;
      }
      const task = await prisma.task.create({
        data: taskPayload({
          title: item.title,
          description: item.description,
          dueDate: item.date,
          startTime: item.startTime,
          duration,
          priority: item.priority,
          reminder: Boolean(item.reminder),
          projectId: item.projectId,
          contactName: item.contactName,
          contactPhone: item.contactPhone,
        }, userId),
      });
      created.push(mapTask(task));
      if (item.reminder && item.date) {
        await prisma.reminder.create({
          data: {
            userId,
            taskId: task.id,
            title: `Reminder: ${task.title}`,
            remindAt: taskDate(item.date),
            enabled: true,
            status: 'scheduled',
          },
        });
      }
      await notify(userId, 'Task created', task.title, 'task', 'task', task.id);
    }
    if (reschedule?.taskId || reschedule?.titleHint) {
      const existing = reschedule.taskId
        ? await prisma.task.findFirst({ where: { id: Number(reschedule.taskId), userId } })
        : await prisma.task.findFirst({
          where: { userId, title: { contains: String(reschedule.titleHint) } },
        });
      if (existing) {
        const updated = await prisma.task.update({
          where: { id: existing.id },
          data: {
            dueAt: taskDate(reschedule.date),
            startTime: reschedule.startTime || existing.startTime,
          },
          include: { categories: { include: { category: true } } },
        });
        rescheduled.push(mapTask(updated));
        if (updated.reminderEnabled) {
          await prisma.reminder.updateMany({
            where: { userId, taskId: updated.id, kind: 'time', enabled: true },
            data: { remindAt: taskDate(reschedule.date) },
          });
        }
        await notify(userId, 'Task rescheduled', existing.title, 'schedule', 'task', existing.id);
      }
    }
    const arrivals = [];
    for (const [index, item] of arrivalReminders.entries()) {
      const place = resolvedArrivalPlaces[index];
      const reminder = await prisma.reminder.create({
        data: {
          userId,
          title: String(item.title || `When you arrive at ${place.name}`).trim(),
          remindAt: new Date('2099-01-01T00:00:00.000Z'),
          kind: 'arrival',
          latitude: place.latitude,
          longitude: place.longitude,
          radiusMeters: place.radiusMeters,
          placeName: place.name,
          enabled: true,
          status: 'scheduled',
        },
      });
      arrivals.push(reminder);
      await notify(userId, 'Arrival reminder', reminder.title, 'reminder', 'reminder', reminder.id);
    }
    return res.json({ created, rescheduled, arrivals, ok: true });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get('/api/ai/messages', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const messages = await prisma.aiMessage.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 80 });
  res.json({ messages });
});

const AI_FRIENDLY = {
  AI_NOT_CONFIGURED: 'ORDINA AI is not available right now. You can still add tasks yourself.',
  AI_KEY_REJECTED: 'ORDINA AI is not available right now. You can still add tasks yourself.',
  AI_QUOTA: 'ORDINA AI has reached its usage limit for now. Please try again later.',
  AI_BUSY: 'ORDINA AI is very busy right now. Please try again in a moment.',
  AI_TIMEOUT: 'ORDINA AI took too long to answer. Please try again.',
  AI_SAFETY: 'ORDINA AI can’t help with that request. Try describing your tasks differently.',
  AI_EMPTY: 'ORDINA AI sent back an answer we couldn’t use. Please try again.',
  AI_INVALID: 'ORDINA AI sent back an answer we couldn’t use. Please try again.',
  AI_BAD_REQUEST: 'ORDINA AI couldn’t read that request. Try rephrasing it.',
};

/** Busy tasks sent by the phone in offline mode, reduced to what scheduling needs. */
function clientBusyTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.slice(0, 300).flatMap((task) => {
    const dueDate = String(task?.dueDate || '');
    const startTime = String(task?.startTime || '');
    if (!taskValidation.isValidDateKey(dueDate) || !taskValidation.isValidTime(startTime)) return [];
    const minutes = taskValidation.parseDurationMinutes(task?.duration ?? task?.durationMinutes);
    return [{
      title: String(task?.title || 'Task').slice(0, 200),
      dueDate,
      startTime,
      duration: taskValidation.formatDuration(minutes && minutes >= 5 && minutes <= 1440 ? minutes : 60),
      completed: Boolean(task?.completed),
    }];
  });
}

function cleanAnswers(answers) {
  return (Array.isArray(answers) ? answers : [])
    .slice(0, 5)
    .map((item) => ({ question: String(item?.question || '').trim().slice(0, 300), answer: String(item?.answer || '').trim().slice(0, 300) }))
    .filter((item) => item.question && item.answer);
}

function validTimezone(value) {
  const zone = String(value || '').slice(0, 64);
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** Plain language -> structured plan for review. Nothing is saved until /api/ai/plan/confirm. */
app.post('/api/ai/plan', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ message: 'Tell ORDINA what you need to get done.' });
  if (message.length > 2000) return res.status(400).json({ message: 'That is a bit long. Please keep it under 2,000 characters.' });
  if (!gemini.isConfigured()) {
    return res.status(503).json({ message: AI_FRIENDLY.AI_NOT_CONFIGURED, code: 'AI_NOT_CONFIGURED' });
  }
  const timezone = validTimezone(req.body?.timezone);
  try {
    if (timezone) {
      await prisma.user.updateMany({ where: { id: userId, NOT: { timezone } }, data: { timezone } }).catch(() => undefined);
    }
    await materializeRecurrence(userId);
    // Offline mode: the phone sends its own tasks (busy times for overlap checks, recent tasks
    // for personalization). Gemini still only receives times and habits, never these titles.
    const [serverTasks, profile] = await Promise.all([
      ownedTasks(userId),
      planService.refreshProfile(prisma, userId, [], req.body?.history),
    ]);
    const existingTasks = [...serverTasks, ...clientBusyTasks(req.body?.existingTasks)];
    const plan = await planner.createPlan({
      message,
      answers: cleanAnswers(req.body?.answers),
      keepTasks: req.body?.keepTasks,
      timezone: timezone || undefined,
      clientToday: req.body?.today,
      clientTime: req.body?.localTime,
      existingTasks,
      profile,
    });
    await prisma.aiMessage.create({ data: { userId, role: 'user', content: message } });
    await prisma.aiMessage.create({
      data: { userId, role: 'assistant', content: plan.summary, actions: JSON.stringify({ intent: 'plan', planId: plan.planId }) },
    });
    const { repaired, ...body } = plan;
    return res.json(body);
  } catch (error) {
    const code = error.code && AI_FRIENDLY[error.code] ? error.code : 'AI_ERROR';
    // Log the failure type only, never the user's request or tasks.
    console.error('AI plan failed:', code, error.status || 500);
    return res.status(code === 'AI_ERROR' ? 500 : error.status || 502).json({
      message: AI_FRIENDLY[code] || 'Something went wrong while planning. Please try again.',
      code,
    });
  }
});

/** Offline mode: the phone saved the plan itself; learn from the user's corrections. */
app.post('/api/ai/plan/learn', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    return res.json(await planService.learnFromPlan(prisma, userId, { tasks: req.body?.tasks, history: req.body?.history }));
  } catch (error) {
    if (error.status && error.status < 500) return res.status(error.status).json({ message: error.message });
    console.error('AI plan learn failed:', error.code || error.message);
    return res.status(500).json({ message: 'Could not update your planning preferences.' });
  }
});

/** Saves the reviewed plan into the normal task list, exactly once per idempotency key. */
app.post('/api/ai/plan/confirm', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    const result = await planService.confirmPlan(prisma, userId, {
      idempotencyKey: req.body?.idempotencyKey,
      tasks: req.body?.tasks,
    }, { taskPayload, setTaskCategory, setTaskDeadline, mapTask, include: TASK_INCLUDE });
    return res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).json({ message: error.message, code: error.code, errors: error.errors });
    }
    console.error('AI plan confirm failed:', error.message);
    return res.status(500).json({ message: 'Your plan could not be saved. Please try again.' });
  }
});

app.post('/api/ai/schedule', async (req, res) => {
  req.body = { ...req.body, message: req.body?.prompt || req.body?.message };
  const userId = requireUser(req, res);
  if (!userId) return;
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ message: 'A message is required.' });
  try {
    await materializeRecurrence(userId);
    const result = await ai.interpret({
      message,
      timezone: req.body?.timezone,
      existingTasks: [
        ...await ownedTasks(userId),
        ...calendarBusyTasks(req.body?.calendarEvents),
      ],
      contacts: req.body?.contacts,
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { value, errors } = taskValidation.validateTaskInput(req.body);
  if (Object.keys(errors).length) return validationFailure(res, errors);
  try {
    const data = taskPayload({ ...req.body, ...value }, userId);
    const created = await prisma.task.create({ data });
    await setTaskCategory(userId, created.id, value.category);
    await setTaskDeadline(created.id, value.deadline);
    if (data.reminderEnabled && data.dueAt) {
      await prisma.reminder.create({
        data: { userId, taskId: created.id, title: `Reminder: ${created.title}`, remindAt: data.dueAt, enabled: true, status: 'scheduled' },
      });
    }
    const task = await prisma.task.findUnique({ where: { id: created.id }, include: TASK_INCLUDE });
    res.status(201).json({ task: mapTask(task) });
  } catch (error) {
    console.error('Create task failed:', error.message);
    res.status(500).json({ message: 'Unable to create the task. Please try again.' });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { value, errors } = taskValidation.validateTaskInput(req.body, { partial: true });
  if (Object.keys(errors).length) return validationFailure(res, errors);
  try {
    const existing = await prisma.task.findFirst({ where: { id: Number(req.params.id), userId } });
    if (!existing) return res.status(404).json({ message: 'Task not found.' });
    await prisma.task.update({ where: { id: existing.id }, data: taskPayload({ ...req.body, ...value }, userId, existing) });
    await setTaskCategory(userId, existing.id, value.category);
    await setTaskDeadline(existing.id, value.deadline);
    const task = await prisma.task.findUnique({ where: { id: existing.id }, include: TASK_INCLUDE });
    res.json({ task: mapTask(task) });
  } catch (error) {
    console.error('Update task failed:', error.message);
    res.status(500).json({ message: 'Unable to update the task. Please try again.' });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const { count } = await prisma.task.deleteMany({ where: { id: Number(req.params.id), userId } });
  if (!count) return res.status(404).json({ message: 'Task not found.' });
  res.status(204).end();
});

app.patch('/api/tasks/:id/complete', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const existing = await prisma.task.findFirst({ where: { id: Number(req.params.id), userId } });
  if (!existing) return res.status(404).json({ message: 'Task not found.' });
  const completed = Boolean(req.body?.completed);
  if (completed && existing.recurrence !== 'none' && !existing.parentTaskId) {
    const dateKey = schedule.toDateKey(new Date());
    const instance = await prisma.task.findFirst({ where: { parentTaskId: existing.id, occurrenceDate: dateKey } });
    if (instance) {
      await prisma.task.update({ where: { id: instance.id }, data: { status: 'completed', completedAt: new Date() } });
    } else {
      await prisma.task.create({
        data: {
          userId,
          parentTaskId: existing.id,
          title: existing.title,
          description: existing.description,
          status: 'completed',
          priority: existing.priority,
          occurrenceDate: dateKey,
          dueAt: new Date(`${dateKey}T12:00:00.000Z`),
          completedAt: new Date(),
          recurrence: 'none',
        },
      });
    }
    return res.json({ ok: true, seriesRemainsOpen: true });
  }
  await prisma.task.update({
    where: { id: existing.id },
    data: { status: completed ? 'completed' : 'pending', completedAt: completed ? new Date() : null },
  });
  res.json({ ok: true });
});

app.get('/api/dashboard', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await materializeRecurrence(userId);
    const tasks = await ownedTasks(userId);
    for (const task of tasks.filter((item) => !item.completed && item.dueDate).slice(0, 30)) {
      const due = new Date(`${task.dueDate}T${task.startTime || '09:00'}:00`);
      const hours = (due.getTime() - Date.now()) / 3600000;
      if (hours <= 0 || hours > 48) continue;
      const exists = await prisma.notification.findFirst({
        where: { userId, relatedType: 'task', relatedId: Number(task.id), type: 'deadline' },
      });
      if (!exists) {
        await notify(userId, 'Upcoming deadline', task.title, 'deadline', 'task', Number(task.id));
      }
    }
    res.json({ tasks, recommendation: schedule.recommendNow(tasks), overwhelm: schedule.overwhelmPlan(tasks) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load dashboard tasks.', error: error.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await materializeRecurrence(userId);
    res.json({ tasks: await ownedTasks(userId) });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load tasks.', error: error.message });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const project = await prisma.project.findFirst({ where: { id: Number(req.params.id), userId }, include: { tasks: true } });
  if (!project) return res.status(404).json({ message: 'Project not found.' });
  const completed = project.tasks.filter((task) => task.status === 'completed').length;
  res.json({
    project: {
      ...project,
      id: String(project.id),
      progress: project.tasks.length ? Math.round((completed / project.tasks.length) * 100) : 0,
      tasksTotal: project.tasks.length,
      tasksCompleted: completed,
    },
  });
});

app.delete('/api/notifications/:id', async (req, res) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  await prisma.notification.deleteMany({ where: { id: Number(req.params.id), userId } });
  res.json({ ok: true });
});

process.on('uncaughtException', (error) => {
  console.error('ORDINA uncaught exception', error);
});
process.on('unhandledRejection', (error) => {
  console.error('ORDINA unhandled rejection', error);
});
process.on('exit', (code) => {
  console.log(`ORDINA process exiting with code ${code}`);
});

async function start() {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (isProduction && (jwtSecret.length < 32 || /replace/i.test(jwtSecret))) {
    console.error('ORDINA: JWT_SECRET must be set to a long random value (32+ characters) in production.');
    process.exitCode = 1;
    return;
  }
  try {
    await prisma.$connect();
    console.log('ORDINA db: connected');
  } catch (error) {
    console.error('ORDINA db: failed to connect', error);
    process.exitCode = 1;
    return;
  }

  if (!gemini.isConfigured()) {
    console.warn('ORDINA AI: GEMINI_API_KEY is not set. AI planning will answer "not available" until it is set (backend .env locally, environment variable in production).');
  } else {
    console.log(`ORDINA AI: Gemini model ${gemini.configuredModel()}`);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ORDINA backend listening on http://0.0.0.0:${port}`);
  });
}

start();
