export interface UploadResult {
  externalId: string;
  externalUrl?: string;
}

export interface IStorageProvider {
  /**
   * The unique identifier for this provider configuration
   */
  providerId: string;

  /**
   * The type of provider (e.g., 'DISCORD', 'S3')
   */
  type: string;

  /**
   * Initialize and authenticate with the storage backend
   */
  initialize(): Promise<void>;

  /**
   * Check if the backend is reachable and healthy
   */
  healthCheck(): Promise<boolean>;

  /**
   * Upload a chunk of data
   * @param chunkBuffer The chunk data
   * @param fileName Optional filename for the chunk
   * @returns An object containing the external ID and URL
   */
  uploadChunk(chunkBuffer: Buffer, fileName: string): Promise<UploadResult>;

  /**
   * Download a chunk of data
   * @param externalId The ID returned during upload
   * @returns The chunk data as a Buffer
   */
  downloadChunk(externalId: string): Promise<Buffer>;

  /**
   * Delete a chunk of data
   * @param externalId The ID returned during upload
   */
  deleteChunk(externalId: string): Promise<void>;
}
