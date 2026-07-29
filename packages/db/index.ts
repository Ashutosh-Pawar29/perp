import dotenv from "dotenv";
import path from "path";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// Load .env from CWD first
dotenv.config();

// If DATABASE_URL is missing, fallback to packages/db/.env and apps/backend/.env
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, ".env") });
}
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../apps/backend/.env") });
}

const connectionString = process.env.DATABASE_URL;

const pool = new pg.Pool({
  connectionString,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
});
