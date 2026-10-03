/**
 * Servidor para los E2E: (opcional) Mongo en memoria con replica set, build aislado y `next start`.
 * Lo arranca Playwright (webServer). No siembra: lo hace e2e/global-setup.ts.
 */
import { spawn, spawnSync } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const port = process.env.E2E_PORT ?? '3100';

async function main() {
  let memory: MongoMemoryReplSet | undefined;
  if (process.env.E2E_MONGO === 'memory') {
    memory = await MongoMemoryReplSet.create({
      replSet: { name: 'rs0', count: 1 },
      instanceOpts: [{ port: 27117 }],
    });
    console.log(`[e2e] Mongo en memoria: ${memory.getUri()}`);
  }

  if (process.env.E2E_SKIP_BUILD !== 'true') {
    const build = spawnSync('pnpm', ['exec', 'next', 'build'], {
      stdio: 'inherit',
      env: process.env,
    });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }

  const server = spawn('pnpm', ['exec', 'next', 'start', '-p', port], {
    stdio: 'inherit',
    env: process.env,
  });
  const stop = async () => {
    server.kill('SIGTERM');
    await memory?.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', async (code) => {
    await memory?.stop();
    process.exit(code ?? 0);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
