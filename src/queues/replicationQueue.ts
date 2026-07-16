import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../utils/redis';
import { prisma } from '../utils/db';
import { DiscordProvider } from '../storage/DiscordProvider';

export const replicationQueue = new Queue('replication', {
  connection: redisConnection,
});

export const replicationWorker = new Worker(
  'replication',
  async (job: Job) => {
    const { chunkId, targetProviderType } = job.data;
    console.log(`[ReplicationWorker] Processing chunk ${chunkId}...`);
    
    // 1. Check if backup channel is configured
    const backupChannelId = process.env.DISCORD_BACKUP_CHANNEL_ID;
    if (!backupChannelId) {
      console.log(`[ReplicationWorker] DISCORD_BACKUP_CHANNEL_ID not set. Skipping replication.`);
      return;
    }

    // 2. Register/Find the backup provider in DB
    let backupProvider = await prisma.storageProvider.findUnique({
      where: { name: 'Discord Backup' }
    });
    
    if (!backupProvider) {
      backupProvider = await prisma.storageProvider.create({
        data: {
          name: 'Discord Backup',
          type: 'DISCORD',
          isActive: true
        }
      });
    }

    // 3. Fetch the chunk and its existing replications
    const chunk = await prisma.chunk.findUnique({
      where: { id: chunkId },
      include: {
        replications: true,
        file: true
      }
    });

    if (!chunk) throw new Error('Chunk not found');

    // 4. Check if a replication already exists for this provider
    const alreadyReplicated = chunk.replications.some(rep => rep.providerId === backupProvider!.id);
    if (alreadyReplicated) {
      console.log(`[ReplicationWorker] Chunk ${chunkId} is already replicated to Discord Backup.`);
      return;
    }

    // 5. Get the primary replication to download from
    const primaryRep = chunk.replications[0];
    if (!primaryRep) throw new Error('No primary replication available to read from');

    // 6. Download from Primary
    const primaryProvider = new DiscordProvider(
      'discord-main', 
      process.env.DISCORD_BOT_TOKEN || '', 
      process.env.DISCORD_CHANNEL_ID || ''
    );
    await primaryProvider.initialize();
    console.log(`[ReplicationWorker] Downloading chunk from primary server...`);
    const chunkData = await primaryProvider.downloadChunk(primaryRep.externalId);

    // 7. Upload to Secondary
    const secondaryProvider = new DiscordProvider(
      'discord-backup',
      process.env.DISCORD_BOT_TOKEN || '',
      backupChannelId
    );
    await secondaryProvider.initialize();
    
    console.log(`[ReplicationWorker] Uploading chunk to secondary server...`);
    const { externalId, externalUrl } = await secondaryProvider.uploadChunk(chunkData, `backup-chunk-${chunk.chunkIndex}.bin`);

    // 8. Save new replication record
    await prisma.replication.create({
      data: {
        chunkId: chunk.id,
        providerId: backupProvider.id,
        externalId,
        externalUrl,
        status: 'READY'
      }
    });

    console.log(`[ReplicationWorker] Successfully replicated chunk ${chunkId} to Discord Backup!`);
  },
  { connection: redisConnection }
);

export async function scheduleReplication(chunkId: string, targetProviderType: string) {
  await replicationQueue.add('replicate-chunk', { chunkId, targetProviderType }, {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
}
