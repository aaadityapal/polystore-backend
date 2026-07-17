// prisma.config.js - Prisma 7 configuration file (must be JS for production compatibility)
const { defineConfig } = require("prisma/config");

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
