"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordProvider = void 0;
const discord_js_1 = require("discord.js");
class DiscordProvider {
    providerId;
    type = 'DISCORD';
    client;
    token;
    channelId;
    isInitialized = false;
    constructor(providerId, token, channelId) {
        this.providerId = providerId;
        this.token = token;
        this.channelId = channelId;
        // We only need basic intents to send/read messages
        this.client = new discord_js_1.Client({
            intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.MessageContent]
        });
    }
    async initialize() {
        if (this.isInitialized)
            return;
        return new Promise((resolve, reject) => {
            this.client.once('ready', () => {
                this.isInitialized = true;
                resolve();
            });
            this.client.once('error', (err) => {
                reject(err);
            });
            this.client.login(this.token).catch(reject);
        });
    }
    async healthCheck() {
        if (!this.isInitialized || !this.client.isReady()) {
            return false;
        }
        try {
            // Try to fetch the channel to ensure we have access
            const channel = await this.client.channels.fetch(this.channelId);
            return channel !== null;
        }
        catch (error) {
            console.error("Health check error:", error);
            return false;
        }
    }
    async uploadChunk(chunkBuffer, fileName) {
        if (!this.isInitialized)
            await this.initialize();
        const channel = await this.client.channels.fetch(this.channelId);
        if (!channel || !channel.isTextBased()) {
            throw new Error(`Channel ${this.channelId} not found or is not a text channel`);
        }
        const attachment = new discord_js_1.AttachmentBuilder(chunkBuffer, { name: fileName });
        // Send the message with the attachment
        const message = await channel.send({
            content: `chunk:${fileName}`,
            files: [attachment]
        });
        const sentAttachment = message.attachments.first();
        if (!sentAttachment) {
            throw new Error('Failed to retrieve attachment from sent message');
        }
        return {
            externalId: message.id,
            externalUrl: sentAttachment.url,
        };
    }
    async downloadChunk(externalId) {
        if (!this.isInitialized)
            await this.initialize();
        const channel = await this.client.channels.fetch(this.channelId);
        const message = await channel.messages.fetch(externalId);
        const attachment = message.attachments.first();
        if (!attachment) {
            throw new Error(`No attachment found on message ${externalId}`);
        }
        // Download the attachment URL
        const response = await fetch(attachment.url);
        if (!response.ok) {
            throw new Error(`Failed to download attachment: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    async deleteChunk(externalId) {
        if (!this.isInitialized)
            await this.initialize();
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            const message = await channel.messages.fetch(externalId);
            await message.delete();
        }
        catch (error) {
            // Ignore if message already deleted or not found
            if (error.code === 10008)
                return;
            throw error;
        }
    }
}
exports.DiscordProvider = DiscordProvider;
//# sourceMappingURL=DiscordProvider.js.map