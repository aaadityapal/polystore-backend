"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const cors_1 = __importDefault(require("@fastify/cors"));
const db_1 = require("./utils/db");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({
    logger: true,
    bodyLimit: 104857600, // 100MB limit for non-streamed uploads (though we'll use streaming)
});
// Register plugins
fastify.register(cors_1.default, {
    origin: '*', // For development, allow all
});
fastify.register(multipart_1.default, {
    limits: {
        fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size for multipart streaming
    }
});
// Import and register routes
const fileRoutes_1 = __importDefault(require("./routes/fileRoutes"));
fastify.register(fileRoutes_1.default, { prefix: '/api/files' });
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