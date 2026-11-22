-- Open TWO Query Tool windows in pgAdmin (call them A and B). Run each step in the order shown.
SET search_path = shop, public;

-- 1. Row locking (the trigger uses SELECT ... FOR UPDATE)
-- A:  BEGIN; SELECT stock FROM product WHERE prod_id = 1 FOR UPDATE;
-- B:  BEGIN; SELECT stock FROM product WHERE prod_id = 1 FOR UPDATE;   -- waits for A
-- A:  UPDATE product SET stock = stock - 1 WHERE prod_id = 1; COMMIT;  -- B now continues
-- B:  COMMIT;

-- 2. Lost update without a lock (both read the same stock, both write the same number)
-- A:  BEGIN; SELECT stock FROM product WHERE prod_id = 2;
-- B:  BEGIN; SELECT stock FROM product WHERE prod_id = 2;
-- A:  UPDATE product SET stock = 9 WHERE prod_id = 2; COMMIT;
-- B:  UPDATE product SET stock = 9 WHERE prod_id = 2; COMMIT;   -- one sale has vanished

-- 3. Deadlock
-- A:  BEGIN; UPDATE product SET stock = stock WHERE prod_id = 1;
-- B:  BEGIN; UPDATE product SET stock = stock WHERE prod_id = 2;
-- A:  UPDATE product SET stock = stock WHERE prod_id = 2;   -- waits
-- B:  UPDATE product SET stock = stock WHERE prod_id = 1;   -- PostgreSQL aborts one with "deadlock detected"

-- 4. Isolation levels
-- A:  BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT count(*) FROM orders;
-- B:  INSERT INTO orders (user_id) VALUES (3);
-- A:  SELECT count(*) FROM orders;   -- same count as before; at READ COMMITTED it would change
-- A:  COMMIT;

-- 5. A plain PL/pgSQL block (variables, IF, loop, exception handling)
DO $$
DECLARE v_total NUMERIC := 0; r RECORD;
BEGIN
  FOR r IN SELECT prod_name, price FROM product ORDER BY price DESC LIMIT 3 LOOP
    v_total := v_total + r.price;
    RAISE NOTICE '% costs %', r.prod_name, r.price;
  END LOOP;
  IF v_total > 100000 THEN RAISE NOTICE 'Top three together: %', v_total; END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Something went wrong: %', SQLERRM;
END $$;
