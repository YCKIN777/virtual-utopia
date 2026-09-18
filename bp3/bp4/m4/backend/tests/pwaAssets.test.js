import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const m4Directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

test('PWA manifest and service worker are present', async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(m4Directory, 'frontend', 'public', 'manifest.webmanifest'),
      'utf8',
    ),
  );
  const serviceWorker = await readFile(
    path.join(m4Directory, 'frontend', 'public', 'sw.js'),
    'utf8',
  );

  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.length, 1);
  assert.match(serviceWorker, /bp4-m4-shell-v2/);
  assert.match(serviceWorker, /request\.mode === 'navigate'/);
  assert.match(serviceWorker, /bp4-m4-api/);
});
