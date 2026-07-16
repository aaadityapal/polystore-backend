import { Client, GatewayIntentBits, TextChannel, AttachmentBuilder } from 'discord.js';
import { IStorageProvider, UploadResult } from './IStorageProvider';

export class DiscordProvider implements IStorageProvider {
  public providerId: string;
  public type: string = 'DISCORD';
  
  private client: Client;
  private token: string;
  private channelId: string;
  private isInitialized: boolean = false;

  constructor(providerId: string, token: string, channelId: string) {
    this.providerId = providerId;
    this.token = token;
    this.channelId = channelId;
    
    // We only need basic intents to send/read messages
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
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

  public async healthCheck(): Promise<boolean> {
    if (!this.isInitialized || !this.client.isReady()) {
      return false;
    }
    
    try {
      // Try to fetch the channel to ensure we have access
      const channel = await this.client.channels.fetch(this.channelId);
      return channel !== null;
    } catch (error) {
      console.error("Health check error:", error);
      return false;
    }
  }

  public async uploadChunk(chunkBuffer: Buffer, fileName: string): Promise<UploadResult> {
    if (!this.isInitialized) await this.initialize();
    
    const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${this.channelId} not found or is not a text channel`);
    }

    const attachment = new AttachmentBuilder(chunkBuffer, { name: fileName });
    
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

  public async downloadChunk(externalId: string): Promise<Buffer> {
    if (!this.isInitialized) await this.initialize();
    
    const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
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

  public async deleteChunk(externalId: string): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    
    try {
      const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
      const message = await channel.messages.fetch(externalId);
      await message.delete();
    } catch (error: any) {
      // Ignore if message already deleted or not found
      if (error.code === 10008) return; 
      throw error;
    }
  }
}
