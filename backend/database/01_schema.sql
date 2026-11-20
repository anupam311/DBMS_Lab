DROP SCHEMA IF EXISTS shop CASCADE;
CREATE SCHEMA shop;
SET search_path = shop, public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE app_user (
  user_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','manager','customer')),
  city VARCHAR(50)
);

CREATE TABLE user_session (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '8 hours'
);

CREATE TABLE category (
  cat_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cat_name VARCHAR(50) NOT NULL UNIQUE,
  parent_cat_id INT REFERENCES category(cat_id)
);

CREATE TABLE product (
  prod_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prod_name VARCHAR(100) NOT NULL,
  cat_id INT NOT NULL REFERENCES category(cat_id),
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  stock INT NOT NULL CHECK (stock >= 0)
);

CREATE TABLE orders (
  order_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INT NOT NULL REFERENCES app_user(user_id),
  order_date TIMESTAMP NOT NULL DEFAULT NOW(),
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PLACED' CHECK (status IN ('PLACED','SHIPPED','DELIVERED','CANCELLED'))
);

CREATE TABLE order_item (
  order_id INT NOT NULL REFERENCES orders(order_id),
  prod_id INT NOT NULL REFERENCES product(prod_id),
  qty INT NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (order_id, prod_id)
);

CREATE TABLE audit_log (
  log_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event VARCHAR(30) NOT NULL,
  detail TEXT,
  db_role TEXT NOT NULL DEFAULT current_user,
  logged_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_date ON orders (user_id, order_date);
CREATE INDEX idx_product_cat ON product (cat_id);
