const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { from: copyFrom } = require('pg-copy-streams');
const pool = require('../config/db');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'olist'));
const limit = parseInt(process.argv[3], 10) || 2000;

const FILES = [
  ['stg_customers', 'olist_customers_dataset.csv'],
  ['stg_orders', 'olist_orders_dataset.csv'],
  ['stg_items', 'olist_order_items_dataset.csv'],
  ['stg_products', 'olist_products_dataset.csv'],
  ['stg_translation', 'product_category_name_translation.csv']
];

function header(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(8192);
  const n = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return buf.toString('utf8', 0, n).replace(/^\uFEFF/, '').split(/\r?\n/)[0]
    .split(',').map(h => h.replace(/"/g, '').trim());
}

(async () => {
  const missing = FILES.map(f => f[1]).filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    console.error('Missing in ' + dir + ':\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  const c = await pool.connect();
  try {
    await c.query('SET search_path = shop, public');
    await c.query('BEGIN');
    for (const [table, file] of FILES) {
      const cols = header(path.join(dir, file));
      await c.query('CREATE TEMP TABLE ' + table + ' (' + cols.map(x => '"' + x + '" text').join(', ') + ') ON COMMIT DROP');
      await pipeline(
        fs.createReadStream(path.join(dir, file)),
        c.query(copyFrom('COPY ' + table + ' FROM STDIN WITH (FORMAT csv, HEADER true)'))
      );
      console.log('read ' + file);
    }
    await c.query("SELECT set_config('import.order_limit', $1, false)", [String(limit)]);
    await c.query(fs.readFileSync(path.join(__dirname, 'import_olist.sql'), 'utf8'));
    await c.query('COMMIT');

    const n = await c.query(`SELECT (SELECT COUNT(*) FROM app_user WHERE role = 'customer') AS customers,
      (SELECT COUNT(*) FROM category) AS categories, (SELECT COUNT(*) FROM product) AS products,
      (SELECT COUNT(*) FROM orders) AS orders, (SELECT COUNT(*) FROM order_item) AS lines`);
    console.log('Imported:', JSON.stringify(n.rows[0]));
    console.log('Customer demo login: aman@mail.com / customer123 (staff accounts are unchanged)');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    console.error('Import failed, nothing was changed: ' + e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
