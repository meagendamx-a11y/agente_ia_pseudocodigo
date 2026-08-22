import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const sourceIndex = process.argv.indexOf('--source');
if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) {
  console.error('Uso: node scripts/verify-legacy-sources.mjs --source /ruta/database_pseudocodigo');
  process.exit(2);
}

const source = path.resolve(process.argv[sourceIndex + 1]);
const lock = JSON.parse(await readFile('references.lock.json', 'utf8'));
let matched = 0;

for (const entry of lock.legacy_agent_functions) {
  const filePath = path.join(source, 'functions', 'agente', entry.file);
  const bytes = await readFile(filePath);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== entry.sha256) {
    console.error(`SHA distinto: ${entry.file}\n  esperado ${entry.sha256}\n  actual   ${actual}`);
    process.exitCode = 1;
  } else {
    matched += 1;
  }
}

if (!process.exitCode) console.log(`${matched}/13 hashes legacy coinciden.`);
