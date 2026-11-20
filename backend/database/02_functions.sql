SET search_path = shop, public;

CREATE FUNCTION fn_current_user_id() RETURNS INT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::int
$$;

CREATE FUNCTION fn_current_role() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.role', true), '')
$$;

CREATE FUNCTION fn_order_total(p_order_id INT) RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(qty * unit_price), 0) FROM order_item WHERE order_id = p_order_id
$$;

CREATE FUNCTION fn_register(p_name TEXT, p_email TEXT, p_password TEXT, p_city TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE v_id INT;
BEGIN
  IF p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  IF length(COALESCE(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;
  INSERT INTO app_user (name, email, password_hash, city)
  VALUES (p_name, lower(p_email), crypt(p_password, gen_salt('bf')), p_city)
  RETURNING user_id INTO v_id;
  INSERT INTO audit_log (event, detail) VALUES ('REGISTER', lower(p_email));
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That email is already registered';
END $$;

CREATE FUNCTION fn_login(p_email TEXT, p_password TEXT)
RETURNS TABLE (token UUID, user_id INT, name VARCHAR, role VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
DECLARE u app_user%ROWTYPE; v_token UUID;
BEGIN
  SELECT * INTO u FROM app_user WHERE email = lower(p_email);
  IF NOT FOUND OR u.password_hash <> crypt(p_password, u.password_hash) THEN
    INSERT INTO audit_log (event, detail) VALUES ('LOGIN_FAILED', COALESCE(p_email, ''));
    RETURN;
  END IF;
  INSERT INTO user_session (user_id) VALUES (u.user_id) RETURNING user_session.token INTO v_token;
  INSERT INTO audit_log (event, detail) VALUES ('LOGIN', u.email);
  RETURN QUERY SELECT v_token, u.user_id, u.name, u.role;
END $$;

CREATE FUNCTION fn_session(p_token TEXT)
RETURNS TABLE (user_id INT, name VARCHAR, role VARCHAR)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
    SELECT u.user_id, u.name, u.role
    FROM user_session s JOIN app_user u ON u.user_id = s.user_id
    WHERE s.token::text = p_token AND s.expires_at > NOW();
END $$;

CREATE FUNCTION fn_logout(p_token TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = shop, public AS $$
  DELETE FROM user_session WHERE token::text = p_token
$$;
