import { Queue, Worker } from 'bullmq';
export declare const integrityQueue: Queue<any, any, string, any, any, string>;
export declare const integrityWorker: Worker<any, any, string>;
export declare function scheduleIntegrityCheck(): Promise<void>;
//# sourceMappingURL=integrityQueue.d.ts.map