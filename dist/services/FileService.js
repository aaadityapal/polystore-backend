"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const db_1 = require("../utils/db");
const DiscordProvider_1 = require("../storage/DiscordProvider");
const crypto_1 = __importDefault(require("crypto"));
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB
class FileService {
    discordProvider;
    constructor() {
        this.discordProvider = new DiscordProvider_1.DiscordProvider('discord-main', process.env.DISCORD_BOT_TOKEN || '', process.env.DISCORD_CHANNEL_ID || '');
    }
    async initialize() {
        await this.discordProvider.initialize();
    }
    async uploadFile(userId, originalName, mimeType, fileStream) {
        // 1. Create pending file record
        const file = await db_1.prisma.file.create({
            data: {
                originalName,
                mimeType,
                size: 0, // Will update later
                hash: '', // Will update later
                status: 'UPLOADING',
                userId,
            },
        });
        // 2. Fetch or create a default StorageProvider record for Discord
        let provider = await db_1.prisma.storageProvider.findFirst({
            where: { type: 'DISCORD' },
        });
        if (!provider) {
            provider = await db_1.prisma.storageProvider.create({
                data: {
                    name: 'Discord Main',
                    type: 'DISCORD',
                    isActive: true,
                },
            });
        }
        const fileHasher = crypto_1.default.createHash('sha256');
        let totalSize = 0n;
        let chunkIndex = 0;
        let buffer = Buffer.alloc(0);
        try {
            for await (const chunkData of fileStream) {
                fileHasher.update(chunkData);
                totalSize += BigInt(chunkData.length);
                buffer = Buffer.concat([buffer, chunkData]);
                while (buffer.length >= CHUNK_SIZE) {
                    const chunkToUpload = buffer.subarray(0, CHUNK_SIZE);
                    buffer = buffer.subarray(CHUNK_SIZE);
                    await this.processChunk(file.id, chunkToUpload, chunkIndex, provider.id);
                    chunkIndex++;
                }
            }
            // Upload remaining data
            if (buffer.length > 0) {
                await this.processChunk(file.id, buffer, chunkIndex, provider.id);
            }
            // Finalize file
            const finalHash = fileHasher.digest('hex');
            const updatedFile = await db_1.prisma.file.update({
                where: { id: file.id },
                data: {
                    size: totalSize,
                    hash: finalHash,
                    status: 'READY',
                },
            });
            return updatedFile;
        }
        catch (error) {
            // Mark as corrupted or failed
            await db_1.prisma.file.update({
                where: { id: file.id },
                data: { status: 'CORRUPTED' },
            });
            throw error;
        }
    }
    async processChunk(fileId, data, chunkIndex, providerId) {
        const chunkHasher = crypto_1.default.createHash('sha256');
        chunkHasher.update(data);
        const chunkHash = chunkHasher.digest('hex');
        // 1. Create chunk record
        const chunkRecord = await db_1.prisma.chunk.create({
            data: {
                fileId,
                chunkIndex,
                size: data.length,
                hash: chunkHash,
                status: 'UPLOADING', // Intermediate state
            },
        });
        // 2. Upload to Discord
        const { externalId, externalUrl } = await this.discordProvider.uploadChunk(data, `chunk-${chunkIndex}.bin`);
        // 3. Create replication record and update chunk status
        await db_1.prisma.$transaction([
            db_1.prisma.replication.create({
                data: {
                    chunkId: chunkRecord.id,
                    providerId,
                    externalId,
                    externalUrl,
                    status: 'READY',
                },
            }),
            db_1.prisma.chunk.update({
                where: { id: chunkRecord.id },
                data: { status: 'UPLOADED' },
            })
        ]);
    }
    async downloadFile(fileId) {
        const file = await db_1.prisma.file.findUnique({
            where: { id: fileId },
            include: {
                chunks: {
                    orderBy: { chunkIndex: 'asc' },
                    include: {
                        replications: {
                            where: { status: 'READY' }
                        }
                    }
                }
            }
        });
        if (!file) {
            throw new Error('File not found');
        }
        if (file.status !== 'READY') {
            throw new Error(`File is not ready (Status: ${file.status})`);
        }
        // Return a generator that yields chunk buffers
        const discordProvider = this.discordProvider;
        async function* generateStream() {
            for (const chunk of file.chunks) {
                if (chunk.replications.length === 0) {
                    throw new Error(`Chunk ${chunk.chunkIndex} has no valid replications!`);
                }
                // Try to download from the first valid replication (Discord)
                // In a more robust system, we would try others if this fails
                const rep = chunk.replications[0];
                const chunkData = await discordProvider.downloadChunk(rep.externalId);
                // Verify hash
                const hash = crypto_1.default.createHash('sha256').update(chunkData).digest('hex');
                if (hash !== chunk.hash) {
                    throw new Error(`Integrity check failed for chunk ${chunk.chunkIndex}`);
                }
                yield chunkData;
            }
        }
        return {
            file,
            stream: generateStream()
        };
    }
}
exports.FileService = FileService;
//# sourceMappingURL=FileService.js.map