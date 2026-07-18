export declare class FileService {
    private discordProvider;
    private telegramProvider;
    constructor();
    initialize(): Promise<void>;
    /**
     * Pick the right provider and chunk size based on total file size.
     * - ≤ 500 MB → Discord  (8 MB chunks, fast for small files)
     * - >  500 MB → Telegram (1.9 GB chunks, efficient for large files)
     *   Falls back to Discord if Telegram is not configured.
     */
    private selectProvider;
    uploadFile(userId: string, originalName: string, mimeType: string, fileStream: AsyncIterable<Buffer>, fileSizeHint: number): Promise<{
        id: string;
        originalName: string;
        mimeType: string;
        hash: string;
        status: string;
        deletedAt: Date | null;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
        size: string;
    }>;
    private processChunk;
    downloadFile(fileId: string, userId: string): Promise<{
        file: {
            chunks: ({
                replications: ({
                    provider: {
                        id: string;
                        name: string;
                        type: string;
                        config: import("@prisma/client/runtime/client").JsonValue | null;
                        isActive: boolean;
                        createdAt: Date;
                        updatedAt: Date;
                    };
                } & {
                    id: string;
                    chunkId: string;
                    providerId: string;
                    externalId: string;
                    externalUrl: string | null;
                    status: string;
                    lastVerifiedAt: Date | null;
                    createdAt: Date;
                    updatedAt: Date;
                })[];
            } & {
                id: string;
                fileId: string;
                chunkIndex: number;
                size: number;
                hash: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
            })[];
        } & {
            id: string;
            originalName: string;
            mimeType: string;
            size: bigint;
            hash: string;
            status: string;
            deletedAt: Date | null;
            userId: string;
            createdAt: Date;
            updatedAt: Date;
        };
        stream: AsyncGenerator<Buffer<ArrayBufferLike>, void, unknown>;
    }>;
}
//# sourceMappingURL=FileService.d.ts.map