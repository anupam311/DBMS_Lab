SET search_path = shop, public;

ALTER TABLE order_item DISABLE TRIGGER USER;
ALTER TABLE product DISABLE TRIGGER USER;
ALTER TABLE orders DISABLE TRIGGER USER;

TRUNCATE order_item, orders, product, category, audit_log RESTART IDENTITY;
DELETE FROM app_user WHERE role = 'customer';

CREATE TEMP TABLE tmp_pw ON COMMIT DROP AS
SELECT crypt('customer123', gen_salt('bf')) AS h;

CREATE TEMP TABLE tmp_orders ON COMMIT DROP AS
SELECT s.order_id AS olist_order_id, c.customer_unique_id, s.order_status,
       s.order_purchase_timestamp::timestamp AS purchased_at,
       row_number() OVER (ORDER BY s.order_purchase_timestamp::timestamp, s.order_id) AS new_id
FROM (
  SELECT so.* FROM stg_orders so
  WHERE so.order_purchase_timestamp IS NOT NULL
    AND EXISTS (SELECT 1 FROM stg_items i JOIN stg_products p ON p.product_id = i.product_id WHERE i.order_id = so.order_id)
  ORDER BY md5(so.order_id)
  LIMIT current_setting('import.order_limit')::int
) s
JOIN stg_customers c ON c.customer_id = s.customer_id;

CREATE TEMP TABLE tmp_users ON COMMIT DROP AS
SELECT d.customer_unique_id,
       (SELECT COALESCE(MAX(user_id), 0) FROM app_user) + row_number() OVER (ORDER BY d.customer_unique_id) AS new_id
FROM (SELECT DISTINCT customer_unique_id FROM tmp_orders) d;

INSERT INTO app_user (user_id, name, email, password_hash, role, city) OVERRIDING SYSTEM VALUE
SELECT u.new_id,
       'Customer ' || upper(left(u.customer_unique_id, 6)),
       'c' || left(u.customer_unique_id, 16) || '@example.com',
       (SELECT h FROM tmp_pw), 'customer',
       left(initcap(c.customer_city), 50)
FROM tmp_users u
JOIN (SELECT DISTINCT ON (customer_unique_id) customer_unique_id, customer_city
      FROM stg_customers ORDER BY customer_unique_id) c ON c.customer_unique_id = u.customer_unique_id;

CREATE TEMP TABLE tmp_prod ON COMMIT DROP AS
SELECT p.product_id AS olist_product_id,
       COALESCE(replace(replace(tr.product_category_name_english, 'fashio_', 'fashion_'), 'costruction', 'construction'),
                p.product_category_name, 'unknown') AS en,
       row_number() OVER (ORDER BY p.product_id) AS new_id,
       GREATEST(round(avg(i.price::numeric), 2), 0.01) AS price
FROM stg_items i
JOIN tmp_orders o ON o.olist_order_id = i.order_id
JOIN stg_products p ON p.product_id = i.product_id
LEFT JOIN stg_translation tr ON tr.product_category_name = p.product_category_name
GROUP BY p.product_id, tr.product_category_name_english, p.product_category_name;

CREATE TEMP TABLE tmp_cat ON COMMIT DROP AS
SELECT en,
       initcap(replace(en, '_', ' ')) AS child_name,
       CASE
         WHEN en ~ '^(computers|computers_accessories|electronics|telephony|fixed_telephony|tablets_printing_image|audio|pc_gamer|consoles_games|cine_photo)$' THEN 'Electronics & Computers'
         WHEN en ~ '^(bed_bath_table|housewares|la_cuisine|air_conditioning|office_furniture|kitchen_dining_laundry_garden_furniture)$|^furniture|^home_|^small_appliances' THEN 'Home & Furniture'
         WHEN en ~ '^fashi|^luggage|^watches' THEN 'Fashion & Accessories'
         WHEN en ~ '^(health_beauty|perfumery|diapers_and_hygiene)$' THEN 'Health & Beauty'
         WHEN en ~ '^(sports_leisure|toys|baby|cool_stuff|musical_instruments|pet_shop)$' THEN 'Sports, Toys & Baby'
         WHEN en ~ '^books|^(cds_dvds_musicals|dvds_blu_ray|music|art|arts_and_craftmanship|stationery)$' THEN 'Books, Media & Stationery'
         WHEN en ~ '^construction|^(garden_tools|auto|signaling_and_security|security_and_services|industry_commerce_and_business|agro_industry_and_commerce)$' THEN 'Tools, Garden & Industry'
         WHEN en ~ '^(food|food_drink|drinks)$' THEN 'Food & Drinks'
         ELSE 'Other & Gifts'
       END AS parent_name
