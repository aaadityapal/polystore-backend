"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
// Ensure env variables are loaded before initializing Prisma
dotenv_1.default.config();
exports.prisma = new client_1.PrismaClient();
//# sourceMappingURL=db.js.map