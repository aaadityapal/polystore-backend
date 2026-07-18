"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const db_1 = require("../utils/db");
const DiscordProvider_1 = require("../storage/DiscordProvider");
const TelegramProvider_1 = require("../storage/TelegramProvider");
const crypto_1 = __importDefault(require("crypto"));
// ─── Chunk sizes ──────────────────────────────────────────────────────────────
const DISCORD_CHUNK_SIZE = 8 * 1024 * 1024; //  8 MB  — Discord bot limit
const TELEGRAM_CHUNK_SIZE = 1900 * 1024 * 1024; //  1.9 GB — just under Telegram 2 GB cap
// ─── Routing threshold ────────────────────────────────────────────────────────
const TELEGRAM_THRESHOLD = 500 * 1024 * 1024; //  500 MB
class FileService {
    discordProvider;
    telegramProvider = null;
    constructor() {
        this.discordProvider = new DiscordProvider_1.DiscordProvider('discord-main', process.env.DISCORD_BOT_TOKEN || '', process.env.DISCORD_CHANNEL_ID || '');
        // Telegram is optional — only initialised if env vars are present
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID) {
            this.telegramProvider = new TelegramProvider_1.TelegramProvider('telegram-main', process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHANNEL_ID);
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
    selectProvider(totalBytes) {
        if (totalBytes > TELEGRAM_THRESHOLD && this.telegramProvider) {
            console.log(`[FileService] ${(totalBytes / 1024 / 1024).toFixed(1)} MB > 500 MB → routing to Telegram`);
            return { provider: this.telegramProvider, chunkSize: TELEGRAM_CHUNK_SIZE };
        }
        console.log(`[FileService] ${(totalBytes / 1024 / 1024).toFixed(1)} MB ≤ 500 MB → routing to Discord`);
        return { provider: this.discordProvider, chunkSize: DISCORD_CHUNK_SIZE };
    }
    async uploadFile(userId, originalName, mimeType, fileStream, fileSizeHint) {
        // 1. Select provider based on total size hint
        const { provider, chunkSize } = this.selectProvider(fileSizeHint);
        // 2. Fetch or create StorageProvider DB record
        let providerRecord = await db_1.prisma.storageProvider.findFirst({
            where: { type: provider.type },
        });
        if (!providerRecord) {
            providerRecord = await db_1.prisma.storageProvider.create({
                data: {
                    name: provider.type === 'TELEGRAM' ? 'Telegram Main' : 'Discord Main',
                    type: provider.type,
                    isActive: true,
                },
            });
        }
        // 3. Create file record
        const file = await db_1.prisma.file.create({
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
            let buffer = Buffer.alloc(0);
            const fileHasher = crypto_1.default.createHash('sha256');
            let totalSize = 0n;
            let chunkIndex = 0;
            for await (const chunkData of fileStream) {
                fileHasher.update(chunkData);
                totalSize += BigInt(chunkData.length);
                buffer = Buffer.concat([buffer, chunkData]);
                while (buffer.length >= chunkSize) {
                    const chunkToUpload = buffer.subarray(0, chunkSize);
                    buffer = buffer.subarray(chunkSize);
                    await this.processChunk(file.id, chunkToUpload, chunkIndex, providerRecord.id, provider);
                    chunkIndex++;
                }
            }
            if (buffer.length > 0) {
                await this.processChunk(file.id, buffer, chunkIndex, providerRecord.id, provider);
            }
            // 4. Finalize file record
            const finalHash = fileHasher.digest('hex');
            const updatedFile = await db_1.prisma.file.update({
                where: { id: file.id },
                data: { size: totalSize, hash: finalHash, status: 'READY' },
            });
            return { ...updatedFile, size: updatedFile.size.toString() };
        }
        catch (error) {
            await db_1.prisma.file.update({
                where: { id: file.id },
                data: { status: 'CORRUPTED' },
            });
            throw error;
        }
    }
    async processChunk(fileId, data, chunkIndex, providerId, provider) {
        const chunkHash = crypto_1.default.createHash('sha256').update(data).digest('hex');
        const chunkRecord = await db_1.prisma.chunk.create({
            data: { fileId, chunkIndex, size: data.length, hash: chunkHash, status: 'UPLOADING' },
        });
        const { externalId, externalUrl } = await provider.uploadChunk(data, `${provider.type.toLowerCase()}-chunk-${chunkIndex}.bin`);
        await db_1.prisma.$transaction([
            db_1.prisma.replication.create({
                data: { chunkId: chunkRecord.id, providerId, externalId, externalUrl, status: 'READY' },
            }),
            db_1.prisma.chunk.update({
                where: { id: chunkRecord.id },
                data: { status: 'UPLOADED' },
            }),
        ]);
        // Trigger background replication for this chunk
        const { scheduleReplication } = await Promise.resolve().then(() => __importStar(require('../queues/replicationQueue')));
        await scheduleReplication(chunkRecord.id, 'ALL');
    }
    async downloadFile(fileId, userId) {
        const file = await db_1.prisma.file.findUnique({
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
        if (!file)
            throw new Error('File not found');
        if (file.userId !== userId)
            throw new Error('Unauthorized access to file');
        if (file.status !== 'READY')
            throw new Error(`File is not ready (Status: ${file.status})`);
        const discordProvider = this.discordProvider;
        const telegramProvider = this.telegramProvider;
        async function* generateStream() {
            for (const chunk of file.chunks) {
                if (chunk.replications.length === 0) {
                    throw new Error(`Chunk ${chunk.chunkIndex} has no valid replications!`);
                }
                const rep = chunk.replications[0];
                const providerType = rep.provider?.type ?? 'DISCORD';
                // Pick the right provider to download from
                let chunkData;
                if (providerType === 'TELEGRAM' && telegramProvider) {
                    chunkData = await telegramProvider.downloadChunk(rep.externalId);
                }
                else {
                    chunkData = await discordProvider.downloadChunk(rep.externalId);
                }
                // Integrity check
                const hash = crypto_1.default.createHash('sha256').update(chunkData).digest('hex');
                if (hash !== chunk.hash) {
                    throw new Error(`Integrity check failed for chunk ${chunk.chunkIndex}`);
                }
                yield chunkData;
            }
        }
        return { file, stream: generateStream() };
    }
}
exports.FileService = FileService;
//# sourceMappingURL=FileService.js.map