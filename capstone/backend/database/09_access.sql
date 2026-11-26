SET search_path = shop, public;

REVOKE ALL ON ALL TABLES IN SCHEMA shop FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA shop FROM PUBLIC;

GRANT SELECT ON product, category, v_sales_item TO role_manager;

DO $$
DECLARE r RECORD;
  m JSONB := '{
    "role_customer": ["fn_search_products","fn_search_orders","fn_my_profile","sp_update_profile","sp_change_password"],
    "role_manager": ["sp_add_category","sp_update_category","sp_delete_category","sp_bulk_price_change","sp_restock_low",
                     "sp_delete_unsold_products","sp_clone_product","fn_dashboard","fn_orders_by_status","fn_sales_by_month",
                     "fn_sales_by_city","fn_schema_columns","fn_schema_constraints","fn_schema_indexes","fn_run_select",
                     "sp_demo_stock_change","fn_savepoint_demo"]
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
