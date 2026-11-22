SET search_path = shop, public;

INSERT INTO app_user (name, email, password_hash, role, city) VALUES
  ('Aisha Admin',   'admin@shop.com',   crypt('admin123',    gen_salt('bf')), 'admin',    'Delhi'),
  ('Manoj Manager', 'manager@shop.com', crypt('manager123',  gen_salt('bf')), 'manager',  'Mumbai'),
  ('Aman Verma',    'aman@mail.com',    crypt('customer123', gen_salt('bf')), 'customer', 'Delhi'),
  ('Bhavna Rao',    'bhavna@mail.com',  crypt('customer123', gen_salt('bf')), 'customer', 'Mumbai'),
  ('Chirag Sen',    'chirag@mail.com',  crypt('customer123', gen_salt('bf')), 'customer', 'Pune');

INSERT INTO category (cat_name) VALUES ('Electronics'), ('Stationery'), ('Books');
INSERT INTO category (cat_name, parent_cat_id) VALUES
  ('Mobiles', (SELECT cat_id FROM category WHERE cat_name = 'Electronics')),
  ('Laptops', (SELECT cat_id FROM category WHERE cat_name = 'Electronics'));

INSERT INTO product (prod_name, cat_id, price, stock) VALUES
  ('Pixel 8',              (SELECT cat_id FROM category WHERE cat_name = 'Mobiles'),      59999, 10),
  ('Galaxy A55',           (SELECT cat_id FROM category WHERE cat_name = 'Mobiles'),      29999, 15),
  ('MacBook Air',          (SELECT cat_id FROM category WHERE cat_name = 'Laptops'),      99999,  6),
  ('Wireless Mouse',       (SELECT cat_id FROM category WHERE cat_name = 'Electronics'),    799, 40),
  ('Notebook (pack of 5)', (SELECT cat_id FROM category WHERE cat_name = 'Stationery'),     250, 100),
  ('Gel Pen Set',          (SELECT cat_id FROM category WHERE cat_name = 'Stationery'),     120, 60),
  ('SQL Made Easy',        (SELECT cat_id FROM category WHERE cat_name = 'Books'),          499, 25),
  ('Database Systems',     (SELECT cat_id FROM category WHERE cat_name = 'Books'),          799, 12);

SELECT set_config('app.user_id', '3', false), set_config('app.role', 'customer', false);
CALL sp_place_order('[{"prod_id":1,"qty":2},{"prod_id":4,"qty":1}]'::jsonb, NULL);
CALL sp_place_order('[{"prod_id":5,"qty":3}]'::jsonb, NULL);
SELECT set_config('app.user_id', '4', false);
CALL sp_place_order('[{"prod_id":3,"qty":1},{"prod_id":7,"qty":2}]'::jsonb, NULL);
CALL sp_place_order('[{"prod_id":2,"qty":2}]'::jsonb, NULL);

UPDATE orders SET order_date = NOW() - INTERVAL '3 days' WHERE order_id = 1;
UPDATE orders SET order_date = NOW() - INTERVAL '1 day' WHERE order_id = 3;
UPDATE orders SET status = 'DELIVERED' WHERE order_id = 1;
SELECT set_config('app.user_id', '', false), set_config('app.role', '', false);

TRUNCATE audit_log RESTART IDENTITY;
INSERT INTO audit_log (event, detail) VALUES ('SETUP', 'Database created and sample data loaded');
REFRESH MATERIALIZED VIEW mv_daily_sales;
