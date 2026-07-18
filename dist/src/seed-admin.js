"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function seedAdmin() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Admin';
    if (!email || !password) {
        console.log('[SeedAdmin] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed.');
        await pool.end();
        return;
    }
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN', password: hashedPassword }
        });
        console.log(`[SeedAdmin] User "${email}" updated to ADMIN role.`);
    }
    else {
        await prisma.user.create({
            data: { email, password: hashedPassword, name, role: 'ADMIN' }
        });
        console.log(`[SeedAdmin] Admin user "${email}" created successfully.`);
    }
    await pool.end();
}
seedAdmin().catch((err) => {
    console.error('[SeedAdmin] Seed failed:', err);
    process.exit(1);
});
//# sourceMappingURL=seed-admin.js.map