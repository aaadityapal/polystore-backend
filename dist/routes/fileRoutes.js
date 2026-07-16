"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = fileRoutes;
const FileService_1 = require("../services/FileService");
const db_1 = require("../utils/db");
const fileService = new FileService_1.FileService();
// Initialize the file service (and discord provider) before we accept requests
fileService.initialize().catch(err => {
    console.error("Failed to initialize FileService:", err);
});
async function fileRoutes(fastify) {
    // POST /api/files/upload
    fastify.post('/upload', async (request, reply) => {
        // 1. Get a test user (since auth isn't implemented yet)
        let user = await db_1.prisma.user.findFirst();
        if (!user) {
            user = await db_1.prisma.user.create({
                data: {
                    email: 'test@polystore.local',
                    name: 'Test User',
                    password: 'hashed_password_placeholder', // Dummy
                }
            });
        }
        // 2. Parse the multipart data
        const parts = request.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                const { filename, mimetype, file } = part;
                try {
                    const resultFile = await fileService.uploadFile(user.id, filename, mimetype, file);
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
        try {
            const { file, stream } = await fileService.downloadFile(id);
            // Set headers for download
            reply.header('Content-Disposition', `attachment; filename="${file.originalName}"`);
            reply.header('Content-Type', file.mimeType);
            // Since it's an async generator, we can convert it to a Readable stream using Readable.from
            // But Fastify can actually handle async generators directly as payload in modern versions!
            const { Readable } = require('stream');
            const readableStream = Readable.from(stream);
            return reply.send(readableStream);
        }
        catch (err) {
            fastify.log.error(err);
            if (err.message === 'File not found') {
                return reply.status(404).send({ success: false, error: 'File not found' });
            }
            return reply.status(500).send({ success: false, error: err.message });
        }
    });
    // GET /api/files
    fastify.get('/', async (request, reply) => {
        // Returns list of files (for dashboard)
        const files = await db_1.prisma.file.findMany({
            orderBy: { createdAt: 'desc' }
        });
        // Serialize bigints
        const serialized = files.map(f => ({
            ...f,
            size: f.size.toString()
        }));
        return reply.send({ success: true, files: serialized });
    });
}
//# sourceMappingURL=fileRoutes.js.map