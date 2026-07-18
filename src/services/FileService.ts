import { prisma } from '../utils/db';
import { DiscordProvider } from '../storage/DiscordProvider';
import { TelegramProvider } from '../storage/TelegramProvider';
import { IStorageProvider } from '../storage/IStorageProvider';
import crypto from 'crypto';

// ─── Chunk sizes ──────────────────────────────────────────────────────────────
const DISCORD_CHUNK_SIZE  = 8 * 1024 * 1024;          //  8 MB  — Discord bot limit
const TELEGRAM_CHUNK_SIZE = 40 * 1024 * 1024;         //  40 MB — per user request

// ─── Routing threshold ────────────────────────────────────────────────────────
const TELEGRAM_THRESHOLD = 500 * 1024 * 1024;          //  500 MB

export class FileService {
  private discordProvider: DiscordProvider;
  private telegramProvider: TelegramProvider | null = null;

  constructor() {
    this.discordProvider = new DiscordProvider(
      'discord-main',
      process.env.DISCORD_BOT_TOKEN || '',
      process.env.DISCORD_CHANNEL_ID || ''
    );

    // Telegram is optional — only initialised if env vars are present
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID) {
      this.telegramProvider = new TelegramProvider(
        'telegram-main',
        process.env.TELEGRAM_BOT_TOKEN,
        process.env.TELEGRAM_CHANNEL_ID
      );
    }
  }

  async initialize() {
    await this.discordProvider.initialize();
    if (this.telegramProvider) {
      await this.telegramProvider.initialize();
    }
  }

  /**
   * Pick the right provider and chunk size based on total file size.
   * - ≤ 500 MB → Discord  (8 MB chunks, fast for small files)
   * - >  500 MB → Telegram (1.9 GB chunks, efficient for large files)
   *   Falls back to Discord if Telegram is not configured.
   */
  private selectProvider(totalBytes: number): { provider: IStorageProvider; chunkSize: number } {
    if (totalBytes > TELEGRAM_THRESHOLD && this.telegramProvider) {
      console.log(`[FileService] ${(totalBytes / 1024 / 1024).toFixed(1)} MB > 500 MB → routing to Telegram`);
      return { provider: this.telegramProvider, chunkSize: TELEGRAM_CHUNK_SIZE };
    }
    console.log(`[FileService] ${(totalBytes / 1024 / 1024).toFixed(1)} MB ≤ 500 MB → routing to Discord`);
    return { provider: this.discordProvider, chunkSize: DISCORD_CHUNK_SIZE };
  }

  async uploadFile(
    userId: string,
    originalName: string,
    mimeType: string,
    fileStream: AsyncIterable<Buffer>,
    fileSizeHint: number
  ) {
    // 1. Select provider based on total size hint
    const { provider, chunkSize } = this.selectProvider(fileSizeHint);

    // 2. Fetch or create StorageProvider DB record
    let providerRecord = await prisma.storageProvider.findFirst({
      where: { type: provider.type },
    });
    if (!providerRecord) {
      providerRecord = await prisma.storageProvider.create({
        data: {
          name: provider.type === 'TELEGRAM' ? 'Telegram Main' : 'Discord Main',
          type: provider.type,
          isActive: true,
        },
      });
    }

    // 3. Create file record
    const file = await prisma.file.create({
      data: {
        originalName,
        mimeType,
        size: 0,
        hash: '',
        status: 'UPLOADING',
        userId,
      },
    });

    try {
      let currentChunks: Buffer[] = [];
      let currentChunksSize = 0;
      const fileHasher = crypto.createHash('sha256');
      let totalSize = 0n;
      let chunkIndex = 0;

      for await (const chunkData of fileStream) {
        fileHasher.update(chunkData);
        totalSize += BigInt(chunkData.length);
        
        currentChunks.push(chunkData);
        currentChunksSize += chunkData.length;

        if (currentChunksSize >= chunkSize) {
          let buffer = Buffer.concat(currentChunks);
          
          while (buffer.length >= chunkSize) {
            const chunkToUpload = buffer.subarray(0, chunkSize);
            buffer = buffer.subarray(chunkSize);
            
            await this.processChunk(file.id, chunkToUpload, chunkIndex, providerRecord.id, provider);
            chunkIndex++;
          }
          
          // Keep the remainder for the next batch (make a copy to free the large buffer)
          if (buffer.length > 0) {
            currentChunks = [Buffer.from(buffer)];
            currentChunksSize = buffer.length;
          } else {
            currentChunks = [];
            currentChunksSize = 0;
          }
        }
      }

      if (currentChunksSize > 0) {
        const finalBuffer = Buffer.concat(currentChunks);
        await this.processChunk(file.id, finalBuffer, chunkIndex, providerRecord.id, provider);
      }

      // 4. Finalize file record
      const finalHash = fileHasher.digest('hex');
      const updatedFile = await prisma.file.update({
        where: { id: file.id },
        data: { size: totalSize, hash: finalHash, status: 'READY' },
      });

      return { ...updatedFile, size: updatedFile.size.toString() };

    } catch (error) {
      await prisma.file.update({
        where: { id: file.id },
        data: { status: 'CORRUPTED' },
      });
      throw error;
    }
  }

  private async processChunk(
    fileId: string,
    data: Buffer,
    chunkIndex: number,
    providerId: string,
    provider: IStorageProvider
  ) {
    const chunkHash = crypto.createHash('sha256').update(data).digest('hex');

    const chunkRecord = await prisma.chunk.create({
      data: { fileId, chunkIndex, size: data.length, hash: chunkHash, status: 'UPLOADING' },
    });

    const { externalId, externalUrl } = await provider.uploadChunk(
      data,
      `${provider.type.toLowerCase()}-chunk-${chunkIndex}.bin`
    );

    await prisma.$transaction([
      prisma.replication.create({
        data: { chunkId: chunkRecord.id, providerId, externalId, externalUrl, status: 'READY' },
      }),
      prisma.chunk.update({
        where: { id: chunkRecord.id },
        data: { status: 'UPLOADED' },
      }),
    ]);

    // Trigger background replication for this chunk
    const { scheduleReplication } = await import('../queues/replicationQueue');
    await scheduleReplication(chunkRecord.id, 'ALL');
  }

  async downloadFile(fileId: string, userId: string) {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          include: {
            replications: {
              where: { status: 'READY' },
              include: { provider: true },
            },
          },
        },
      },
    });

    if (!file)                    throw new Error('File not found');
    if (file.userId !== userId)   throw new Error('Unauthorized access to file');
    if (file.status !== 'READY')  throw new Error(`File is not ready (Status: ${file.status})`);

    const discordProvider  = this.discordProvider;
    const telegramProvider = this.telegramProvider;

    async function* generateStream() {
      for (const chunk of file!.chunks) {
        if (chunk.replications.length === 0) {
          throw new Error(`Chunk ${chunk.chunkIndex} has no valid replications!`);
        }

        const rep          = chunk.replications[0]!;
        const providerType = rep.provider?.type ?? 'DISCORD';

        // Pick the right provider to download from
        let chunkData: Buffer;
        if (providerType === 'TELEGRAM' && telegramProvider) {
          chunkData = await telegramProvider.downloadChunk(rep.externalId);
        } else {
          chunkData = await discordProvider.downloadChunk(rep.externalId);
        }

        // Integrity check
        const hash = crypto.createHash('sha256').update(chunkData).digest('hex');
        if (hash !== chunk.hash) {
          throw new Error(`Integrity check failed for chunk ${chunk.chunkIndex}`);
        }

        yield chunkData;
      }
    }

    return { file, stream: generateStream() };
  }
}
