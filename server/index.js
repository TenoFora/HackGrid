import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import pool from './db.js';
import { errorHandler, router } from './routes.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a secret of at least 32 characters');
}

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.method === 'POST' && req.body === undefined) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  return next();
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', router);
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use(errorHandler);

try {
  await pool.query('SELECT 1');
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => {
    console.log(`HackGrid API listening at http://localhost:${port}`);
  });
} catch (error) {
  console.error('Could not connect to MySQL:', error.message);
  await pool.end();
  process.exitCode = 1;
}
