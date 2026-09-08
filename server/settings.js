import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { HOME_TOKEN, tokenAddress } from './markets.js';

export function createSettings(file = process.env.SETTINGS_FILE || resolve('.flydex/settings.json')) {
  let state = { homeToken: HOME_TOKEN, updatedAt: null };
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    state = { homeToken: tokenAddress(saved.homeToken), updatedAt: saved.updatedAt };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let queue = Promise.resolve();
  return {
    read: () => ({ ...state }),
    save(homeToken) {
      const next = { homeToken: tokenAddress(homeToken), updatedAt: new Date().toISOString() };
      const operation = queue.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
        await rename(file + '.tmp', file);
        state = next;
        return { ...state };
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
