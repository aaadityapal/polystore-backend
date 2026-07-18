import axios from 'axios';
import FormData from 'form-data';
import { IStorageProvider, UploadResult } from './IStorageProvider';

/**
 * Telegram Bot API storage provider.
 * Uploads chunks as documents to a private Telegram channel.
 * Max chunk size: ~1.9 GB (just below Telegram's 2 GB bot limit).
 */
export class TelegramProvider implements IStorageProvider {
  public providerId: string;
  public type: string = 'TELEGRAM';

  private apiBase: string;

  constructor(
    providerId: string,
    private botToken: string,
    private channelId: string
  ) {
    this.providerId = providerId;
    this.apiBase = `https://api.telegram.org/bot${botToken}`;
  }

  public async initialize(): Promise<void> {
    // Validate credentials by calling getMe
    try {
      const res = await axios.get(`${this.apiBase}/getMe`);
      if (!res.data.ok) throw new Error('Telegram getMe failed');
      console.log(`[TelegramProvider] Authenticated as @${res.data.result.username}`);
    } catch (err: any) {
      throw new Error(`TelegramProvider init failed: ${err.message}`);
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.apiBase}/getMe`);
      return res.data.ok === true;
    } catch {
      return false;
    }
  }

  public async uploadChunk(chunkBuffer: Buffer, fileName: string): Promise<UploadResult> {
    const form = new FormData();
    form.append('chat_id', this.channelId);
    form.append('document', chunkBuffer, { filename: fileName, contentType: 'application/octet-stream' });

    const res = await axios.post(`${this.apiBase}/sendDocument`, form, {
      headers: {
        ...form.getHeaders(),
        'Content-Length': form.getLengthSync()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 120000, // 2 minutes timeout just in case
    });

    if (!res.data.ok) {
      throw new Error(`Telegram uploadChunk failed: ${JSON.stringify(res.data)}`);
    }

    const msg = res.data.result;
    const fileId: string = msg.document.file_id;
    const messageId: string = String(msg.message_id);

    // externalId format: "msgId:fileId" — msgId lets us delete; fileId lets us download
    return {
      externalId: `${messageId}:${fileId}`,
      externalUrl: undefined,
    };
  }

  public async downloadChunk(externalId: string): Promise<Buffer> {
    // externalId = "msgId:fileId" — we only need the fileId part
    const fileId = externalId.includes(':') ? (externalId.split(':')[1] ?? externalId) : externalId;

    // Step 1: get the temporary download path
    const pathRes = await axios.get(`${this.apiBase}/getFile?file_id=${fileId}`);
    if (!pathRes.data.ok) {
      throw new Error(`Telegram getFile failed: ${JSON.stringify(pathRes.data)}`);
    }
    const filePath: string = pathRes.data.result.file_path;

    // Step 2: download the actual bytes
    const fileRes = await axios.get(
      `https://api.telegram.org/file/bot${this.botToken}/${filePath}`,
      { responseType: 'arraybuffer', maxContentLength: Infinity, timeout: 0 }
    );

    return Buffer.from(fileRes.data);
  }

  public async deleteChunk(externalId: string): Promise<void> {
    // externalId = "msgId:fileId"
    const messageId = externalId.includes(':') ? (externalId.split(':')[0] ?? externalId) : externalId;
    try {
      await axios.post(`${this.apiBase}/deleteMessage`, {
        chat_id: this.channelId,
        message_id: parseInt(messageId, 10),
      });
    } catch {
      // Ignore — message may already be deleted
    }
  }
}
