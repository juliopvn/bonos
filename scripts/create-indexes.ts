import { closeDb, ensureIndexes, getDb } from '@/lib/db';

async function main() {
  await ensureIndexes(await getDb());
  console.log('[db] índices creados/verificados');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
