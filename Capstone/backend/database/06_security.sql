SET search_path = shop, public;

DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['role_admin', 'role_manager', 'role_customer'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;

GRANT role_customer TO role_manager;
GRANT role_manager TO role_admin;
GRANT role_admin, role_manager, role_customer TO CURRENT_USER;

CREATE FUNCTION fn_security_test(p_test TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v TEXT;
BEGIN
  CASE p_test
    WHEN 'read_hashes'  THEN EXECUTE 'SELECT password_hash FROM app_user LIMIT 1' INTO v;
    WHEN 'list_users'   THEN EXECUTE 'SELECT count(*) FROM v_user_list' INTO v;
    WHEN 'run_report'   THEN EXECUTE 'SELECT count(*) FROM fn_top_products()' INTO v;
    WHEN 'count_orders' THEN EXECUTE 'SELECT count(*) FROM orders' INTO v;
    ELSE RAISE EXCEPTION 'Unknown test';
  END CASE;
  RETURN 'ALLOWED. Result: ' || COALESCE(v, '(empty)');
EXCEPTION WHEN insufficient_privilege THEN
  RETURN 'DENIED by PostgreSQL: ' || SQLERRM;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA shop FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA shop FROM PUBLIC;

GRANT USAGE ON SCHEMA shop TO role_customer;
GRANT SELECT ON v_catalog, v_category, orders, order_item TO role_customer;
GRANT SELECT (user_id, name, city) ON app_user TO role_customer;
GRANT SELECT ON v_audit, v_daily_sales TO role_manager;
GRANT SELECT ON v_user_list TO role_admin;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_orders ON orders FOR SELECT TO role_customer USING (user_id = fn_current_user_id());
CREATE POLICY all_orders ON orders FOR SELECT TO role_manager USING (true);
CREATE POLICY own_items ON order_item FOR SELECT TO role_customer
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.order_id = order_item.order_id));
CREATE POLICY all_items ON order_item FOR SELECT TO role_manager USING (true);

DO $$
DECLARE r RECORD;
  m JSONB := '{
    "role_customer": ["sp_place_order","sp_cancel_order","fn_order_summary","fn_current_user_id","fn_current_role","fn_security_test"],
    "role_manager": ["sp_set_order_status","sp_add_product","sp_update_product","sp_delete_product","sp_refresh_reports",
                     "fn_top_products","fn_category_tree","fn_customer_insights","fn_revenue_rollup","fn_explain_orders"],
    "role_admin": ["sp_set_user_role","sp_delete_user"]
  }';
BEGIN
  FOR r IN
    SELECT e.key AS role_name, p.oid::regprocedure AS sig
    FROM jsonb_each(m) e CROSS JOIN LATERAL jsonb_array_elements_text(e.value) n(fname)
    JOIN pg_proc p ON p.proname = n.fname AND p.pronamespace = 'shop'::regnamespace
  LOOP
    EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO %I', r.sig, r.role_name);
  END LOOP;
END $$;
