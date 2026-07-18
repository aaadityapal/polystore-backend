import { IStorageProvider, UploadResult } from './IStorageProvider';
/**
 * Telegram Bot API storage provider.
 * Uploads chunks as documents to a private Telegram channel.
 * Max chunk size: ~1.9 GB (just below Telegram's 2 GB bot limit).
 */
export declare class TelegramProvider implements IStorageProvider {
    private botToken;
    private channelId;
    providerId: string;
    type: string;
    private apiBase;
    constructor(providerId: string, botToken: string, channelId: string);
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    uploadChunk(chunkBuffer: Buffer, fileName: string): Promise<UploadResult>;
    downloadChunk(externalId: string): Promise<Buffer>;
    deleteChunk(externalId: string): Promise<void>;
}
//# sourceMappingURL=TelegramProvider.d.ts.map