require('./config/env');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');

const errorHandler   = require('./middleware/errorHandler');
const authRoutes     = require('./routes/auth.routes');
const adminRoutes    = require('./routes/admin.routes');
const lessonRoutes   = require('./routes/lesson.routes');
const hardwareRoutes = require('./routes/hardware.routes');
const captureRoutes  = require('./routes/capture.routes');
const audioRecordingRoutes = require('./routes/audio-recording.routes');
const recognitionRoutes = require('./routes/recognition.routes');
const transcriptionRoutes = require('./routes/transcription.routes');
const lessonMaterialRoutes = require('./routes/lesson-material.routes');
const lessonContextRoutes = require('./routes/lesson-context.routes');
const lessonIntelligenceRoutes = require('./routes/lesson-intelligence.routes');
const lessonChatRoutes = require('./routes/lesson-chat.routes');
const phase6Routes = require('./routes/phase6.routes');
const { sectionRouter, enrollRouter } = require('./routes/section.routes');
const sectionService = require('./services/section.service');
const authenticate   = require('./middleware/authenticate');
const { authorizeActive } = require('./middleware/authorize');
const asyncHandler   = require('./utils/asyncHandler');
const { createRateLimiter } = require('./middleware/rateLimit');
const { API_RATE_LIMIT_MAX, TRUST_PROXY_HOPS, FRONTEND_URL } = require('./config/env');

const app = express();
// One trusted hop: browser -> Cloudflare tunnel -> this Express app.
// This must precede rate limiters and any middleware that reads req.ip.
app.set('trust proxy', TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health checks must never consume the application request budget.
app.get('/api/health', (_req,res) => res.json({ success:true, message:'SEA-IT-SOLVED API is running.' }));

const apiLimiter = createRateLimiter({
  name: 'general-api',
  windowMs: 15 * 60 * 1000,
  max: API_RATE_LIMIT_MAX,
  message: 'Too many requests. Please wait a moment and try again.',
  skip: req => {
    // These endpoints have their own focused limiters. Skipping them here
    // prevents accidental limiter stacking while retaining route protection.
    if (req.method === 'POST' && /^\/auth\/(?:login|register\/(?:student|instructor)|forgot-password|reset-password(?:\/validate)?|verify-email(?:\/resend)?)\/?$/.test(req.path)) return true;
    if (req.method === 'GET' && /^\/student\/lessons\/[^/]+\/export\/(?:pdf|docx)\/?$/.test(req.path)) return true;
    if (req.method === 'GET' && /^\/(?:lessons\/[^/]+\/(?:recognitions|transcription)|captures\/[^/]+\/recognition)\/?$/.test(req.path)) return true;
    if (req.method === 'POST' && /^\/student\/attempts\/[^/]+\/tutor(?:\/practice)?\/?$/.test(req.path)) return true;
    return req.method === 'POST' && /^\/(?:instructor\/quiz-answers\/[^/]+\/(?:recognize|analyze)|solution-submissions\/[^/]+\/analyze)\/?$/.test(req.path);
  },
});

app.use('/api', apiLimiter);

app.use('/api/auth',        authRoutes);
app.use('/api/admin',       adminRoutes);
app.use('/api/sections',    sectionRouter);
app.use('/api/enrollments', enrollRouter);
app.use('/api',             lessonRoutes);
app.use('/api/hardware',    hardwareRoutes);
app.use('/api',             captureRoutes);
app.use('/api',             audioRecordingRoutes);
app.use('/api',             recognitionRoutes);
app.use('/api',             transcriptionRoutes);
app.use('/api',             lessonMaterialRoutes);
app.use('/api',             lessonContextRoutes);
app.use('/api',             lessonIntelligenceRoutes);
app.use('/api',             lessonChatRoutes);
app.use('/api',             phase6Routes);

app.get('/api/subjects',
  authenticate, authorizeActive('INSTRUCTOR','ADMIN'),
  asyncHandler(async (_req,res) => {
    const subjects = await sectionService.getSubjects();
    res.json({ success:true, data:{ subjects } });
  })
);

app.use((req,res) => res.status(404).json({ success:false, error:`Route not found: ${req.method} ${req.path}` }));
app.use(errorHandler);
module.exports = app;

