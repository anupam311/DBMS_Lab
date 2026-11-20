SET search_path = shop, public;

CREATE VIEW v_catalog AS
SELECT p.prod_id, p.prod_name, p.cat_id, c.cat_name, p.price, p.stock
FROM product p JOIN category c ON c.cat_id = p.cat_id;

CREATE VIEW v_category AS
SELECT c.cat_id, c.cat_name, c.parent_cat_id, par.cat_name AS parent_name
FROM category c LEFT JOIN category par ON par.cat_id = c.parent_cat_id;

CREATE VIEW v_user_list AS
SELECT user_id, name, email, role, city FROM app_user;

CREATE VIEW v_audit AS
SELECT log_id, event, detail, db_role, logged_at FROM audit_log ORDER BY log_id DESC LIMIT 50;

CREATE VIEW v_sales_item AS
SELECT oi.order_id, oi.prod_id, oi.qty, oi.unit_price, o.order_date, o.user_id
FROM order_item oi JOIN orders o ON o.order_id = oi.order_id
WHERE o.status <> 'CANCELLED';

CREATE MATERIALIZED VIEW mv_daily_sales AS
SELECT order_date::date AS day, COUNT(DISTINCT order_id) AS orders_count, SUM(qty * unit_price) AS revenue
FROM v_sales_item GROUP BY order_date::date;

CREATE VIEW v_daily_sales AS SELECT day, orders_count, revenue FROM mv_daily_sales;

CREATE FUNCTION fn_order_summary()
RETURNS TABLE (order_id INT, customer VARCHAR, order_date TIMESTAMP, total NUMERIC, status VARCHAR, items BIGINT)
LANGUAGE plpgsql AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT o.order_id, u.name, o.order_date, o.total, o.status,
           (SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.order_id)
    FROM orders o JOIN app_user u ON u.user_id = o.user_id
    ORDER BY o.order_id DESC;
END $$;

CREATE FUNCTION fn_top_products()
RETURNS TABLE (cat_name VARCHAR, prod_name VARCHAR, units BIGINT, revenue NUMERIC, rank_in_category BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT t.cat_name, t.prod_name, t.units, t.revenue, t.rnk
    FROM (
      SELECT c.cat_name, p.prod_name,
             COALESCE(SUM(si.qty), 0)::bigint AS units,
             COALESCE(SUM(si.qty * si.unit_price), 0) AS revenue,
             RANK() OVER (PARTITION BY c.cat_id ORDER BY COALESCE(SUM(si.qty * si.unit_price), 0) DESC) AS rnk,
             c.cat_id
      FROM product p
      JOIN category c ON c.cat_id = p.cat_id
      LEFT JOIN v_sales_item si ON si.prod_id = p.prod_id
      GROUP BY c.cat_id, c.cat_name, p.prod_id, p.prod_name
    ) t
    ORDER BY t.cat_name, t.rnk;
END $$;

CREATE FUNCTION fn_category_tree()
RETURNS TABLE (cat_id INT, cat_name VARCHAR, depth INT, path TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    WITH RECURSIVE tree AS (
      SELECT c.cat_id, c.cat_name, 0 AS depth, c.cat_name::text AS path
      FROM category c WHERE c.parent_cat_id IS NULL
      UNION ALL
      SELECT c.cat_id, c.cat_name, t.depth + 1, t.path || ' > ' || c.cat_name
      FROM category c JOIN tree t ON c.parent_cat_id = t.cat_id
    )
    SELECT tree.cat_id, tree.cat_name, tree.depth, tree.path FROM tree ORDER BY tree.path;
END $$;

CREATE FUNCTION fn_customer_insights()
RETURNS TABLE (segment TEXT, customer VARCHAR, city VARCHAR, order_count BIGINT, spent NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT 'Never ordered'::text, u.name, u.city, 0::bigint, 0::numeric
    FROM app_user u
    WHERE u.role = 'customer'
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.user_id AND o.status <> 'CANCELLED')
    UNION
    SELECT 'Above-average spender'::text, u.name, u.city, COUNT(o.order_id), SUM(o.total)
    FROM app_user u JOIN orders o ON o.user_id = u.user_id
    WHERE o.status <> 'CANCELLED'
    GROUP BY u.user_id, u.name, u.city
    HAVING SUM(o.total) > (SELECT AVG(x.total) FROM orders x WHERE x.status <> 'CANCELLED');
END $$;

CREATE FUNCTION fn_revenue_rollup()
RETURNS TABLE (category TEXT, product TEXT, units BIGINT, revenue NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT CASE WHEN GROUPING(c.cat_name) = 1 THEN 'ALL CATEGORIES' ELSE c.cat_name::text END,
           CASE WHEN GROUPING(p.prod_name) = 1 THEN 'Subtotal' ELSE p.prod_name::text END,
           SUM(si.qty)::bigint, SUM(si.qty * si.unit_price)
    FROM v_sales_item si
    JOIN product p ON p.prod_id = si.prod_id
    JOIN category c ON c.cat_id = p.cat_id
    GROUP BY ROLLUP (c.cat_name, p.prod_name)
    ORDER BY GROUPING(c.cat_name), c.cat_name, GROUPING(p.prod_name), p.prod_name;
END $$;

CREATE FUNCTION fn_explain_orders() RETURNS TABLE (line TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE r RECORD;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);
  FOR r IN EXECUTE 'EXPLAIN SELECT * FROM orders WHERE user_id = 3 ORDER BY order_date DESC' LOOP
    line := r."QUERY PLAN";
    RETURN NEXT;
  END LOOP;
  PERFORM set_config('enable_seqscan', 'on', true);
END $$;
