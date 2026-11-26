const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

const FILES = [
  '01_schema.sql', '02_functions.sql', '03_triggers.sql', '04_procedures.sql',
  '05_reports.sql', '06_security.sql', '07_seed.sql', '08_basics.sql', '09_access.sql'
];

(async () => {
  const c = await pool.connect();
  let current = '';
  try {
    for (const f of FILES) {
      current = f;
      await c.query(fs.readFileSync(path.join(__dirname, f), 'utf8'));
      console.log('ran ' + f);
    }
    console.log('Database ready.');
  } catch (e) {
    console.error('Setup failed in ' + current + ': ' + e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
