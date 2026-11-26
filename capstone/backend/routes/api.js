const express = require('express');
const endpoint = require('../lib/run');

const r = express.Router();
const id = req => Number(req.params.id);
const val = v => (v === '' || v === undefined ? null : v);
const qv = (req, k) => val(req.query[k]);
const paging = (req, def) => {
  const size = Math.min(Math.max(parseInt(req.query.size, 10) || def, 1), 100);
  return [size, (Math.max(parseInt(req.query.page, 10) || 1, 1) - 1) * size];
};

r.post('/auth/login', endpoint({ open: true, sql: 'SELECT * FROM fn_login($1, $2)',
  args: req => [req.body.email, req.body.password], empty: 'Wrong email or password' }));
r.post('/auth/register', endpoint({ open: true, sql: 'SELECT fn_register($1, $2, $3, $4) AS user_id',
  args: req => [req.body.name, req.body.email, req.body.password, req.body.city],
  msg: 'Account created. You can log in now.' }));
r.post('/auth/logout', endpoint({ owner: true, sql: 'SELECT fn_logout($1)', args: (req, token) => [token] }));

r.get('/catalog', endpoint({ sql: 'SELECT * FROM v_catalog ORDER BY prod_id' }));
r.get('/categories', endpoint({ sql: 'SELECT * FROM v_category ORDER BY cat_id' }));

r.post('/categories', endpoint({ sql: 'CALL sp_add_category($1::varchar, $2::int)',
  args: req => [req.body.cat_name, val(req.body.parent_cat_id)], msg: 'Category saved.' }));
r.put('/categories/:id', endpoint({ sql: 'CALL sp_update_category($1::int, $2::varchar, $3::int)',
  args: req => [id(req), req.body.cat_name, val(req.body.parent_cat_id)], msg: 'Category updated.' }));
r.delete('/categories/:id', endpoint({ sql: 'CALL sp_delete_category($1::int)', args: req => [id(req)], msg: 'Category deleted.' }));

r.get('/catalog/search', endpoint({
  sql: 'SELECT * FROM fn_search_products($1::text, $2::int, $3::numeric, $4::numeric, $5::boolean, $6::text, $7::text, $8::int, $9::int)',
  args: req => [qv(req, 'text'), qv(req, 'cat'), qv(req, 'min'), qv(req, 'max'), req.query.in_stock === '1',
    qv(req, 'sort') || 'name', qv(req, 'dir') || 'asc', ...paging(req, 9)] }));

r.get('/products', endpoint({ sql: 'SELECT * FROM v_catalog ORDER BY prod_id' }));
r.post('/products/bulk-price', endpoint({ sql: 'CALL sp_bulk_price_change($1::int, $2::numeric, NULL)',
  args: req => [val(req.body.cat_id), val(req.body.percent)], msg: rows => rows[0].p_changed + ' product price(s) updated.' }));
r.post('/products/restock', endpoint({ sql: 'CALL sp_restock_low($1::int, $2::int, NULL)',
  args: req => [val(req.body.below), val(req.body.add)], msg: rows => rows[0].p_changed + ' product(s) restocked.' }));
r.delete('/products/unsold', endpoint({ sql: 'CALL sp_delete_unsold_products(NULL)',
  msg: rows => rows[0].p_deleted + ' unsold product(s) deleted.' }));
r.post('/products/:id/clone', endpoint({ sql: 'CALL sp_clone_product($1::int, NULL)', args: req => [id(req)],
  msg: rows => 'Copied as product #' + rows[0].p_new_id + '.' }));
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

r.get('/orders/search', endpoint({
  sql: 'SELECT * FROM fn_search_orders($1::text, $2::date, $3::date, $4::text, $5::text, $6::text, $7::int, $8::int)',
  args: req => [qv(req, 'status'), qv(req, 'from'), qv(req, 'to'), qv(req, 'text'),
    qv(req, 'sort') || 'id', qv(req, 'dir') || 'desc', ...paging(req, 10)] }));

r.get('/profile', endpoint({ sql: 'SELECT * FROM fn_my_profile()' }));
r.put('/profile', endpoint({ sql: 'CALL sp_update_profile($1::varchar, $2::varchar)',
  args: req => [req.body.name, req.body.city], msg: 'Profile updated.' }));
r.post('/profile/password', endpoint({ sql: 'CALL sp_change_password($1::text, $2::text)',
  args: req => [req.body.old_password, req.body.new_password], msg: 'Password changed.' }));

r.get('/dashboard/summary', endpoint({ sql: 'SELECT * FROM fn_dashboard()' }));
r.get('/dashboard/status', endpoint({ sql: 'SELECT * FROM fn_orders_by_status()' }));
r.get('/dashboard/monthly', endpoint({ sql: 'SELECT * FROM fn_sales_by_month()' }));
r.get('/dashboard/cities', endpoint({ sql: 'SELECT * FROM fn_sales_by_city($1::int)',
  args: req => [parseInt(req.query.min, 10) || 1] }));

r.get('/lab/schema/columns', endpoint({ sql: 'SELECT * FROM fn_schema_columns()' }));
r.get('/lab/schema/constraints', endpoint({ sql: 'SELECT * FROM fn_schema_constraints()' }));
r.get('/lab/schema/indexes', endpoint({ sql: 'SELECT * FROM fn_schema_indexes()' }));
r.post('/lab/sql', endpoint({ timeout: 3000, sql: 'SELECT fn_run_select($1::text) AS result', args: req => [req.body.sql] }));
r.post('/lab/txn/commit', endpoint({ sql: 'CALL sp_demo_stock_change($1::int, $2::int, NULL)',
  args: req => [Number(req.body.prod_id), Number(req.body.delta)], msg: 'Committed: the change is saved.' }));
r.post('/lab/txn/rollback', endpoint({ sql: 'CALL sp_demo_stock_change($1::int, $2::int, NULL)', rollback: true,
  args: req => [Number(req.body.prod_id), Number(req.body.delta)] }));
r.post('/lab/txn/savepoint', endpoint({ sql: 'SELECT * FROM fn_savepoint_demo($1::int)', rollback: true,
  args: req => [Number(req.body.prod_id)] }));

module.exports = r;
