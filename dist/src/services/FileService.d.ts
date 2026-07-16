export declare class FileService {
    private discordProvider;
    constructor();
    initialize(): Promise<void>;
    uploadFile(userId: string, originalName: string, mimeType: string, fileStream: AsyncIterable<Buffer>): Promise<{
        id: string;
        originalName: string;
        mimeType: string;
        size: bigint;
        hash: string;
        status: string;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private processChunk;
    downloadFile(fileId: string): Promise<{
        file: {
            chunks: ({
                replications: {
                    id: string;
                    chunkId: string;
                    providerId: string;
                    externalId: string;
                    externalUrl: string | null;
                    status: string;
                    lastVerifiedAt: Date | null;
                    createdAt: Date;
                    updatedAt: Date;
                }[];
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
            userId: string;
            createdAt: Date;
            updatedAt: Date;
        };
        stream: AsyncGenerator<Buffer<ArrayBufferLike>, void, unknown>;
    }>;
}
//# sourceMappingURL=FileService.d.ts.map