"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = fileRoutes;
require("@fastify/jwt");
const FileService_1 = require("../services/FileService");
const db_1 = require("../utils/db");
const fileService = new FileService_1.FileService();
// Initialize the file service (and discord provider) before we accept requests
fileService.initialize().catch(err => {
    console.error("Failed to initialize FileService:", err);
});
async function fileRoutes(fastify) {
    // Apply authentication to all file routes
    fastify.addHook('onRequest', async (request, reply) => {
        // If it's a download request with a token in the query string, we manually verify it in the route
        if (request.query?.token && request.url.includes('/download/')) {
            return;
        }
        try {
            await request.jwtVerify();
        }
        catch (err) {
            reply.status(401).send({ error: 'Unauthorized. Please login.' });
        }
    });
    // POST /api/files/upload
    fastify.post('/upload', async (request, reply) => {
        // request.user is populated by jwtVerify()
        const user = request.user;
        // Parse the multipart data
        const parts = request.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                const { filename, mimetype, file } = part;
                try {
                    const fileSizeHint = Number(request.headers['content-length']) || 0;
                    const resultFile = await fileService.uploadFile(user.id, filename, mimetype, file, fileSizeHint);
                    return reply.send({ success: true, file: resultFile });
                }
                catch (err) {
                    fastify.log.error(err);
                    return reply.status(500).send({ success: false, error: err.message });
                }
            }
        }
        return reply.status(400).send({ success: false, error: 'No file part found in request' });
    });
    // GET /api/files/download/:id
    fastify.get('/download/:id', async (request, reply) => {
        const { id } = request.params;
        let user;
        try {
            if (request.query.token) {
                user = fastify.jwt.verify(request.query.token);
            }
            else {
                user = request.user;
            }
        }
        catch (err) {
            return reply.status(401).send({ error: 'Invalid or expired token' });
        }
        try {
            const { file, stream } = await fileService.downloadFile(id, user.id);
            // Set headers for download
            reply.header('Content-Disposition', `attachment; filename="${file.originalName}"`);
            reply.header('Content-Type', file.mimeType);
            reply.header('Content-Length', file.size.toString());
            const { Readable } = require('stream');
            const readableStream = Readable.from(stream);
            return reply.send(readableStream);
        }
        catch (err) {
            fastify.log.error(err);
            if (err.message === 'File not found' || err.message === 'Unauthorized access to file') {
                return reply.status(404).send({ success: false, error: 'File not found or unauthorized' });
            }
            return reply.status(500).send({ success: false, error: err.message });
        }
    });
    // GET /api/files
    fastify.get('/', async (request, reply) => {
        const user = request.user;
        // Returns list of files (for dashboard) — excludes soft-deleted files
        const files = await db_1.prisma.file.findMany({
            where: { userId: user.id, deletedAt: null },
            orderBy: { createdAt: 'desc' }
        });
        // Serialize bigints
        const serialized = files.map(f => ({
            ...f,
            size: f.size.toString()
        }));
        return reply.send({ success: true, files: serialized });
    });
    // DELETE /api/files/:id — Soft delete (sets deletedAt, never removes from Discord)
    fastify.delete('/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        try {
            const file = await db_1.prisma.file.findUnique({ where: { id } });
            if (!file || file.userId !== user.id) {
                return reply.status(404).send({ success: false, error: 'File not found or unauthorized' });
            }
            await db_1.prisma.file.update({
                where: { id },
                data: { deletedAt: new Date() }
            });
            return reply.send({ success: true, message: 'File deleted' });
        }
        catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ success: false, error: err.message });
        }
    });
    // Test route to manually trigger integrity check
    fastify.post('/test-integrity', async (request, reply) => {
        const { scheduleIntegrityCheck } = await Promise.resolve().then(() => __importStar(require('../queues/integrityQueue')));
        await scheduleIntegrityCheck();
        reply.send({ success: true, message: 'Integrity check scheduled!' });
    });
    // Test route to manually trigger a dummy replication
    fastify.post('/test-replication', async (request, reply) => {
        const { scheduleReplication } = await Promise.resolve().then(() => __importStar(require('../queues/replicationQueue')));
        await scheduleReplication('dummy-chunk-id-1234', 'GOOGLE_DRIVE');
        reply.send({ success: true, message: 'Replication scheduled!' });
    });
}
//# sourceMappingURL=fileRoutes.js.map