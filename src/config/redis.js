import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis Connection
export const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('connect', () => {
  console.log('Connected to Redis successfully');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});