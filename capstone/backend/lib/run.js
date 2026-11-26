const pool = require('../config/db');

const ROLE = { admin: 'role_admin', manager: 'role_manager', customer: 'role_customer' };
const DEMO = process.env.DEMO_MODE !== 'false';

function show(sql, params) {
  return sql.replace(/\$(\d+)/g, (_, n) => {
    const v = params[n - 1];
    if (v === null || v === undefined) return 'NULL';
    return typeof v === 'number' ? v : "'" + String(v).replace(/'/g, "''") + "'";
  });
}

function print(req, who, log) {
  console.log('\n\x1b[1m' + req.method + ' ' + req.originalUrl + '\x1b[0m  (' + who + ')');
  for (const l of log) {
    if (l.notice) console.log('   \x1b[35mNOTICE\x1b[0m ' + l.notice);
    else if (l.error) console.log('   \x1b[31mERROR \x1b[0m ' + l.sql + '  ->  ' + l.error);
    else console.log('   \x1b[36mSQL   \x1b[0m ' + l.sql + '  (' + l.ms.toFixed(2) + ' ms)');
  }
}

module.exports = function endpoint(spec) {
  return async (req, res) => {
    const log = [];
    let status = 200, body, who = 'no session';
    const c = await pool.connect();
    c.on('notice', n => log.push({ notice: n.message }));

    const q = async (sql, params = []) => {
      const shown = show(sql, params);
      const start = process.hrtime.bigint();
      try {
        const r = await c.query(sql, params);
        log.push({ sql: shown, ms: Number(process.hrtime.bigint() - start) / 1e6 });
        return r.rows;
      } catch (e) {
        log.push({ sql: shown, error: e.message });
        throw e;
      }
    };

    try {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      let session = null;
      if (!spec.open) {
        session = (await c.query('SELECT * FROM shop.fn_session($1)', [token])).rows[0];
        if (!session) { status = 401; throw new Error('Please log in again'); }
        who = session.role;
      }
      await q('BEGIN');
      await q('SET LOCAL search_path = shop, public');
      if (session && !spec.owner) {
        await q('SET LOCAL ROLE ' + ROLE[session.role]);
        await q("SELECT set_config('app.user_id', $1, true), set_config('app.role', $2, true)",
          [String(session.user_id), session.role]);
      }
      if (spec.timeout) await q('SET LOCAL statement_timeout = ' + Number(spec.timeout));
      const rows = await q(spec.sql, spec.args ? spec.args(req, token) : []);
      if (spec.empty && !rows.length) { status = 401; throw new Error(spec.empty); }
      await q(spec.rollback ? 'ROLLBACK' : 'COMMIT');
      body = { ok: true, data: rows, message: spec.rollback ? 'Rolled back: nothing was saved.' : (typeof spec.msg === 'function' ? spec.msg(rows) : spec.msg) };
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch (_) {}
      if (status === 200) status = 400;
      body = { ok: false, error: e.message };
    } finally {
      c.removeAllListeners('notice');
      c.release();
    }
    print(req, who, log);
    if (DEMO) body.log = log;
    res.status(status).json(body);
  };
};
