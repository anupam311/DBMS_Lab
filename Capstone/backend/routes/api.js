const express = require('express');
const endpoint = require('../lib/run');

const r = express.Router();
const id = req => Number(req.params.id);
const val = v => (v === '' || v === undefined ? null : v);

r.post('/auth/login', endpoint({ open: true, sql: 'SELECT * FROM fn_login($1, $2)',
  args: req => [req.body.email, req.body.password], empty: 'Wrong email or password' }));
r.post('/auth/register', endpoint({ open: true, sql: 'SELECT fn_register($1, $2, $3, $4) AS user_id',
  args: req => [req.body.name, req.body.email, req.body.password, req.body.city],
  msg: 'Account created. You can log in now.' }));
r.post('/auth/logout', endpoint({ owner: true, sql: 'SELECT fn_logout($1)', args: (req, token) => [token] }));

r.get('/catalog', endpoint({ sql: 'SELECT * FROM v_catalog ORDER BY prod_id' }));
r.get('/categories', endpoint({ sql: 'SELECT * FROM v_category ORDER BY cat_id' }));

r.get('/products', endpoint({ sql: 'SELECT * FROM v_catalog ORDER BY prod_id' }));
r.post('/products', endpoint({ sql: 'CALL sp_add_product($1::varchar, $2::int, $3::numeric, $4::int)',
  args: req => [req.body.prod_name, val(req.body.cat_id), val(req.body.price), val(req.body.stock)],
  msg: 'Product added.' }));
r.put('/products/:id', endpoint({ sql: 'CALL sp_update_product($1::int, $2::varchar, $3::int, $4::numeric, $5::int)',
  args: req => [id(req), req.body.prod_name, val(req.body.cat_id), val(req.body.price), val(req.body.stock)],
  msg: 'Product updated.' }));
r.delete('/products/:id', endpoint({ sql: 'CALL sp_delete_product($1::int)', args: req => [id(req)], msg: 'Product deleted.' }));

r.get('/orders', endpoint({ sql: 'SELECT * FROM fn_order_summary()' }));
r.post('/orders', endpoint({ sql: 'CALL sp_place_order($1::jsonb, NULL)',
  args: req => [JSON.stringify(req.body.items || [])],
  msg: rows => 'Order #' + rows[0].p_order_id + ' placed.' }));
r.put('/orders/:id/status', endpoint({ sql: 'CALL sp_set_order_status($1::int, $2::varchar)',
  args: req => [id(req), req.body.status], msg: 'Status updated.' }));
r.delete('/orders/:id', endpoint({ sql: 'CALL sp_cancel_order($1::int)', args: req => [id(req)],
  msg: 'Order cancelled and stock put back.' }));

r.get('/reports/top-products', endpoint({ sql: 'SELECT * FROM fn_top_products()' }));
r.get('/reports/category-tree', endpoint({ sql: 'SELECT * FROM fn_category_tree()' }));
r.get('/reports/insights', endpoint({ sql: 'SELECT * FROM fn_customer_insights()' }));
r.get('/reports/rollup', endpoint({ sql: 'SELECT * FROM fn_revenue_rollup()' }));
r.get('/reports/daily', endpoint({ sql: 'SELECT * FROM v_daily_sales ORDER BY day DESC' }));
r.post('/reports/refresh', endpoint({ sql: 'CALL sp_refresh_reports()', msg: 'Daily sales refreshed.' }));
r.get('/reports/explain', endpoint({ sql: 'SELECT * FROM fn_explain_orders()' }));
r.get('/reports/audit', endpoint({ sql: 'SELECT * FROM v_audit' }));

r.get('/users', endpoint({ sql: 'SELECT * FROM v_user_list ORDER BY user_id' }));
r.put('/users/:id/role', endpoint({ sql: 'CALL sp_set_user_role($1::int, $2::varchar)',
  args: req => [id(req), req.body.role], msg: 'Role updated.' }));
r.delete('/users/:id', endpoint({ sql: 'CALL sp_delete_user($1::int)', args: req => [id(req)], msg: 'User deleted.' }));

r.post('/security/test', endpoint({ sql: 'SELECT fn_security_test($1) AS result', args: req => [req.body.test] }));

module.exports = r;
