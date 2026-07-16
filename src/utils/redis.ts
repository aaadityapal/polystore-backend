import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const host = process.env.REDIS_HOST || 'localhost';
const port = parseInt(process.env.REDIS_PORT || '6379', 10);

// BullMQ requires maxRetriesPerRequest: null
export const redisConnection = new Redis({
  host,
  port,
  maxRetriesPerRequest: null,
});
