/**
 * Builds one multi-row upsert. The conflict target identifies the row, so it
 * is the one thing the UPDATE never reassigns.
 *
 * @param {Object} spec
 * @param {string} spec.table
 * @param {string[]} spec.columns
 * @param {string[]} spec.conflictTarget
 * @param {unknown[][]} spec.rows one array of values per row, in column order
 * @param {Record<string, string>} [spec.expressions] columns whose value is a
 *   SQL expression rather than a bind parameter, e.g. `gen_random_uuid()`.
 *   They lead the column list and carry no value in each row.
 * @returns {{text: string, values: unknown[]}}
 */
function buildInsertStatement({ table, columns, conflictTarget, rows, expressions = {} }) {
  const generated = Object.keys(expressions);
  const quoted = [...generated, ...columns].map((c) => `"${c}"`).join(", ");

  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${[...generated.map((c) => expressions[c]), ...placeholders].join(", ")})`;
  });

  // A generated column is left alone on conflict: reassigning it would churn
  // the primary key on every sync.
  const updates = columns
    .filter((c) => !conflictTarget.includes(c))
    .map((c) => `"${c}" = EXCLUDED."${c}"`);

  const text =
    `INSERT INTO "${table}" (${quoted})\n` +
    `VALUES ${tuples.join(", ")}\n` +
    `ON CONFLICT (${conflictTarget.map((c) => `"${c}"`).join(", ")}) DO UPDATE SET ${updates.join(", ")}`;

  return { text, values };
}

// Postgres refuses a statement carrying more than this many bind parameters.
const MAX_PARAMS = 65535;

/**
 * Drops earlier rows that share a conflict target with a later one, keeping
 * each key's last value and its original position.
 *
 * One statement may not touch the same conflict target twice — Postgres raises
 * "ON CONFLICT DO UPDATE command cannot affect row a second time". Row-at-a-time
 * inserts never hit this, because the second insert simply updated what the
 * first had written, so collapsing here preserves the old behaviour.
 */
function collapseByConflictTarget({ columns, conflictTarget }, rows) {
  const keyIndexes = conflictTarget.map((c) => columns.indexOf(c));
  // A conflict target that is generated rather than passed cannot be compared,
  // so there is nothing to collapse on.
  if (keyIndexes.some((i) => i === -1)) return rows;

  const lastByKey = new Map();
  for (const row of rows) {
    lastByKey.set(JSON.stringify(keyIndexes.map((i) => row[i])), row);
  }
  return [...lastByKey.values()];
}

/**
 * Upserts every row, splitting into as few statements as the parameter cap
 * allows. Chunks run in sequence: the pool has a small connection limit, and
 * a full sync's worth of statements at once would exhaust it.
 *
 * @param {{query: Function}} pool
 * @param {{table: string, columns: string[], conflictTarget: string[], expressions?: Record<string, string>}} spec
 * @param {unknown[][]} rows
 * @param {{maxParams?: number}} [options]
 */
async function insertRows(pool, spec, rows, options = {}) {
  if (rows.length === 0) return;

  const unique = collapseByConflictTarget(spec, rows);
  const maxParams = options.maxParams ?? MAX_PARAMS;
  const rowsPerStatement = Math.max(1, Math.floor(maxParams / spec.columns.length));

  for (let i = 0; i < unique.length; i += rowsPerStatement) {
    const chunk = unique.slice(i, i + rowsPerStatement);
    const { text, values } = buildInsertStatement({ ...spec, rows: chunk });
    await pool.query(text, values);
  }
}

module.exports = { buildInsertStatement, insertRows, MAX_PARAMS };
