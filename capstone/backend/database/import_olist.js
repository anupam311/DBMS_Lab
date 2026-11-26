const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { parse } = require('csv-parse/sync');
const { from: copyFrom } = require('pg-copy-streams');
const pool = require('../config/db');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'olist'));
const limit = parseInt(process.argv[3], 10) || 2000;

const FILES = {
  customers: 'olist_customers_dataset.csv',
  orders: 'olist_orders_dataset.csv',
  items: 'olist_order_items_dataset.csv',
  products: 'olist_products_dataset.csv',
  translation: 'product_category_name_translation.csv'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const transient = e => ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', '57P01', '57P02', '57P03', '08006', '08003', '08000'].includes(e.code)
  || /Connection terminated|connection error|socket|ECONNRESET/i.test(e.message || '');

function read(key) {
  const rows = parse(fs.readFileSync(path.join(dir, FILES[key])), { bom: true, skip_empty_lines: true, relax_column_count: true });
  const header = rows.shift().map(h => h.trim());
  const col = name => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(FILES[key] + ' has no column named ' + name + '. Columns found: ' + header.join(', '));
    return i;
  };
  return { header, rows, col };
}

function line(fields) {
  return fields.map(f => (f === '' || f === undefined ? '' : '"' + String(f).replace(/"/g, '""') + '"')).join(',') + '\n';
}

function* chunks(t) {
  yield line(t.header);
  for (let i = 0; i < t.rows.length; i += 500) yield t.rows.slice(i, i + 500).map(line).join('');
}

function prepare() {
  const T = {};
  for (const k of Object.keys(FILES)) T[k] = read(k);
  const pid = T.products.col('product_id');
  const productIds = new Set(T.products.rows.map(r => r[pid]));
  const iOrder = T.items.col('order_id'), iProd = T.items.col('product_id');
  const hasLine = new Set();
  for (const r of T.items.rows) if (productIds.has(r[iProd])) hasLine.add(r[iOrder]);

  const oId = T.orders.col('order_id'), oCust = T.orders.col('customer_id'), oTime = T.orders.col('order_purchase_timestamp');
  const picked = T.orders.rows
    .filter(r => r[oTime] && hasLine.has(r[oId]))
    .map(r => [crypto.createHash('md5').update(r[oId]).digest('hex'), r])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit).map(x => x[1]);

  const orderIds = new Set(picked.map(r => r[oId]));
  const custIds = new Set(picked.map(r => r[oCust]));
  const items = T.items.rows.filter(r => orderIds.has(r[iOrder]));
  const usedProducts = new Set(items.map(r => r[iProd]));
  const cId = T.customers.col('customer_id');

  const data = {
    stg_customers: { header: T.customers.header, rows: T.customers.rows.filter(r => custIds.has(r[cId])) },
    stg_orders: { header: T.orders.header, rows: picked },
    stg_items: { header: T.items.header, rows: items },
    stg_products: { header: T.products.header, rows: T.products.rows.filter(r => usedProducts.has(r[pid])) },
    stg_translation: { header: T.translation.header, rows: T.translation.rows }
  };
  const total = Object.values(data).reduce((n, t) => n + t.rows.length, 0);
  console.log('Selected ' + picked.length + ' orders on this computer; uploading ' + total + ' rows (the rest of the CSV files stays here).');
  return data;
}

async function attempt(data) {
  const c = await pool.connect();
  let lost = null;
  c.on('error', e => { lost = e; });
  try {
    await c.query('SET search_path = shop, public');
    await c.query('BEGIN');
    for (const [table, t] of Object.entries(data)) {
      await c.query('CREATE TEMP TABLE ' + table + ' (' + t.header.map(x => '"' + x + '" text').join(', ') + ') ON COMMIT DROP');
      await pipeline(Readable.from(chunks(t)), c.query(copyFrom('COPY ' + table + ' FROM STDIN WITH (FORMAT csv, HEADER true)')));
      console.log('uploaded ' + t.rows.length + ' rows for ' + table.replace('stg_', ''));
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
    throw lost || e;
  } finally {
    c.release(lost ? true : undefined);
  }
}

(async () => {
  const missing = Object.values(FILES).filter(f => !fs.existsSync(path.join(dir, f)));
  if (missing.length) {
    console.error('Missing in ' + dir + ':\n  ' + missing.join('\n  '));
    process.exit(1);
  }
  try {
    const data = prepare();
    for (let n = 1; ; n++) {
      try { await attempt(data); break; }
      catch (e) {
        if (n < 3 && transient(e)) {
          console.error('Connection to the database was lost (' + e.message + '). Nothing was changed. Retrying in 3 seconds (attempt ' + (n + 1) + ' of 3)...');
          await sleep(3000);
          continue;
        }
        console.error('Import failed, nothing was changed: ' + e.message);
        if (transient(e)) console.error('The connection keeps dropping. Check your internet connection, then run the command again. A smaller sample also helps: npm run import:olist -- data/olist 500');
        process.exitCode = 1;
        break;
      }
    }
  } catch (e) {
    console.error('Could not prepare the data: ' + e.message);
    process.exitCode = 1;
  }
  await pool.end().catch(() => {});
})();
