import { test } from 'node:test';
import assert from 'node:assert';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileP = promisify(execFile);

test('context-map fetchData snapshot', async () => {
  const { stdout } = await execFileP(
    'npx',
    ['tsx', 'scripts/context-map.ts', 'fetchData', '-r', 'src', '-a', '-o', 'markdown'],
    { encoding: 'utf8' }
  );
  const expected = await readFile(resolve(__dirname, 'fixtures', 'context-fetchData.md'), 'utf8');
  assert.strictEqual(stdout, expected);
});
