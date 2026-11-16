import { createSeed } from './seed.js';
import { createSupabaseServerClient } from '../services/supabase-client.service.js';
import { HttpError } from '../utils/http-error.js';

const STATE_ID = 'workspace';

function deepClone(value) {
  return structuredClone(value);
}

/**
 * Supabase-backed persistence adapter. The application already works against a
 * small store contract (`data`, `initialise`, and `mutate`), so this adapter
 * persists the complete workspace state as one versioned JSONB document. A
 * single document gives attendance, invoices, assets, notifications, settings,
 * audit events, and seed users atomic updates while keeping the current domain
 * services database-agnostic.
 */
export class SupabaseStateStore {
  constructor({ client = createSupabaseServerClient(), tableName }) {
    this.client = client;
    this.tableName = tableName;
    this.data = null;
    this.version = null;
  }

  async initialise() {
    const { data, error } = await this.client
      .from(this.tableName)
      .select('state, version')
      .eq('id', STATE_ID)
      .maybeSingle();

    if (error) throw new Error(`Unable to load Supabase application state: ${error.message}`);

    if (data) {
      this.data = data.state;
      this.version = Number(data.version);
      if (this.data?.schemaVersion !== 1) throw new Error('Supabase application state has an unsupported schema version');
      return this;
    }

    const initialState = createSeed();
    const { data: inserted, error: insertError } = await this.client
      .from(this.tableName)
      .insert({ id: STATE_ID, state: initialState, version: 1 })
      .select('state, version')
      .single();

    // A simultaneous first boot can create the record first; reload it instead
    // of replacing someone else's seeded data.
    if (insertError?.code === '23505') return this.initialise();
    if (insertError) throw new Error(`Unable to initialize Supabase application state: ${insertError.message}`);

    this.data = inserted.state;
    this.version = Number(inserted.version);
    return this;
  }

  async save() {
    const nextVersion = this.version + 1;
    const { data, error } = await this.client
      .from(this.tableName)
      .update({ state: this.data, version: nextVersion })
      .eq('id', STATE_ID)
      .eq('version', this.version)
      .select('version')
      .maybeSingle();

    if (error) throw new Error(`Unable to persist Supabase application state: ${error.message}`);
    if (!data) throw new HttpError(409, 'Workspace data changed elsewhere. Please retry your action.');
    this.version = Number(data.version);
  }

  async mutate(callback) {
    const snapshot = deepClone(this.data);
    const version = this.version;
    try {
      const result = callback(this.data);
      await this.save();
      return result;
    } catch (error) {
      this.data = snapshot;
      this.version = version;
      throw error;
    }
  }
}
