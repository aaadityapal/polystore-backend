import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const reps = await prisma.replication.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { provider: true }
  });
  console.log(reps.map((c: any) => ({ provider: c.provider.name, status: c.status })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
