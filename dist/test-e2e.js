"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
async function run() {
    const serverUrl = 'http://127.0.0.1:8000';
    console.log('Generating 20MB mock file in memory...');
    const size = 20 * 1024 * 1024; // 20 MB
    const buffer = crypto_1.default.randomBytes(size);
    const originalHash = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
    console.log(`Original Hash: ${originalHash}`);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('userId', 'test-user-123');
    formData.append('file', blob, 'test-20mb-file.bin');
    console.log('Uploading file via POST /upload...');
    const startTime = Date.now();
    const uploadRes = await fetch(`${serverUrl}/api/files/upload`, {
        method: 'POST',
        body: formData
    });
    if (!uploadRes.ok) {
        const text = await uploadRes.text();
        console.error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`, text);
        return;
    }
    const uploadData = await uploadRes.json();
    const uploadTime = (Date.now() - startTime) / 1000;
    console.log(`Upload success in ${uploadTime}s! File ID:`, uploadData.file.id);
    const fileId = uploadData.file.id;
    console.log(`Downloading file via GET /api/files/download/${fileId}...`);
    const downloadStart = Date.now();
    const downloadRes = await fetch(`${serverUrl}/api/files/download/${fileId}`);
    if (!downloadRes.ok) {
        console.error(`Download failed: ${downloadRes.status} ${downloadRes.statusText}`, await downloadRes.text());
        return;
    }
    const downloadedArrayBuffer = await downloadRes.arrayBuffer();
    const downloadedBuffer = Buffer.from(downloadedArrayBuffer);
    const downloadTime = (Date.now() - downloadStart) / 1000;
    console.log(`Download finished in ${downloadTime}s! Size: ${downloadedBuffer.length} bytes`);
    const downloadedHash = crypto_1.default.createHash('sha256').update(downloadedBuffer).digest('hex');
    console.log(`Original hash:   ${originalHash}`);
    console.log(`Downloaded hash: ${downloadedHash}`);
    if (originalHash === downloadedHash) {
        console.log('✅ End-to-end test passed successfully! File is identical.');
    }
    else {
        console.log('❌ Hash mismatch! File is corrupted.');
    }
}
run().catch(console.error);
//# sourceMappingURL=test-e2e.js.map