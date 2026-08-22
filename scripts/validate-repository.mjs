import { readFile } from 'node:fs/promises';

const errors = [];
let lock;
try {
  lock = JSON.parse(await readFile('references.lock.json', 'utf8'));
} catch (error) {
  errors.push(`references.lock.json inválido: ${error.message}`);
}

if (lock) {
  const entries = lock.legacy_agent_functions ?? [];
  const count = disposition => entries.filter(item => item.disposition === disposition).length;
  if (entries.length !== 13) errors.push('Se requieren exactamente 13 funciones legacy.');
  if (count('rewrite') !== 8 || count('replace') !== 3 || count('omit') !== 2) {
    errors.push('La clasificación legacy debe ser rewrite=8, replace=3, omit=2.');
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log('Repositorio contractual válido (baseline).');
}

