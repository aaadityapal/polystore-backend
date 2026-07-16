import { IStorageProvider, UploadResult } from './IStorageProvider';
export declare class DiscordProvider implements IStorageProvider {
    providerId: string;
    type: string;
    private client;
    private token;
    private channelId;
    private isInitialized;
    constructor(providerId: string, token: string, channelId: string);
    initialize(): Promise<void>;
    healthCheck(): Promise<boolean>;
    uploadChunk(chunkBuffer: Buffer, fileName: string): Promise<UploadResult>;
    downloadChunk(externalId: string): Promise<Buffer>;
    deleteChunk(externalId: string): Promise<void>;
}
//# sourceMappingURL=DiscordProvider.d.ts.map