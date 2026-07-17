import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/signup', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password, name } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    try {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return reply.status(400).send({ error: 'Email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name
        }
      });

      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role });
      
      return reply.status(201).send({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Track last login time
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role });
      
      return reply.send({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // GET /api/auth/admin/users — Admin only: returns all users with storage stats
  fastify.get('/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const caller = (request as any).user;
    if (caller.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Forbidden: Admin only' });
    }

    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          files: {
            where: { deletedAt: null },
            select: { size: true }
          }
        }
      });

      const result = users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        fileCount: u.files.length,
        totalStorage: u.files.reduce((sum, f) => sum + Number(f.size), 0).toString()
      }));

      return reply.send({ success: true, users: result });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}