FROM (SELECT DISTINCT en FROM tmp_prod) d;

INSERT INTO category (cat_id, cat_name, parent_cat_id) OVERRIDING SYSTEM VALUE
SELECT row_number() OVER (ORDER BY parent_name), parent_name, NULL
FROM (SELECT DISTINCT parent_name FROM tmp_cat) p;

INSERT INTO category (cat_id, cat_name, parent_cat_id) OVERRIDING SYSTEM VALUE
SELECT (SELECT MAX(cat_id) FROM category) + row_number() OVER (ORDER BY c.child_name), c.child_name, par.cat_id
FROM tmp_cat c
JOIN category par ON par.cat_name = c.parent_name AND par.parent_cat_id IS NULL;

INSERT INTO product (prod_id, prod_name, cat_id, price, stock) OVERRIDING SYSTEM VALUE
SELECT p.new_id,
       left(initcap(replace(p.en, '_', ' ')) || ' #' || upper(left(p.olist_product_id, 6)), 100),
       c.cat_id, p.price,
       CASE WHEN abs(hashtext(p.olist_product_id)) % 10 = 0 THEN abs(hashtext(p.olist_product_id)) % 5
            ELSE 20 + abs(hashtext(p.olist_product_id)) % 180 END
FROM tmp_prod p
JOIN category c ON c.cat_name = initcap(replace(p.en, '_', ' ')) AND c.parent_cat_id IS NOT NULL;

INSERT INTO orders (order_id, user_id, order_date, total, status) OVERRIDING SYSTEM VALUE
SELECT o.new_id, u.new_id, o.purchased_at, 0,
       CASE o.order_status WHEN 'delivered' THEN 'DELIVERED' WHEN 'shipped' THEN 'SHIPPED'
                           WHEN 'canceled' THEN 'CANCELLED' ELSE 'PLACED' END
FROM tmp_orders o
JOIN tmp_users u ON u.customer_unique_id = o.customer_unique_id;

INSERT INTO order_item (order_id, prod_id, qty, unit_price)
SELECT o.new_id, p.new_id, COUNT(*), round(avg(i.price::numeric), 2)
FROM stg_items i
JOIN tmp_orders o ON o.olist_order_id = i.order_id
JOIN tmp_prod p ON p.olist_product_id = i.product_id
GROUP BY o.new_id, p.new_id;

UPDATE orders o SET total = s.t
FROM (SELECT order_id, SUM(qty * unit_price) AS t FROM order_item GROUP BY order_id) s
WHERE s.order_id = o.order_id;

UPDATE app_user SET name = 'Aman Verma', email = 'aman@mail.com'
WHERE user_id = (SELECT user_id FROM orders GROUP BY user_id ORDER BY COUNT(*) DESC, user_id LIMIT 1);

ALTER TABLE order_item ENABLE TRIGGER USER;
ALTER TABLE product ENABLE TRIGGER USER;
ALTER TABLE orders ENABLE TRIGGER USER;

SELECT setval(pg_get_serial_sequence('category', 'cat_id'), (SELECT MAX(cat_id) FROM category));
SELECT setval(pg_get_serial_sequence('app_user', 'user_id'), (SELECT MAX(user_id) FROM app_user));
SELECT setval(pg_get_serial_sequence('product', 'prod_id'), (SELECT MAX(prod_id) FROM product));
SELECT setval(pg_get_serial_sequence('orders', 'order_id'), (SELECT MAX(order_id) FROM orders));

INSERT INTO audit_log (event, detail)
VALUES ('IMPORT', 'Loaded ' || (SELECT COUNT(*) FROM orders) || ' orders from the Olist dataset');
REFRESH MATERIALIZED VIEW mv_daily_sales;
