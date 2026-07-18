import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { prisma } from './utils/db';
import dotenv from 'dotenv';
import fileRoutes from './routes/fileRoutes';
import authRoutes from './routes/authRoutes';

// Load environment variables
dotenv.config();
const fastify: FastifyInstance = Fastify({
  logger: true,
});

// Register plugins
fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size for multipart streaming
  }
});

fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'super_secret_fallback'
});

// Decorate request with authenticate method
fastify.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify()
  } catch (err) {
    reply.send(err)
  }
});

// Register routes
fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(fileRoutes, { prefix: '/api/files' });

// Initialize background workers
import './queues/integrityQueue';
import './queues/replicationQueue';

// Basic Health Check Route
fastify.get('/health', async (request, reply) => {
  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
  } catch (error) {
    fastify.log.error(error);
    reply.status(500).send({ status: 'error', db: 'disconnected' });
  }
});

// Start the server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8000', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    fastify.log.info(`Server listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
