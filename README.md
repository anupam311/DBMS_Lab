# Blue Harbor Shop: a DBMS capstone built around the syllabus

React front end, Express backend, PostgreSQL database. The database does the work. The backend only checks who you are, switches to your database role, and calls one function or procedure. The front end never sees a table name.

```
shop-dbms/
  backend/
    database/   01_schema ... 07_seed .sql, setup.js, demo_concurrency.sql
    routes/api.js   the whole API: one line per endpoint, each calling a function, procedure or view
    lib/run.js      authentication check, SET ROLE, transaction, and the activity log
  frontend/     React (Vite), light colourful theme
```

## Run locally with pgAdmin
1. Install Node.js (LTS).
2. In pgAdmin create an empty database called ecommerce_app. (Everything lives in its own schema called shop.)
3. cd backend, copy .env.example to .env, set PGPASSWORD.
4. npm install, then npm run setup. This is the setup script: it creates every table, function, procedure, trigger, view, role and permission, then loads sample data. Run it again any time to reset (it drops and recreates the shop schema).
5. npm run dev (API on port 5000). Watch this terminal while you click: it prints every call and every NOTICE raised inside the database.
6. In a second terminal: cd frontend, npm install, npm run dev, then open http://localhost:5173.

Demo logins: admin@shop.com / admin123, manager@shop.com / manager123, aman@mail.com / customer123 (also bhavna@mail.com and chirag@mail.com, same password). You can also sign up as a new customer.

## Where each topic lives
| Syllabus topic | Where to find it |
|---|---|
| Database normalization | 01_schema.sql, see the section below |
| SQL joins | v_catalog, fn_order_summary (3 tables), the self join in v_category, LEFT JOINs in the reports |
| Advanced SQL | 05_reports.sql: views, a materialized view, window function (RANK), recursive CTE, subqueries, NOT EXISTS, UNION, ROLLUP, indexes plus EXPLAIN |
| PL/SQL fundamentals | PL/pgSQL throughout: variables, %ROWTYPE, IF, LOOP, FOR, RAISE, exception handling (fn_register, sp_add_product), and the DO block in demo_concurrency.sql |
| Functions | 02_functions.sql and the report functions in 05_reports.sql |
| Procedures | 04_procedures.sql: sp_place_order (INOUT parameter, JSON input), sp_cancel_order, product, user and report procedures |
| Triggers | 03_triggers.sql: stock deduction, order total, price and low-stock audit, status guard, restock on cancel |
| Cursors | tf_order_cancel_restock in 03_triggers.sql: an explicit parameterised cursor with OPEN, FETCH, CLOSE |
| Transactions and concurrency | Every API call runs in BEGIN ... COMMIT. A failed order rolls back completely. The stock trigger uses SELECT ... FOR UPDATE. demo_concurrency.sql walks through locking, a lost update, a deadlock and isolation levels using two pgAdmin windows. |
| Database security | 06_security.sql: roles (role_customer, role_manager, role_admin with inheritance), GRANT and REVOKE, column level privileges, row level security, SECURITY DEFINER, authentication with hashed passwords and session tokens (02_functions.sql), and the Security lab page |

## Normalization (what to say in your report)
- 1NF: every column holds one value. An order's products are not stored as a list inside orders; they are rows in order_item.
- 2NF: order_item has the composite key (order_id, prod_id) and its non-key columns (qty, unit_price) depend on both parts. Product name and price are not repeated there, they live in product.
- 3NF: category names are not repeated in product, only cat_id is. A user's role is stored once in app_user, not per order.
- Deliberate exceptions: orders.total is derived data, kept correct by the trigger tf_order_item_total so listing orders is cheap. order_item.unit_price copies the price at the time of purchase, because the product price can change later and old orders must keep their price.

## Hiding the database from the front end
- The browser only sends JSON to endpoints like POST /api/orders. No SQL, table or column names are in the front end code.
- DEMO_MODE=true in backend/.env sends the database activity to the "Behind the scenes" panel, so your professor can see the SQL working. Set DEMO_MODE=false when you deploy and the responses carry no database details at all. The backend terminal still prints everything.

## Put it online (example: Neon + Render; check each site's current free plan)
1. Database: create a Postgres database on Neon, copy its connection string. Put DATABASE_URL=... in backend/.env (remove the PG lines) and run npm run setup once. It needs permission to create roles and the pgcrypto extension, which Neon's default role has.
2. Backend: push the project to GitHub. On Render create a Web Service, Root Directory backend, Build npm install, Start npm start. Environment variables: DATABASE_URL, DEMO_MODE=false.
3. Frontend: create a Static Site (Render, Netlify or Vercel), Root Directory frontend, Build npm install && npm run build, Publish directory dist. Environment variable VITE_API_URL = your backend URL (no trailing slash).
4. On the backend service add CORS_ORIGIN = your frontend URL and redeploy.
The demo passwords are public in this README, so change them (or run setup with your own seed file) before sharing the link.

## Things to try
- Customer: place an order, then order more than the stock (rollback), then cancel an order and watch the cursor put stock back.
- Manager: change a product price, then Reports > Audit log. Try price 0.
- Security lab: press the four buttons as customer, manager and admin and compare.
- Customer: Orders shows only your orders. Manager sees all of them.
