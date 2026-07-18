import { Queue, Worker } from 'bullmq';
export declare const replicationQueue: Queue<any, any, string, any, any, string>;
export declare const replicationWorker: Worker<any, any, string>;
export declare function scheduleReplication(chunkId: string, targetProviderType: string): Promise<void>;
//# sourceMappingURL=replicationQueue.d.ts.map