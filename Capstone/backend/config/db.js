require('dotenv').config();
const { Pool, types } = require('pg');

types.setTypeParser(1700, parseFloat);
types.setTypeParser(20, v => parseInt(v, 10));

const url = process.env.DATABASE_URL;
const local = !url || /localhost|127\.0\.0\.1|host=\//.test(url);

module.exports = new Pool(url
  ? { connectionString: url, ssl: local ? false : { rejectUnauthorized: false } }
  : {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'ecommerce_app'
    });
