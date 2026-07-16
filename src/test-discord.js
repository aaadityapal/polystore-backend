"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const DiscordProvider_1 = require("./storage/DiscordProvider");
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
dotenv_1.default.config();
const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;
if (!token || !channelId) {
    console.error("Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID in .env");
    process.exit(1);
}
async function runTest() {
    console.log("Initializing Discord Provider...");
    const provider = new DiscordProvider_1.DiscordProvider('test-provider', token, channelId);
    await provider.initialize();
    console.log("Provider initialized!");
    const isHealthy = await provider.healthCheck();
    console.log("Health check passed:", isHealthy);
    if (!isHealthy) {
        console.error("Provider is not healthy. Check channel ID and permissions.");
        process.exit(1);
    }
    // Create a random 1MB buffer for testing
    const testData = crypto_1.default.randomBytes(1024 * 1024);
    const testHash = crypto_1.default.createHash('sha256').update(testData).digest('hex');
    console.log(`Generated 1MB test data (Hash: ${testHash})`);
    console.log("Uploading chunk...");
    const startTime = Date.now();
    const uploadResult = await provider.uploadChunk(testData, 'test-chunk-1.bin');
    console.log(`Upload complete in ${Date.now() - startTime}ms. External ID: ${uploadResult.externalId}`);
    console.log("Downloading chunk...");
    const dlStartTime = Date.now();
    const downloadedBuffer = await provider.downloadChunk(uploadResult.externalId);
    console.log(`Download complete in ${Date.now() - dlStartTime}ms.`);
    const downloadedHash = crypto_1.default.createHash('sha256').update(downloadedBuffer).digest('hex');
    if (testHash === downloadedHash) {
        console.log("✅ Success! Downloaded hash matches original hash.");
    }
    else {
        console.error("❌ Error! Hash mismatch!");
        console.error(`Original: ${testHash}`);
        console.error(`Downloaded: ${downloadedHash}`);
    }
    console.log("Cleaning up (deleting chunk)...");
    await provider.deleteChunk(uploadResult.externalId);
    console.log("Cleanup complete!");
    process.exit(0);
}
runTest().catch(console.error);
//# sourceMappingURL=test-discord.js.map