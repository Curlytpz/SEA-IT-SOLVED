require('./config/env');
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

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

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success:false, error:'Too many requests.' },
  skip: req => {
    if (req.path === '/auth' || req.path.startsWith('/auth/')) return true;
    if (req.method === 'GET' && /^\/student\/lessons\/[^/]+\/export\/(?:pdf|docx)\/?$/.test(req.path)) return true;
    return req.method === 'GET' && /^\/(?:lessons\/[^/]+\/(?:recognitions|transcription|materials|context|intelligence)|captures\/[^/]+\/recognition)\/?$/.test(req.path);
  },
});




const authLimiter = rateLimit({ windowMs:15*60*1000, max:20,  standardHeaders:true, legacyHeaders:false, message:{success:false,error:'Too many login attempts. Try again later.'} });

app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

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

app.get('/api/health', (_req,res) => res.json({ success:true, message:'SEA-IT-SOLVED API is running.' }));
app.use((req,res) => res.status(404).json({ success:false, error:`Route not found: ${req.method} ${req.path}` }));
app.use(errorHandler);
module.exports = app;

