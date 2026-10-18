import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import router from './routes/index.js'; // <- Central routes index import kora holo

const app = express();

// Global Middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// API Routes (Central router mounted here)
app.use('/api/v1', router);

// Health Route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API is running successfully with ES Modules!',
  });
});

export default app;