SET search_path = shop, public;

CREATE PROCEDURE sp_place_order(p_items JSONB, INOUT p_order_id INT DEFAULT NULL)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE v_user INT := fn_current_user_id(); v_item JSONB;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not logged in'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one item to the order';
  END IF;
  INSERT INTO orders (user_id) VALUES (v_user) RETURNING order_id INTO p_order_id;
  FOR v_item IN SELECT jsonb_array_elements(p_items) LOOP
    INSERT INTO order_item (order_id, prod_id, qty)
    VALUES (p_order_id, (v_item->>'prod_id')::int, (v_item->>'qty')::int);
  END LOOP;
  RAISE NOTICE 'Procedure sp_place_order: order % created for user %', p_order_id, v_user;
END $$;

CREATE PROCEDURE sp_cancel_order(p_order_id INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE o orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  IF fn_current_role() = 'customer' AND o.user_id <> fn_current_user_id() THEN
    RAISE EXCEPTION 'You can only cancel your own orders';
  END IF;
  IF o.status = 'CANCELLED' THEN RAISE EXCEPTION 'Order % is already cancelled', p_order_id; END IF;
  UPDATE orders SET status = 'CANCELLED' WHERE order_id = p_order_id;
END $$;

CREATE PROCEDURE sp_set_order_status(p_order_id INT, p_status VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  UPDATE orders SET status = p_status WHERE order_id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Status must be PLACED, SHIPPED, DELIVERED or CANCELLED';
END $$;

CREATE PROCEDURE sp_add_product(p_name VARCHAR, p_cat INT, p_price NUMERIC, p_stock INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  INSERT INTO product (prod_name, cat_id, price, stock) VALUES (p_name, p_cat, p_price, p_stock);
EXCEPTION
  WHEN check_violation THEN RAISE EXCEPTION 'Price must be above 0 and stock cannot be negative';
  WHEN not_null_violation THEN RAISE EXCEPTION 'Name, category, price and stock are all required';
  WHEN foreign_key_violation THEN RAISE EXCEPTION 'Choose a valid category';
END $$;

CREATE PROCEDURE sp_update_product(p_id INT, p_name VARCHAR, p_cat INT, p_price NUMERIC, p_stock INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  UPDATE product SET prod_name = p_name, cat_id = p_cat, price = p_price, stock = p_stock WHERE prod_id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_id; END IF;
EXCEPTION
  WHEN check_violation THEN RAISE EXCEPTION 'Price must be above 0 and stock cannot be negative';
  WHEN not_null_violation THEN RAISE EXCEPTION 'Name, category, price and stock are all required';
  WHEN foreign_key_violation THEN RAISE EXCEPTION 'Choose a valid category';
END $$;

CREATE PROCEDURE sp_delete_product(p_id INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  DELETE FROM product WHERE prod_id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product % not found', p_id; END IF;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'This product appears in past orders, so it cannot be deleted';
END $$;

CREATE PROCEDURE sp_set_user_role(p_user_id INT, p_role VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF p_user_id = fn_current_user_id() THEN RAISE EXCEPTION 'You cannot change your own role'; END IF;
  UPDATE app_user SET role = p_role WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_user_id; END IF;
  INSERT INTO audit_log (event, detail) VALUES ('ROLE_CHANGE', 'User ' || p_user_id || ' is now ' || p_role);
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'Role must be admin, manager or customer';
END $$;

CREATE PROCEDURE sp_delete_user(p_user_id INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF p_user_id = fn_current_user_id() THEN RAISE EXCEPTION 'You cannot delete your own account'; END IF;
  DELETE FROM app_user WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User % not found', p_user_id; END IF;
EXCEPTION WHEN foreign_key_violation THEN
  RAISE EXCEPTION 'This user has orders, so the account cannot be deleted';
END $$;

CREATE PROCEDURE sp_refresh_reports()
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_daily_sales;
  RAISE NOTICE 'Procedure sp_refresh_reports: materialized view mv_daily_sales refreshed';
END $$;
