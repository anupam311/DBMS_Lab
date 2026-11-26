# Stockline

**Database-driven order and inventory management.**

Stockline is an order, stock and reporting platform in which PostgreSQL is the system of record and the system of logic. Stock control, pricing, validation, auditing, authentication and access control are implemented inside the database as functions, procedures, triggers, views and roles. The API layer is deliberately thin: it verifies a session, assumes the caller's database role and invokes a single routine. Every client that talks to the database therefore gets the same rules, and none of them can bypass them.

## Live demo

https://capstone-stockline-frontend.onrender.com

## Contents

1. [Capabilities](#capabilities)
2. [Architecture](#architecture)
3. [Data model](#data-model)
4. [Database logic](#database-logic)
5. [Core SQL operations](#core-sql-operations)
6. [Security model](#security-model)
7. [Transactions and concurrency](#transactions-and-concurrency)
8. [API reference](#api-reference)
9. [Getting started](#getting-started)
10. [Loading real data](#loading-real-data)
11. [Configuration](#configuration)
12. [Deployment](#deployment)
13. [Observability](#observability)
14. [Project structure](#project-structure)
15. [Limitations](#limitations)
16. [Roadmap](#roadmap)

## Capabilities

| Area | What it provides |
|---|---|
| Catalogue | Products and a self-referencing category hierarchy, with full create, read, update and delete for staff |
| Orders | Atomic order placement, status workflow (placed, shipped, delivered, cancelled), customer self-service cancellation with automatic restocking |
| Inventory integrity | Stock is checked, locked and deducted by the database at the moment an order line is written, so overselling is not possible |
| Browsing and search | Server-side search, filtering, sorting and pagination of products and orders |
| Data maintenance | Single-row and set-based INSERT, UPDATE and DELETE: product and category maintenance, bulk price changes, restocking, cloning, clean-up of unsold products |
| Analytics | Dashboard of aggregates by status, month and city, plus ranked and rolled-up reports |
| Learning tools | An in-app SQL console, a live schema explorer and transaction and savepoint demonstrations (staff only) |
| Reporting | Ranked product performance, category tree, customer segmentation, revenue roll-up with subtotals, daily sales from a materialized view, query-plan inspection |
| Audit | Price changes, low-stock events, cancellations, logins and role changes are recorded by the database itself |
| Access control | Role-based access with three inheriting roles, column-level privileges and row-level security |
| Authentication | Bcrypt-hashed passwords and expiring session tokens, handled entirely in SQL |

## Architecture

```
  Browser (React)
       |  JSON over HTTPS
       v
  API (Express)            - verifies the session token
       |                   - BEGIN; SET LOCAL ROLE <caller's role>
       |                   - calls ONE function, procedure or view
       v
  PostgreSQL               - procedures, triggers, constraints
                           - roles, privileges, row-level security
```

**Request lifecycle**

1. The client sends a request with `Authorization: Bearer <token>`.
2. The API resolves the token with `fn_session`. Unknown or expired tokens receive `401`.
3. Inside one transaction, the API runs `SET LOCAL ROLE role_<caller>` and publishes the caller's id and role as transaction-local settings.
4. The API executes the endpoint's single routine, for example `CALL sp_place_order(...)`.
5. The transaction commits, or rolls back in full if any statement raised an exception.

The front end sends and receives JSON only. No table, column or SQL text exists in the client code.

## Data model

Everything lives in a dedicated schema named `shop`.

| Table | Purpose |
|---|---|
| `app_user` | Accounts: name, unique email, password hash, role, city |
| `user_session` | Session tokens with creation and expiry time (8 hours) |
| `category` | Product categories; `parent_cat_id` references the same table to form a tree |
| `product` | Name, category, price (`CHECK > 0`), stock (`CHECK >= 0`) |
| `orders` | Header: customer, timestamp, total, status (`CHECK` on allowed values) |
| `order_item` | Lines, keyed by (order, product), with quantity and the unit price at purchase |
| `audit_log` | Event, detail, database role, timestamp |

**Normalization.** The schema is in third normal form. Order lines are rows, not embedded lists (1NF). `order_item` carries only attributes that depend on the whole composite key (2NF). Category and product names are referenced by key and never repeated (3NF). Two columns are deliberate and documented exceptions: `orders.total` is derived data maintained by a trigger so that order listings need no aggregation, and `order_item.unit_price` snapshots the price at purchase because catalogue prices change while historical orders must not.

**Indexes.** `idx_orders_user_date (user_id, order_date)` serves per-customer order history, and `idx_product_cat (cat_id)` serves category lookups. The *Index check* report displays the live query plan.

## Database logic

### Procedures (state-changing operations)

| Procedure | Responsibility |
|---|---|
| `sp_place_order` | Creates an order and its lines from a JSON array; returns the new order id through an `INOUT` parameter |
| `sp_cancel_order` | Cancels an order after verifying ownership (customers) |
| `sp_set_order_status` | Staff status changes |
| `sp_add_product`, `sp_update_product`, `sp_delete_product` | Catalogue maintenance with friendly error translation |
| `sp_set_user_role`, `sp_delete_user` | Administration, with protection against self-modification |
| `sp_refresh_reports` | Refreshes the materialized daily sales view |

### Functions (reads and computation)

`fn_login`, `fn_register`, `fn_session`, `fn_logout`, `fn_order_total`, `fn_order_summary`, `fn_top_products` (window function), `fn_category_tree` (recursive CTE), `fn_customer_insights` (subqueries, `NOT EXISTS`, `UNION`), `fn_revenue_rollup` (`ROLLUP`), `fn_explain_orders`, and `fn_security_test`.

### Triggers

| Trigger | Event | Behaviour |
|---|---|---|
| `trg_order_item_stock` | Before insert on `order_item` | Locks the product row, rejects insufficient stock, deducts stock, stamps the unit price |
| `trg_order_item_total` | After insert, update or delete on `order_item` | Recomputes the order total |
| `trg_product_audit` | After update on `product` | Logs price changes and low-stock transitions |
| `trg_order_status_guard` | Before update of `status` | Prevents changes to delivered or cancelled orders |
| `trg_order_cancel_restock` | After status becomes cancelled | Returns stock using an explicit parameterised cursor |

### Views

`v_catalog`, `v_category` (self join), `v_user_list`, `v_audit`, `v_sales_item`, `v_daily_sales`, and the materialized view `mv_daily_sales`.

## Core SQL operations

The everyday SQL operations are exposed through the interface, so each can be shown live.

| Concept | Where to see it |
|---|---|
| `INSERT` | Add product; add category (an upsert using `INSERT ... ON CONFLICT`); copy a product (`INSERT ... SELECT`); placing an order |
| `UPDATE` | Edit a product; rename or move a category; change order status; edit profile; change password; bulk price change and restocking (many rows in one statement) |
| `DELETE` | Delete a product, category, user or order; "Delete unsold" (`DELETE ... WHERE NOT EXISTS`) |
| `WHERE`, `ILIKE`, `BETWEEN`, `IN` | Search and filter bars on Shop, Products and Orders |
| `ORDER BY` | Sort selector and clickable column headings |
| `LIMIT` and `OFFSET` | Page-by-page browsing, with the total supplied by `COUNT(*) OVER ()` |
| Aggregates, `GROUP BY`, `HAVING` | Dashboard: totals, averages, extremes, by status, by month, by city |
| Date and string functions | Dashboard monthly revenue; SQL console examples |
| DDL, data types, constraints | SQL lab, Schema explorer (read from the system catalog) |
| Transactions, `COMMIT`, `ROLLBACK`, savepoints | SQL lab, Transactions |
| Free-form querying | SQL lab, SQL console |

Search and sort functions (`fn_search_products`, `fn_search_orders`) use dynamic SQL. The sort column is chosen from a fixed list inside the function and values are passed as parameters, so user input is never concatenated into the statement.

**SQL console safeguards.** Queries run under the caller's own database role, so they can read only what that role may read (the password hash, for example, is refused). They must start with `SELECT`, `WITH`, `VALUES` or `TABLE`, contain a single statement, run in a read-only transaction, are cancelled after three seconds and return at most 200 rows. Only staff roles may execute the function.

## Security model

**Roles.** Three group roles with no login of their own, arranged as a hierarchy: `role_admin` inherits `role_manager`, which inherits `role_customer`. Default public access to every table and routine is revoked, then privileges are granted explicitly.

| Capability | Customer | Manager | Admin |
|---|:---:|:---:|:---:|
| Browse catalogue, place and cancel own orders | Yes | Yes | Yes |
| Maintain products, change order status | | Yes | Yes |
| Reports and audit log | | Yes | Yes |
| User administration | | | Yes |

**Layers of enforcement**

- **Privileges:** `EXECUTE` is granted per routine and `SELECT` per view. Nobody holds write access to the tables directly.
- **Column-level privileges:** customers may read `user_id`, `name` and `city` of `app_user`. The password hash is not readable by any application role.
- **Row-level security:** policies on `orders` and `order_item` restrict customers to their own rows while staff see all rows.
- **`SECURITY DEFINER` routines:** state-changing procedures and trigger functions run with the owner's rights and a pinned `search_path`, so lower roles can complete business operations without table access.
- **Authentication:** passwords are stored with bcrypt (`pgcrypto`). Failed logins are audited. Logging out deletes the session row.

The in-app **Security lab** runs four probe actions under the caller's role and reports whether PostgreSQL allowed or denied them.

## Transactions and concurrency

Every API call is a single transaction, so each operation is all-or-nothing. A failed order leaves no order, no lines and no stock change.

Stock deduction takes a row lock with `SELECT ... FOR UPDATE`. When two customers buy the last unit, the second waits for the first to commit and then sees the updated stock. `backend/database/demo_concurrency.sql` contains guided two-session scenarios for row locking, a lost update, a deadlock and isolation levels. The default isolation level is `READ COMMITTED`.

## API reference

All routes are under `/api`. Roles shown are the minimum database role required; the database enforces them.

| Method and path | Database call | Minimum role |
|---|---|---|
| `POST /auth/login` | `fn_login` | Public |
| `POST /auth/register` | `fn_register` | Public |
| `POST /auth/logout` | `fn_logout` | Any session |
| `GET /catalog`, `GET /categories` | `v_catalog`, `v_category` | Customer |
| `GET /orders` | `fn_order_summary()` | Customer (own rows), Manager (all) |
| `POST /orders` | `sp_place_order` | Customer |
| `DELETE /orders/:id` | `sp_cancel_order` | Customer (own), Manager |
| `PUT /orders/:id/status` | `sp_set_order_status` | Manager |
| `GET /products` | `v_catalog` | Customer |
| `POST /products`, `PUT /products/:id`, `DELETE /products/:id` | `sp_add_product`, `sp_update_product`, `sp_delete_product` | Manager |
| `GET /reports/top-products`, `category-tree`, `insights`, `rollup`, `explain` | `fn_top_products`, `fn_category_tree`, `fn_customer_insights`, `fn_revenue_rollup`, `fn_explain_orders` | Manager |
| `GET /reports/daily`, `GET /reports/audit` | `v_daily_sales`, `v_audit` | Manager |
| `POST /reports/refresh` | `sp_refresh_reports` | Manager |
| `GET /users`, `PUT /users/:id/role`, `DELETE /users/:id` | `v_user_list`, `sp_set_user_role`, `sp_delete_user` | Admin |
| `POST /security/test` | `fn_security_test` | Any session |
| `GET /catalog/search` | `fn_search_products` | Customer |
| `GET /orders/search` | `fn_search_orders` | Customer (own rows), Manager (all) |
| `POST /categories`, `PUT /categories/:id`, `DELETE /categories/:id` | `sp_add_category`, `sp_update_category`, `sp_delete_category` | Manager |
| `POST /products/bulk-price`, `POST /products/restock`, `DELETE /products/unsold`, `POST /products/:id/clone` | `sp_bulk_price_change`, `sp_restock_low`, `sp_delete_unsold_products`, `sp_clone_product` | Manager |
| `GET /profile`, `PUT /profile`, `POST /profile/password` | `fn_my_profile`, `sp_update_profile`, `sp_change_password` | Customer |
| `GET /dashboard/summary`, `status`, `monthly`, `cities` | `fn_dashboard`, `fn_orders_by_status`, `fn_sales_by_month`, `fn_sales_by_city` | Manager |
| `GET /lab/schema/columns`, `constraints`, `indexes` | `fn_schema_columns`, `fn_schema_constraints`, `fn_schema_indexes` | Manager |
| `POST /lab/sql` | `fn_run_select` | Manager |
| `POST /lab/txn/commit`, `rollback`, `savepoint` | `sp_demo_stock_change`, `fn_savepoint_demo` | Manager |

Responses use the shape `{ ok, data, message }` on success and `{ ok: false, error }` on failure. Errors raised by the database carry user-readable messages.

## Getting started

**Requirements:** Node.js 18 or later; PostgreSQL 13 or later with the `pgcrypto` extension available (included in standard distributions); a role permitted to create roles and extensions.

1. Create an empty database (for example `stockline`) using pgAdmin or `createdb`.
2. In `backend/`, copy `.env.example` to `.env` and set the connection values.
3. Install dependencies and initialise the database:
   ```
   cd backend
   npm install
   npm run setup
   ```
   `setup` executes the numbered SQL files in order and loads sample data. **It drops and recreates the `shop` schema**, so never run it against data you want to keep.
4. Start the API: `npm run dev` (port 5000).
5. In a second terminal, start the front end:
   ```
   cd frontend
   npm install
   npm run dev
   ```
6. Open `http://localhost:5173`.

**Seed accounts** (change or remove before exposing the system to anyone else):

| Role | Email | Password |
|---|---|---|
| Admin | admin@shop.com | admin123 |
| Manager | manager@shop.com | manager123 |
| Customer | aman@mail.com | customer123 |

Two further customers, `bhavna@mail.com` and `chirag@mail.com`, use the same customer password.

**How the data is mapped**

| Table | Source | What is real and what is generated |
|---|---|---|
| `app_user` | Customers file | City and the unique customer identity are real. Names and e-mail addresses are generated because the dataset is anonymised. Every imported customer has the password `customer123`. |
| `category` | Category translation file | Category names are real. The dataset is flat, so they are grouped under nine parent categories to form a tree. |
| `product` | Products and order items files | Category and the average selling price are real. The dataset has no product names, so a name is built from the category and a short id. **Stock levels are generated.** |
| `orders` | Orders file | Date and status are real. Statuses map as delivered to DELIVERED, shipped to SHIPPED, canceled to CANCELLED, and everything else to PLACED. |
| `order_item` | Order items file | Real lines, with repeated products in one order merged into a single line with a quantity. |

**What the import does**

- It selects a reproducible sample of orders that have at least one valid line, then loads only the customers and products those orders use.
- All work happens in one transaction through temporary staging tables. If anything fails, nothing changes.
- The business triggers are switched off during the bulk load, so historical orders do not alter stock, and are switched back on before the transaction commits. Order totals are then recalculated and the daily sales view is refreshed.
- It replaces the existing products, categories, orders, order lines, customers and audit log. The `admin` and `manager` accounts are kept. The most active imported customer is renamed `aman@mail.com` so the demo customer login keeps working.
- Running it again replaces the data again. The dataset itself is excluded from version control by `.gitignore`.

## Configuration

**Backend (`backend/.env`)**

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `5000` |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Local connection settings | `localhost`, `5432`, `postgres`, none, `ecommerce_app` |
| `DATABASE_URL` | Full connection string; overrides the `PG*` values and enables TLS for remote hosts | unset |
| `CORS_ORIGIN` | Comma-separated list of allowed front-end origins | any origin |
| `DEMO_MODE` | `true` returns the database activity log with every response; `false` returns none | `true` |

**Frontend (`frontend/.env`)**

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Public URL of the API when it is hosted separately. Read at build time, so rebuild after changing it. |

## Deployment

The system consists of three independently hosted parts: a PostgreSQL database, the Node API, and the static front end. Any provider that offers those will work. A typical low-cost arrangement is Neon for PostgreSQL, a Render web service for the API and a Render static site for the front end. Free plans change over time and may suspend idle services, so check the provider's current terms.

1. **Database.** Create a PostgreSQL database and copy its **direct (non-pooled)** connection string. Set it as `DATABASE_URL` in `backend/.env` and run `npm run setup` once.
2. **API.** Deploy `backend/` with build command `npm install` and start command `npm start`. Set `DATABASE_URL` and `DEMO_MODE=false`.
3. **Front end.** Deploy `frontend/` with build command `npm install && npm run build` and publish directory `dist`. Set `VITE_API_URL` to the API's public URL, without a trailing slash.
4. **Cross-origin access.** Set `CORS_ORIGIN` on the API to the front end's URL and redeploy it.

If the database provider suspends idle compute, the first request after a pause is slower. The API's connection pool handles dropped idle connections and reconnects on demand.

## Observability

The API prints every request to its console, together with each SQL statement it executed, its duration, and every `NOTICE` raised inside the database by procedures and triggers. This shows exactly what the database did for a given request. With `DEMO_MODE=true` the same record is returned to the browser and displayed in the *Behind the scenes* panel. With `DEMO_MODE=false` responses carry no database detail, while the server console continues to log it.

## Project structure

```
backend/
  database/        01_schema.sql ... 09_access.sql, setup.js, demo_concurrency.sql,
                   import_olist.js and import_olist.sql (real-data import)
  data/olist/      place the Olist CSV files here (not committed)
  config/db.js     connection pool and TLS handling
  lib/run.js       session check, role switching, transaction, activity log
  routes/api.js    one line per endpoint
  server.js
frontend/
  src/pages/       Shop, Orders, Products, Dashboard, Reports, Lab, Profile, Users, Security
  src/components/  Login, CrudPage, Table, Inspector
  src/api.js       fetch wrapper with bearer token
```

The SQL files are intentionally ordered by concern: schema, functions, triggers, procedures, reports, security, seed data, everyday operations (`08_basics.sql`) and the privileges for them (`09_access.sql`).

## Limitations

- The API tells the database who the caller is through transaction-local settings. This is safe only because the API is trusted and verifies the token first. A stricter design would use a distinct database login per user.
- Session tokens are kept in the browser's local storage. There is no password reset, no rate limiting on login and no multi-factor authentication.
- TLS termination is expected from the hosting platform.
- Free-text price and stock edits are validated by the database, but there is no optimistic concurrency control for two staff members editing the same product.
- There is no automated test suite yet; behaviour has been verified by exercising the API against a live database.

## Roadmap

- Payments and shipments tables with their own procedures and triggers
- Suppliers and purchase orders feeding stock replenishment
- Per-user database logins and a stricter trust boundary
- Automated database and API tests in continuous integration
- Table partitioning for `orders` and `audit_log` as volume grows
