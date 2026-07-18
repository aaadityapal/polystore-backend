"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const db_1 = require("./utils/db");
const dotenv_1 = __importDefault(require("dotenv"));
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
// Load environment variables
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({
    logger: true,
});
// Register plugins
fastify.register(cors_1.default, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
});
fastify.register(multipart_1.default, {
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size for multipart streaming
    }
});
fastify.register(jwt_1.default, {
    secret: process.env.JWT_SECRET || 'super_secret_fallback'
});
// Decorate request with authenticate method
fastify.decorate('authenticate', async function (request, reply) {
    try {
        await request.jwtVerify();
    }
    catch (err) {
        reply.send(err);
    }
});
// Register routes
fastify.register(authRoutes_1.default, { prefix: '/api/auth' });
fastify.register(fileRoutes_1.default, { prefix: '/api/files' });
// Initialize background workers
require("./queues/integrityQueue");
require("./queues/replicationQueue");
// Basic Health Check Route
fastify.get('/health', async (request, reply) => {
    try {
        // Check DB connection
        await db_1.prisma.$queryRaw `SELECT 1`;
        return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
    }
    catch (error) {
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
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
//# sourceMappingURL=index.js.map