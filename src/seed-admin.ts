import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email || !password) {
    console.log('[SeedAdmin] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed.');
    await pool.end();
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN', password: hashedPassword }
    });
    console.log(`[SeedAdmin] User "${email}" updated to ADMIN role.`);
  } else {
    await prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'ADMIN' }
    });
    console.log(`[SeedAdmin] Admin user "${email}" created successfully.`);
  }

  await pool.end();
}

seedAdmin().catch((err) => {
  console.error('[SeedAdmin] Seed failed:', err);
  process.exit(1);
});
