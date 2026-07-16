import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../utils/redis';
import { prisma } from '../utils/db';
import { DiscordProvider } from '../storage/DiscordProvider';
import crypto from 'crypto';

export const integrityQueue = new Queue('integrityCheck', {
  connection: redisConnection,
});

// A shared discord provider just for the worker
const discordProvider = new DiscordProvider(
  'discord-worker',
  process.env.DISCORD_BOT_TOKEN || '',
  process.env.DISCORD_CHANNEL_ID || ''
);

export const integrityWorker = new Worker(
  'integrityCheck',
  async (job: Job) => {
    console.log(`[IntegrityWorker] Processing job ${job.id}`);
    
    await discordProvider.initialize();

    // 1. Find a replication that hasn't been verified in the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const replication = await prisma.replication.findFirst({
      where: {
        status: 'READY',
        provider: { type: 'DISCORD' },
        OR: [
          { lastVerifiedAt: null },
          { lastVerifiedAt: { lt: yesterday } }
        ]
      },
      include: {
        chunk: true
      },
      orderBy: {
        lastVerifiedAt: 'asc' // Oldest verified first
      }
    });

    if (!replication) {
      console.log('[IntegrityWorker] No replications need verification at this time.');
      return;
    }

    console.log(`[IntegrityWorker] Verifying replication ${replication.id} for chunk ${replication.chunkId}...`);

    try {
      // 2. Download the chunk
      const chunkData = await discordProvider.downloadChunk(replication.externalId);
      
      // 3. Verify hash
      const hash = crypto.createHash('sha256').update(chunkData).digest('hex');
      
      if (hash === replication.chunk.hash) {
        // Success
        await prisma.replication.update({
          where: { id: replication.id },
          data: { 
            lastVerifiedAt: new Date(),
            status: 'READY' 
          }
        });
        console.log(`[IntegrityWorker] Replication ${replication.id} is healthy.`);
      } else {
        // Hash mismatch!
        throw new Error(`Hash mismatch! Expected ${replication.chunk.hash}, got ${hash}`);
      }
    } catch (error: any) {
      console.error(`[IntegrityWorker] Replication ${replication.id} is corrupted! Error:`, error.message);
      
      await prisma.replication.update({
        where: { id: replication.id },
        data: { 
          lastVerifiedAt: new Date(),
          status: 'CORRUPTED' 
        }
      });
      
      // We could also enqueue a replication job here to fix it!
    }
  },
  { connection: redisConnection }
);

// We can call this via an external cron job or an API endpoint
export async function scheduleIntegrityCheck() {
  await integrityQueue.add('verify-chunk', {}, {
    removeOnComplete: true,
    removeOnFail: 100 // Keep last 100 failed jobs
  });
}
