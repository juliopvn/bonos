import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getEnv, resetEnvCache } from '@/lib/env';

const BASE = {
  NODE_ENV: 'development',
  AUTH_SECRET: 'x'.repeat(40),
  CRON_SECRET: 'cron-secret',
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DB: 'bonds',
  MAIL_DRIVER: 'smtp',
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'b',
  S3_ACCESS_KEY_ID: 'k',
  S3_SECRET_ACCESS_KEY: 's',
};

const original = { ...process.env };
beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, BASE);
  resetEnvCache();
});
afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, original);
  resetEnvCache();
});

describe('lib/env', () => {
  it('acepta una configuración válida y aplica defaults', () => {
    const env = getEnv();
    expect(env.MAGIC_LINK_TTL_MINUTES).toBe(15);
    expect(env.ALERT_PRICE_MOVE_BPS).toBe(200);
    expect(env.E2E_MODE).toBe(false);
    expect(env.APP_BASE_URL).toBe('http://localhost:3000');
  });

  it('falla con un mensaje claro si falta una variable', () => {
    delete process.env.AUTH_SECRET;
    expect(() => getEnv()).toThrow(/AUTH_SECRET/);
  });

  it('exige variables S3 con STORAGE_DRIVER=s3 y RESEND_API_KEY con resend', () => {
    delete process.env.S3_BUCKET;
    expect(() => getEnv()).toThrow(/S3_BUCKET/);
    resetEnvCache();
    process.env.S3_BUCKET = 'b';
    process.env.MAIL_DRIVER = 'resend';
    expect(() => getEnv()).toThrow(/RESEND_API_KEY/);
  });

  it('rechaza los drivers memory/fs en producción salvo E2E_MODE=true', () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.MAIL_DRIVER = 'memory';
    expect(() => getEnv()).toThrow(/E2E_MODE/);
    resetEnvCache();
    process.env.MAIL_DRIVER = 'smtp';
    process.env.STORAGE_DRIVER = 'fs';
    expect(() => getEnv()).toThrow(/fs solo se permite/);
    resetEnvCache();
    process.env.E2E_MODE = 'true';
    expect(getEnv().STORAGE_DRIVER).toBe('fs');
  });

  it('SEED_DEMO_INVESTORS es opcional, se normaliza y valida', () => {
    expect(getEnv().SEED_DEMO_INVESTORS).toEqual([]);
    resetEnvCache();
    process.env.SEED_DEMO_INVESTORS = ' A@x.com , b@y.org ';
    expect(getEnv().SEED_DEMO_INVESTORS).toEqual(['a@x.com', 'b@y.org']);
    resetEnvCache();
    process.env.SEED_DEMO_INVESTORS = 'no-es-correo';
    expect(() => getEnv()).toThrow(/SEED_DEMO_INVESTORS/);
  });

  it('APP_URL cae a VERCEL_URL (previews) y ADMIN_EMAILS se normaliza', () => {
    process.env.VERCEL_URL = 'bonos-git-x.vercel.app';
    process.env.ADMIN_EMAILS = ' Admin@Demo.local , otro@x.com ';
    const env = getEnv();
    expect(env.APP_BASE_URL).toBe('https://bonos-git-x.vercel.app');
    expect(env.ADMIN_EMAILS).toEqual(['admin@demo.local', 'otro@x.com']);
    resetEnvCache();
    process.env.APP_URL = 'https://bonos.jpavon-tech.com/';
    expect(getEnv().APP_BASE_URL).toBe('https://bonos.jpavon-tech.com');
  });
});
