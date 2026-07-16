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
        user: { id: user.id, email: user.email, name: user.name }
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

      const token = fastify.jwt.sign({ id: user.id, email: user.email, role: user.role });
      
      return reply.send({
        success: true,
        token,
        user: { id: user.id, email: user.email, name: user.name }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
}
