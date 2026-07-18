import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '@fastify/jwt';
import { FileService } from '../services/FileService';
import { prisma } from '../utils/db';
const fileService = new FileService();

// Initialize the file service (and discord provider) before we accept requests
fileService.initialize().catch(err => {
  console.error("Failed to initialize FileService:", err);
});

export default async function fileRoutes(fastify: FastifyInstance) {
  // Apply authentication to all file routes
  fastify.addHook('onRequest', async (request, reply) => {
    // If it's a download request with a token in the query string, we manually verify it in the route
    if ((request.query as any)?.token && request.url.includes('/download/')) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized. Please login.' });
    }
  });

  // POST /api/files/upload
  fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    // request.user is populated by jwtVerify()
    const user = (request as any).user;

    // Parse the multipart data
    const parts = request.parts();
    
    for await (const part of parts) {
      if (part.type === 'file') {
        const { filename, mimetype, file } = part;
        
        try {
          const fileSizeHint = Number(request.headers['content-length']) || 0;
          const resultFile = await fileService.uploadFile(
            user.id,
            filename,
            mimetype,
            file,
            fileSizeHint
          );
          
          return reply.send({ success: true, file: resultFile });
        } catch (err: any) {
          fastify.log.error(err);
          return reply.status(500).send({ success: false, error: err.message });
        }
      }
    }
    
    return reply.status(400).send({ success: false, error: 'No file part found in request' });
  });

  // GET /api/files/download/:id
  fastify.get('/download/:id', async (request: FastifyRequest<{ Params: { id: string }, Querystring: { token?: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    let user: any;

    try {
      if (request.query.token) {
        user = fastify.jwt.verify(request.query.token);
      } else {
        user = (request as any).user;
      }
    } catch (err) {
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
      
    } catch (err: any) {
      fastify.log.error(err);
      if (err.message === 'File not found' || err.message === 'Unauthorized access to file') {
        return reply.status(404).send({ success: false, error: 'File not found or unauthorized' });
      }
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /api/files
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    // Returns list of files (for dashboard) — excludes soft-deleted files
    const files = await prisma.file.findMany({
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
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const user = (request as any).user;
    const { id } = request.params;

    try {
      const file = await prisma.file.findUnique({ where: { id } });

      if (!file || file.userId !== user.id) {
        return reply.status(404).send({ success: false, error: 'File not found or unauthorized' });
      }

      await prisma.file.update({
        where: { id },
        data: { deletedAt: new Date() }
      });

      return reply.send({ success: true, message: 'File deleted' });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // Test route to manually trigger integrity check
  fastify.post('/test-integrity', async (request: FastifyRequest, reply: FastifyReply) => {
    const { scheduleIntegrityCheck } = await import('../queues/integrityQueue');
    await scheduleIntegrityCheck();
    reply.send({ success: true, message: 'Integrity check scheduled!' });
  });

  // Test route to manually trigger a dummy replication
  fastify.post('/test-replication', async (request: FastifyRequest, reply: FastifyReply) => {
    const { scheduleReplication } = await import('../queues/replicationQueue');
    await scheduleReplication('dummy-chunk-id-1234', 'GOOGLE_DRIVE');
    reply.send({ success: true, message: 'Replication scheduled!' });
  });
}
