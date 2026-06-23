import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export interface DirEntry {
  name: string;
  path: string;
  hasDevcontainer: boolean;
}

export interface BrowseResult {
  /** Absolute path being listed. */
  path: string;
  /** Whether `path` itself contains a devcontainer.json. */
  hasDevcontainer: boolean;
  /** Parent directory, or null when at the filesystem root. */
  parent: string | null;
  /** Subdirectories of `path`, sorted, hidden dirs excluded. */
  entries: DirEntry[];
}

function hasDevcontainer(dir: string): boolean {
  return (
    existsSync(join(dir, '.devcontainer', 'devcontainer.json')) ||
    existsSync(join(dir, '.devcontainer.json'))
  );
}

/**
 * List the subdirectories of `path` (defaults to the user's home directory) so the
 * web UI can browse to and pick a project folder. Only directories are returned —
 * all we need from the selection is the absolute path.
 */
export async function browse(path?: string): Promise<BrowseResult> {
  const target = path && path.trim() ? path : homedir();

  const info = await stat(target);
  if (!info.isDirectory()) throw new Error(`Not a folder: ${target}`);

  const dirents = await readdir(target, { withFileTypes: true });
  const entries: DirEntry[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory() || dirent.name.startsWith('.')) continue;
    const full = join(target, dirent.name);
    entries.push({ name: dirent.name, path: full, hasDevcontainer: hasDevcontainer(full) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const parent = dirname(target);
  return {
    path: target,
    hasDevcontainer: hasDevcontainer(target),
    parent: parent === target ? null : parent,
    entries,
  };
}
