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
  const email = 'batman69';
  const password = 'Winedine@69';
  const name = 'Admin';

  const hashedPassword = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Promote to admin if already exists
    await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN', password: hashedPassword }
    });
    console.log(`✅ User "${email}" updated to ADMIN role.`);
  } else {
    await prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'ADMIN' }
    });
    console.log(`✅ Admin user "${email}" created successfully.`);
  }

  await pool.end();
}

seedAdmin().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
