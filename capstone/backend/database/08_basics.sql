SET search_path = shop, public;

CREATE FUNCTION fn_search_products(
  p_text TEXT DEFAULT NULL, p_cat INT DEFAULT NULL,
  p_min NUMERIC DEFAULT NULL, p_max NUMERIC DEFAULT NULL, p_in_stock BOOLEAN DEFAULT FALSE,
  p_sort TEXT DEFAULT 'name', p_dir TEXT DEFAULT 'asc', p_limit INT DEFAULT 9, p_offset INT DEFAULT 0)
RETURNS TABLE (prod_id INT, prod_name VARCHAR, cat_id INT, cat_name VARCHAR, price NUMERIC, stock INT, total_rows BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
DECLARE v_col TEXT; v_dir TEXT;
BEGIN
  v_col := CASE p_sort WHEN 'name' THEN 'prod_name' WHEN 'price' THEN 'price' WHEN 'stock' THEN 'stock'
                       WHEN 'category' THEN 'cat_name' WHEN 'id' THEN 'prod_id' ELSE 'prod_name' END;
  v_dir := CASE WHEN lower(p_dir) = 'desc' THEN 'DESC' ELSE 'ASC' END;
  RETURN QUERY EXECUTE format(
    'SELECT v.prod_id, v.prod_name, v.cat_id, v.cat_name, v.price, v.stock, COUNT(*) OVER () AS total_rows
     FROM v_catalog v
     WHERE ($1 IS NULL OR v.prod_name ILIKE ''%%'' || $1 || ''%%'')
       AND ($2 IS NULL OR v.cat_id IN (SELECT c.cat_id FROM category c WHERE c.cat_id = $2 OR c.parent_cat_id = $2))
       AND ($3 IS NULL OR v.price >= $3) AND ($4 IS NULL OR v.price <= $4)
       AND (NOT $5 OR v.stock > 0)
     ORDER BY v.%I %s, v.prod_id
     LIMIT $6 OFFSET $7', v_col, v_dir)
  USING NULLIF(trim(p_text), ''), p_cat, p_min, p_max, COALESCE(p_in_stock, FALSE),
        LEAST(GREATEST(COALESCE(p_limit, 9), 1), 100), GREATEST(COALESCE(p_offset, 0), 0);
END $$;

CREATE FUNCTION fn_search_orders(
  p_status TEXT DEFAULT NULL, p_from DATE DEFAULT NULL, p_to DATE DEFAULT NULL, p_text TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT 'id', p_dir TEXT DEFAULT 'desc', p_limit INT DEFAULT 10, p_offset INT DEFAULT 0)
RETURNS TABLE (order_id INT, customer VARCHAR, order_date TIMESTAMP, total NUMERIC, status VARCHAR, items BIGINT, total_rows BIGINT)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE v_col TEXT; v_dir TEXT;
BEGIN
  v_col := CASE p_sort WHEN 'id' THEN 'o.order_id' WHEN 'date' THEN 'o.order_date' WHEN 'total' THEN 'o.total'
                       WHEN 'status' THEN 'o.status' WHEN 'customer' THEN 'u.name' WHEN 'items' THEN 'items'
                       ELSE 'o.order_id' END;
  v_dir := CASE WHEN lower(p_dir) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  RETURN QUERY EXECUTE format(
    'SELECT o.order_id, u.name, o.order_date, o.total, o.status,
            (SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.order_id) AS items,
            COUNT(*) OVER () AS total_rows
     FROM orders o JOIN app_user u ON u.user_id = o.user_id
     WHERE ($1 IS NULL OR o.status = $1)
       AND ($2 IS NULL OR o.order_date >= $2)
       AND ($3 IS NULL OR o.order_date < $3 + 1)
       AND ($4 IS NULL OR u.name ILIKE ''%%'' || $4 || ''%%'' OR o.order_id::text = $4)
     ORDER BY %s %s, o.order_id DESC
     LIMIT $5 OFFSET $6', v_col, v_dir)
  USING NULLIF(p_status, ''), p_from, p_to, NULLIF(trim(p_text), ''),
        LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100), GREATEST(COALESCE(p_offset, 0), 0);
END $$;

CREATE PROCEDURE sp_add_category(p_name VARCHAR, p_parent INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Category name is required'; END IF;
  INSERT INTO category (cat_name, parent_cat_id) VALUES (trim(p_name), p_parent)
  ON CONFLICT (cat_name) DO UPDATE SET parent_cat_id = EXCLUDED.parent_cat_id;
  RAISE NOTICE 'INSERT ... ON CONFLICT: category % saved (inserted, or updated because the name already existed)', trim(p_name);
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'Choose a valid parent category';
END $$;

CREATE PROCEDURE sp_update_category(p_id INT, p_name VARCHAR, p_parent INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Category name is required'; END IF;
  IF p_parent = p_id THEN RAISE EXCEPTION 'A category cannot be its own parent'; END IF;
  UPDATE category SET cat_name = trim(p_name), parent_cat_id = p_parent WHERE cat_id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category % not found', p_id; END IF;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'Another category already has that name';
  WHEN foreign_key_violation THEN RAISE EXCEPTION 'Choose a valid parent category';
END $$;

CREATE PROCEDURE sp_delete_category(p_id INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  DELETE FROM category WHERE cat_id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category % not found', p_id; END IF;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'This category still has products or sub-categories, so it cannot be deleted';
END $$;

CREATE PROCEDURE sp_bulk_price_change(p_cat INT, p_percent NUMERIC, INOUT p_changed INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF p_percent IS NULL OR p_percent < -90 OR p_percent > 500 THEN
    RAISE EXCEPTION 'Percent must be between -90 and 500';
  END IF;
  UPDATE product SET price = round(price * (1 + p_percent / 100), 2)
  WHERE p_cat IS NULL OR cat_id IN (SELECT c.cat_id FROM category c WHERE c.cat_id = p_cat OR c.parent_cat_id = p_cat);
  GET DIAGNOSTICS p_changed = ROW_COUNT;
  RAISE NOTICE 'UPDATE ... WHERE: % product(s) changed in one statement; the audit trigger fired once per row', p_changed;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'That change would make a price zero or negative, so nothing was changed';
END $$;

CREATE PROCEDURE sp_restock_low(p_below INT, p_add INT, INOUT p_changed INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF COALESCE(p_below, 0) < 1 OR COALESCE(p_add, 0) < 1 THEN
    RAISE EXCEPTION 'Both numbers must be at least 1';
  END IF;
  UPDATE product SET stock = stock + p_add WHERE stock < p_below;
  GET DIAGNOSTICS p_changed = ROW_COUNT;
  RAISE NOTICE 'UPDATE ... WHERE stock < %: % product(s) restocked', p_below, p_changed;
END $$;

CREATE PROCEDURE sp_delete_unsold_products(INOUT p_deleted INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  DELETE FROM product p WHERE NOT EXISTS (SELECT 1 FROM order_item oi WHERE oi.prod_id = p.prod_id);
  GET DIAGNOSTICS p_deleted = ROW_COUNT;
  RAISE NOTICE 'DELETE ... WHERE NOT EXISTS: % product(s) that were never ordered were removed', p_deleted;
END $$;

CREATE PROCEDURE sp_clone_product(p_id INT, INOUT p_new_id INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  INSERT INTO product (prod_name, cat_id, price, stock)
  SELECT left(prod_name, 90) || ' (copy)', cat_id, price, 0 FROM product WHERE prod_id = p_id
  RETURNING prod_id INTO p_new_id;
  IF p_new_id IS NULL THEN RAISE EXCEPTION 'Product % not found', p_id; END IF;
  RAISE NOTICE 'INSERT ... SELECT: product % copied as product %', p_id, p_new_id;
END $$;

CREATE FUNCTION fn_my_profile() RETURNS TABLE (user_id INT, name VARCHAR, email VARCHAR, role VARCHAR, city VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY SELECT u.user_id, u.name, u.email, u.role, u.city FROM app_user u WHERE u.user_id = fn_current_user_id();
END $$;

CREATE PROCEDURE sp_update_profile(p_name VARCHAR, p_city VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Name is required'; END IF;
  UPDATE app_user SET name = trim(p_name), city = NULLIF(trim(p_city), '') WHERE user_id = fn_current_user_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Not logged in'; END IF;
END $$;

CREATE PROCEDURE sp_change_password(p_old TEXT, p_new TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM app_user WHERE user_id = fn_current_user_id();
  IF v_hash IS NULL OR v_hash <> crypt(COALESCE(p_old, ''), v_hash) THEN
    RAISE EXCEPTION 'Current password is wrong';
  END IF;
  IF length(COALESCE(p_new, '')) < 6 THEN RAISE EXCEPTION 'New password must be at least 6 characters'; END IF;
  UPDATE app_user SET password_hash = crypt(p_new, gen_salt('bf')) WHERE user_id = fn_current_user_id();
  INSERT INTO audit_log (event, detail) VALUES ('PASSWORD_CHANGE', 'User ' || fn_current_user_id());
END $$;

CREATE FUNCTION fn_dashboard()
RETURNS TABLE (total_orders BIGINT, revenue NUMERIC, avg_order NUMERIC, min_order NUMERIC, max_order NUMERIC,
               customers BIGINT, products BIGINT, low_stock BIGINT, units_sold BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY SELECT
    (SELECT COUNT(*) FROM orders WHERE status <> 'CANCELLED'),
    (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status <> 'CANCELLED'),
    (SELECT COALESCE(ROUND(AVG(total), 2), 0) FROM orders WHERE status <> 'CANCELLED'),
    (SELECT COALESCE(MIN(total), 0) FROM orders WHERE status <> 'CANCELLED'),
    (SELECT COALESCE(MAX(total), 0) FROM orders WHERE status <> 'CANCELLED'),
    (SELECT COUNT(*) FROM app_user WHERE role = 'customer'),
    (SELECT COUNT(*) FROM product),
    (SELECT COUNT(*) FROM product WHERE stock < 5),
    (SELECT COALESCE(SUM(qty), 0)::bigint FROM v_sales_item);
END $$;

CREATE FUNCTION fn_orders_by_status() RETURNS TABLE (status VARCHAR, order_count BIGINT, amount NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY SELECT o.status, COUNT(*), COALESCE(SUM(o.total), 0) FROM orders o GROUP BY o.status ORDER BY o.status;
END $$;

CREATE FUNCTION fn_sales_by_month() RETURNS TABLE (month TEXT, order_count BIGINT, revenue NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT to_char(date_trunc('month', o.order_date), 'YYYY-MM'), COUNT(*), COALESCE(SUM(o.total), 0)
    FROM orders o WHERE o.status <> 'CANCELLED'
    GROUP BY date_trunc('month', o.order_date) ORDER BY date_trunc('month', o.order_date);
END $$;

CREATE FUNCTION fn_sales_by_city(p_min_orders INT DEFAULT 1)
RETURNS TABLE (city VARCHAR, customers BIGINT, order_count BIGINT, revenue NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT u.city, COUNT(DISTINCT u.user_id), COUNT(o.order_id), COALESCE(SUM(o.total), 0)
    FROM orders o JOIN app_user u ON u.user_id = o.user_id
    WHERE o.status <> 'CANCELLED'
    GROUP BY u.city HAVING COUNT(o.order_id) >= GREATEST(COALESCE(p_min_orders, 1), 1)
    ORDER BY 4 DESC LIMIT 15;
END $$;

CREATE FUNCTION fn_schema_columns()
RETURNS TABLE (table_name TEXT, column_name TEXT, data_type TEXT, nullable TEXT, column_default TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT c.table_name::text, c.column_name::text,
           (c.data_type || COALESCE('(' || c.character_maximum_length || ')', ''))::text,
           c.is_nullable::text, COALESCE(c.column_default, '')::text
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'shop' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position;
END $$;

CREATE FUNCTION fn_schema_constraints() RETURNS TABLE (table_name TEXT, constraint_name TEXT, kind TEXT, definition TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT c.conrelid::regclass::text, c.conname::text,
           CASE c.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'f' THEN 'FOREIGN KEY' WHEN 'u' THEN 'UNIQUE' ELSE 'CHECK' END,
           pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    WHERE c.connamespace = 'shop'::regnamespace AND c.contype IN ('p', 'f', 'u', 'c')
    ORDER BY 1, 3, 2;
END $$;

CREATE FUNCTION fn_schema_indexes() RETURNS TABLE (table_name TEXT, index_name TEXT, definition TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY SELECT i.tablename::text, i.indexname::text, i.indexdef::text
               FROM pg_indexes i WHERE i.schemaname = 'shop' ORDER BY 1, 2;
END $$;

CREATE FUNCTION fn_run_select(p_sql TEXT) RETURNS JSON
LANGUAGE plpgsql AS $$
DECLARE v_sql TEXT; v_result JSON;
BEGIN
  v_sql := regexp_replace(trim(COALESCE(p_sql, '')), ';\s*$', '');
  IF v_sql = '' THEN RAISE EXCEPTION 'Type a SELECT query first'; END IF;
  IF v_sql !~* '^(select|with|values|table)\y' THEN RAISE EXCEPTION 'Only SELECT queries are allowed in the lab'; END IF;
  IF position(';' IN v_sql) > 0 THEN RAISE EXCEPTION 'Run one statement at a time'; END IF;
  PERFORM set_config('transaction_read_only', 'on', true);
  EXECUTE format('SELECT COALESCE(json_agg(to_json(q)), ''[]''::json) FROM (SELECT * FROM (%s
) AS sub LIMIT 200) q', v_sql) INTO v_result;
  RETURN v_result;
END $$;

CREATE PROCEDURE sp_demo_stock_change(p_prod_id INT, p_delta INT, INOUT p_stock_after INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  UPDATE product SET stock = stock + p_delta WHERE prod_id = p_prod_id RETURNING stock INTO p_stock_after;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_prod_id; END IF;
  RAISE NOTICE 'Stock of product % is now % inside this transaction', p_prod_id, p_stock_after;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Stock cannot go below zero';
END $$;

CREATE FUNCTION fn_savepoint_demo(p_prod_id INT) RETURNS TABLE (step TEXT, stock_value INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
DECLARE s INT;
BEGIN
  SELECT stock INTO s FROM product WHERE prod_id = p_prod_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_prod_id; END IF;
  IF s < 2 THEN RAISE EXCEPTION 'Pick a product with at least 2 units in stock'; END IF;
  step := '1. Starting stock'; stock_value := s; RETURN NEXT;
  UPDATE product SET stock = stock - 1 WHERE prod_id = p_prod_id;
  SELECT stock INTO s FROM product WHERE prod_id = p_prod_id;
  step := '2. Outer work: sold 1 unit'; stock_value := s; RETURN NEXT;
  BEGIN
    UPDATE product SET stock = stock - 1 WHERE prod_id = p_prod_id;
    SELECT stock INTO s FROM product WHERE prod_id = p_prod_id;
    step := '3. Inner block (a savepoint): sold 1 more'; stock_value := s; RETURN NEXT;
    RAISE EXCEPTION 'simulated failure';
  EXCEPTION WHEN OTHERS THEN
    SELECT stock INTO s FROM product WHERE prod_id = p_prod_id;
    step := '4. Failure caught: only the inner block was rolled back'; stock_value := s; RETURN NEXT;
  END;
  step := '5. Outer work is still in place (the whole demo is rolled back afterwards, so nothing is saved)';
  stock_value := s; RETURN NEXT;
END $$;
