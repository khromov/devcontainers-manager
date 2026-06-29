import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDeclaredContainerPorts } from './devcontainer.server.ts';

describe('readDeclaredContainerPorts', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dcm-decl-'));
    mkdirSync(join(dir, '.devcontainer'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function writeConfig(json: string) {
    writeFileSync(join(dir, '.devcontainer', 'devcontainer.json'), json);
  }

  test('returns [] when no devcontainer.json exists', async () => {
    expect(await readDeclaredContainerPorts(dir)).toEqual([]);
  });

  test('collects forwardPorts and appPort container ports, excluding 8080', async () => {
    writeConfig(
      JSON.stringify({
        forwardPorts: [3000, '5173'],
        appPort: ['127.0.0.1:8001:8080', 9000, '4000'],
      }),
    );
    const ports = await readDeclaredContainerPorts(dir);
    // host:container forms contribute their container (last) segment; 8080 is dropped.
    expect([...ports].sort((a, b) => a - b)).toEqual([3000, 4000, 5173, 9000]);
  });

  test('parses the host:container appPort form and dedupes', async () => {
    writeConfig(JSON.stringify({ forwardPorts: [3333], appPort: '8002:3333' }));
    expect(await readDeclaredContainerPorts(dir)).toEqual([3333]);
  });

  test('tolerates JSONC comments and returns [] on unparseable input', async () => {
    writeConfig('{ // dev\n "forwardPorts": [3000,], }');
    expect(await readDeclaredContainerPorts(dir)).toEqual([3000]);
    writeConfig('not json at all');
    expect(await readDeclaredContainerPorts(dir)).toEqual([]);
  });
});
