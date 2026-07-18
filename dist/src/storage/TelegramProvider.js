"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
/**
 * Telegram Bot API storage provider.
 * Uploads chunks as documents to a private Telegram channel.
 * Max chunk size: ~1.9 GB (just below Telegram's 2 GB bot limit).
 */
class TelegramProvider {
    botToken;
    channelId;
    providerId;
    type = 'TELEGRAM';
    apiBase;
    constructor(providerId, botToken, channelId) {
        this.botToken = botToken;
        this.channelId = channelId;
        this.providerId = providerId;
        this.apiBase = `https://api.telegram.org/bot${botToken}`;
    }
    async initialize() {
        // Validate credentials by calling getMe
        try {
            const res = await axios_1.default.get(`${this.apiBase}/getMe`);
            if (!res.data.ok)
                throw new Error('Telegram getMe failed');
            console.log(`[TelegramProvider] Authenticated as @${res.data.result.username}`);
        }
        catch (err) {
            throw new Error(`TelegramProvider init failed: ${err.message}`);
        }
    }
    async healthCheck() {
        try {
            const res = await axios_1.default.get(`${this.apiBase}/getMe`);
            return res.data.ok === true;
        }
        catch {
            return false;
        }
    }
    async uploadChunk(chunkBuffer, fileName) {
        const form = new form_data_1.default();
        form.append('chat_id', this.channelId);
        form.append('document', chunkBuffer, { filename: fileName, contentType: 'application/octet-stream' });
        const res = await axios_1.default.post(`${this.apiBase}/sendDocument`, form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            timeout: 0, // no timeout for large chunks
        });
        if (!res.data.ok) {
            throw new Error(`Telegram uploadChunk failed: ${JSON.stringify(res.data)}`);
        }
        const msg = res.data.result;
        const fileId = msg.document.file_id;
        const messageId = String(msg.message_id);
        // externalId format: "msgId:fileId" — msgId lets us delete; fileId lets us download
        return {
            externalId: `${messageId}:${fileId}`,
            externalUrl: undefined,
        };
    }
    async downloadChunk(externalId) {
        // externalId = "msgId:fileId" — we only need the fileId part
        const fileId = externalId.includes(':') ? (externalId.split(':')[1] ?? externalId) : externalId;
        // Step 1: get the temporary download path
        const pathRes = await axios_1.default.get(`${this.apiBase}/getFile?file_id=${fileId}`);
        if (!pathRes.data.ok) {
            throw new Error(`Telegram getFile failed: ${JSON.stringify(pathRes.data)}`);
        }
        const filePath = pathRes.data.result.file_path;
        // Step 2: download the actual bytes
        const fileRes = await axios_1.default.get(`https://api.telegram.org/file/bot${this.botToken}/${filePath}`, { responseType: 'arraybuffer', maxContentLength: Infinity, timeout: 0 });
        return Buffer.from(fileRes.data);
    }
    async deleteChunk(externalId) {
        // externalId = "msgId:fileId"
        const messageId = externalId.includes(':') ? (externalId.split(':')[0] ?? externalId) : externalId;
        try {
            await axios_1.default.post(`${this.apiBase}/deleteMessage`, {
                chat_id: this.channelId,
                message_id: parseInt(messageId, 10),
            });
        }
        catch {
            // Ignore — message may already be deleted
        }
    }
}
exports.TelegramProvider = TelegramProvider;
//# sourceMappingURL=TelegramProvider.js.map