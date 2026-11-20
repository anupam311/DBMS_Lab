SET search_path = shop, public;

CREATE FUNCTION tf_order_item_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE p product%ROWTYPE;
BEGIN
  SELECT * INTO p FROM product WHERE prod_id = NEW.prod_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product % does not exist', NEW.prod_id;
  END IF;
  IF p.stock < NEW.qty THEN
    RAISE EXCEPTION 'Not enough stock for % (have %, need %)', p.prod_name, p.stock, NEW.qty;
  END IF;
  UPDATE product SET stock = stock - NEW.qty WHERE prod_id = NEW.prod_id;
  NEW.unit_price := p.price;
  RAISE NOTICE 'Trigger tf_order_item_stock: locked % and reduced stock from % to %', p.prod_name, p.stock, p.stock - NEW.qty;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_order_item_stock BEFORE INSERT ON order_item
FOR EACH ROW EXECUTE FUNCTION tf_order_item_stock();

CREATE FUNCTION tf_order_item_total() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE v_order INT;
BEGIN
  IF TG_OP = 'DELETE' THEN v_order := OLD.order_id; ELSE v_order := NEW.order_id; END IF;
  UPDATE orders SET total = fn_order_total(v_order) WHERE order_id = v_order;
  RAISE NOTICE 'Trigger tf_order_item_total: total of order % recalculated', v_order;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_order_item_total AFTER INSERT OR UPDATE OR DELETE ON order_item
FOR EACH ROW EXECUTE FUNCTION tf_order_item_total();

CREATE FUNCTION tf_product_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
BEGIN
  IF OLD.price <> NEW.price THEN
    INSERT INTO audit_log (event, detail)
    VALUES ('PRICE_CHANGE', OLD.prod_name || ': ' || OLD.price || ' -> ' || NEW.price);
    RAISE NOTICE 'Trigger tf_product_audit: price of % changed from % to %', OLD.prod_name, OLD.price, NEW.price;
  END IF;
  IF NEW.stock < 5 AND OLD.stock >= 5 THEN
    INSERT INTO audit_log (event, detail) VALUES ('LOW_STOCK', NEW.prod_name || ' has only ' || NEW.stock || ' left');
    RAISE NOTICE 'Trigger tf_product_audit: low stock alert for %', NEW.prod_name;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_product_audit AFTER UPDATE ON product
FOR EACH ROW EXECUTE FUNCTION tf_product_audit();

CREATE FUNCTION tf_order_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('DELIVERED', 'CANCELLED') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'A % order cannot be changed any more', OLD.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_order_status_guard BEFORE UPDATE OF status ON orders
FOR EACH ROW EXECUTE FUNCTION tf_order_status_guard();

CREATE FUNCTION tf_order_cancel_restock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = shop, public AS $$
DECLARE
  cur CURSOR (p_order INT) FOR SELECT prod_id, qty FROM order_item WHERE order_id = p_order;
  r RECORD;
BEGIN
  OPEN cur(NEW.order_id);
  LOOP
    FETCH cur INTO r;
    EXIT WHEN NOT FOUND;
    UPDATE product SET stock = stock + r.qty WHERE prod_id = r.prod_id;
    RAISE NOTICE 'Cursor loop: put % unit(s) of product % back in stock', r.qty, r.prod_id;
  END LOOP;
  CLOSE cur;
  INSERT INTO audit_log (event, detail) VALUES ('ORDER_CANCELLED', 'Order #' || NEW.order_id);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_order_cancel_restock AFTER UPDATE OF status ON orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'CANCELLED')
EXECUTE FUNCTION tf_order_cancel_restock();
