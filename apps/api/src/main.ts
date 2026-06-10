import "reflect-metadata";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { z } from "zod";
import { AppModule } from "./app.module.js";

function loadEnvFile() {
  let current = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const envPath = join(current, ".env");
    if (existsSync(envPath)) {
      const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index <= 0) continue;
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        process.env[key] ??= value;
      }
      return;
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ALLOWED_ORIGINS: z.string().optional()
});

function getAllowedOrigins(env: { NODE_ENV: string; ALLOWED_ORIGINS?: string }): string[] {
  if (env.NODE_ENV !== "production") {
    return ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"];
  }
  if (!env.ALLOWED_ORIGINS) {
    console.error("FATAL: ALLOWED_ORIGINS must be set in production");
    process.exit(1);
  }
  return env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
}

async function bootstrap() {
  loadEnvFile();
  const env = envSchema.parse(process.env);
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: getAllowedOrigins(env),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-store-id"]
  });
  app.setGlobalPrefix("api");
  await app.listen(env.PORT);
  console.log(`API listening on http://localhost:${env.PORT}/api`);
}

void bootstrap();
