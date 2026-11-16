import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSeed } from './seed.js';

/**
 * Small transactional JSON adapter for the demo. Its public contract keeps
 * route/service code independent from a future database implementation.
 */
export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.writeQueue = Promise.resolve();
  }

  async initialise() {
    await mkdir(dirname(this.filePath), { recursive: true });

    if (!existsSync(this.filePath)) {
      this.data = createSeed();
      await this.save();
      return this;
    }

    try {
      this.data = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (this.data?.schemaVersion !== 1) throw new Error('unsupported schema version');
    } catch (error) {
      throw new Error(`Unable to load local data store: ${error.message}`);
    }

    return this;
  }

  async save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const temporaryFile = `${this.filePath}.tmp`;
      await writeFile(temporaryFile, snapshot, 'utf8');
      await rename(temporaryFile, this.filePath);
    });
    return this.writeQueue;
  }

  async mutate(callback) {
    const result = callback(this.data);
    await this.save();
    return result;
  }
}
