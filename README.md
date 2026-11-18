# Stockwise

Inventory and warehouse management app built with React, Express, and MongoDB.

## Run locally

1. Copy `Backend/.env.example` to `Backend/.env`, set `MONGO_URI` and a long random `JWT_SECRET`, and replace the example administrator credentials. Use a MongoDB replica set (MongoDB Atlas works) for atomic stock/order workflows.
2. In a terminal, run `cd Backend`, `npm install`, `npm run create-admin`, and `npm run dev`.
3. In a second terminal, run `cd frontend`, copy `.env.example` to `.env`, then run `npm install` and `npm run dev`.
4. Sign in as Admin and create at least one Sales Representative and one Supplier from Team. Then, in another terminal, run `cd Backend` and `npm run seed:demo`. This adds eight persisted starter products, three demo warehouses with stock, sample Pending orders for existing sales representatives, sample Pending supply requests for existing suppliers, and opening stock transactions.
5. Configure all three ImageKit variables in `Backend/.env` to enable authenticated product/profile image uploads. Image uploads are validated and sent directly from the browser using short-lived server-signed credentials; the private key stays on the backend.

The API listens on port 5000 by default; the Vite UI uses port 5173. Public sign-up supports warehouse manager, supplier, and sales representative accounts. Administrators can create accounts with any supported role from Team.

If sign-in shows that the API is unreachable, keep the backend running in its own terminal with `cd Backend` then `npm run dev`. Check `http://localhost:5000/api/health`; it should return `{"status":"ok"}`. In the frontend terminal, `cd frontend` then `npm run dev`. The demo records are persisted in the configured MongoDB database by `npm run seed:demo`; rerunning it does not duplicate products, warehouses, stock records, orders, supply requests, or opening stock transactions. If no sales representative or supplier exists when seeding, create the role and rerun the script to add its sample records.

## API areas

- `/api/auth`: register, login, logout, current user
- `/api/users`, `/api/products`, `/api/warehouses`
- `/api/stock`, `/api/transactions`, `/api/orders`, `/api/supply-requests`
- `/api/upload/auth`, `/api/dashboard`, `/api/health`

Stock changes and order processing are written with their ledger transactions in MongoDB transactions. Sales orders begin as Pending and are deducted exactly once when moved to Processing; a sales representative can cancel only their own pending orders.

## Smoke-test checklist

1. Sign in with the administrator account configured in `Backend/.env` and create a warehouse manager, supplier, and sales representative from Team.
2. Assign a warehouse manager to the warehouse locations they should access. Managers only see assigned warehouses; sales representatives, suppliers, and administrators can choose from their permitted warehouse list. Starter products without a supplier assignment are visible to suppliers and may be requested; administrators can associate products with a particular supplier.
3. Sign in as the manager, record a stock-in followed by a stock-out, then verify the remaining balance and transaction ledger.
4. Sign in as the sales representative, select a warehouse, add multiple product lines to an order, and confirm the server-calculated total and Pending state.
5. As the administrator, process the order. Confirm stock is deducted once and the stock-out transaction appears. Attempt an order above available stock; it must be rejected.
6. Submit a supply request with multiple product lines and approve it as an administrator or an assigned warehouse manager; verify stock and the stock-in ledger entries.

Run `npm run test:workflow` in `Backend` to exercise the four-role API scenario against a disposable MongoDB database. The test uses a separate database name and drops only that test database when it finishes.
