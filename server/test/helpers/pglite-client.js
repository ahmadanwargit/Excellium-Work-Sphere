// A small PostgREST-compatible test transport backed by actual embedded
// PostgreSQL. This exercises SQL constraints and persistence, not just a mock.
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

export function postgresClient(database) {
  return {
    from(table) {
      let operation = 'select';
      let payload;
      let conflict = 'id';
      let columns = '*';
      let single = false;
      const filters = [];
      const execute = async () => {
        try {
          const parameters = [];
          const parameter = (value) => { parameters.push(value); return `$${parameters.length}`; };
          const where = () => filters.length ? ` where ${filters.map(([column, value]) => `${quote(column)} = ${parameter(value)}`).join(' and ')}` : '';
          let sql;
          if (operation === 'select') sql = `select ${columns === '*' ? '*' : columns.split(',').map((column) => quote(column.trim())).join(', ')} from ${quote(table)}${where()}`;
          else if (operation === 'delete') sql = `delete from ${quote(table)}${where()} returning *`;
          else if (operation === 'update') sql = `update ${quote(table)} set ${Object.entries(payload).map(([column, value]) => `${quote(column)} = ${parameter(value)}`).join(', ')}${where()} returning *`;
          else {
            const rows = Array.isArray(payload) ? payload : [payload];
            const keys = Object.keys(rows[0]);
            sql = `insert into ${quote(table)} (${keys.map(quote).join(', ')}) values ${rows.map((row) => `(${keys.map((key) => parameter(row[key] ?? null)).join(', ')})`).join(', ')}`;
            if (operation === 'upsert') sql += ` on conflict (${conflict.split(',').map(quote).join(', ')}) do update set ${keys.map((key) => `${quote(key)} = excluded.${quote(key)}`).join(', ')}`;
            sql += ' returning *';
          }
          const result = await database.query(sql, parameters);
          return { data: single ? result.rows[0] ?? null : result.rows, error: null };
        } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
      };
      const query = {
        select(value = '*') { columns = value; return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        maybeSingle() { single = true; return query; },
        insert(value) { operation = 'insert'; payload = value; return query; },
        upsert(value, options = {}) { operation = 'upsert'; payload = value; conflict = options.onConflict ?? 'id'; return query; },
        update(value) { operation = 'update'; payload = value; return query; },
        delete() { operation = 'delete'; return query; },
        then(resolve, reject) { return execute().then(resolve, reject); }
      };
      return query;
    }
  };
}
