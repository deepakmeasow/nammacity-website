# Namma City – ONDC B2B Seller Platform

Namma City is a proof‑of‑concept web application that demonstrates how a seller‑focused B2B marketplace can be built on top of the **Open Network for Digital Commerce (ONDC)**.  The goal is to provide small and medium businesses with an easy way to register, pay a subscription, list their products and access the ONDC network for order fulfilment and logistics.

This repository contains a minimal backend built with Node.js and Express.  It exposes a REST API that supports seller registration and authentication, product catalog management, logistics provider selection and pricing information (including the ONDC network fee announced for 2025【954616984546978†L129-L143】).

> **Note:** This code is for demonstration purposes.  It uses in‑memory storage for sellers and products, and does not implement ONDC protocols such as Beckn messaging or HTTP signing.  For a production deployment you should integrate with the official ONDC sandbox or staging registry, implement secure password handling (hash and salt), use a proper database and follow the ONDC specifications for BPP (Seller App) endpoints.

## Features

- **Seller registration and login** – new sellers can register with a name, email, password and subscription plan.  A simple token (seller ID) is returned on login.
- **Monthly subscription** – the default subscription plan is a flat monthly fee.  Pricing information is exposed via the `/api/pricing` endpoint.
- **Product management** – sellers can create, update, list and delete products.  Each product includes a name, description, price, inventory quantity and optional image URL.
- **Logistics provider directory** – an endpoint lists logistics partners currently available on the ONDC network.  Providers include **Loadshare**, **Shiprocket**, **Dunzo**, **eKart**, **Ecom Express**, **Grab**, **Delhivery** and **DTDC**.  The application filters partners by city so sellers in Bangalore can choose hyperlocal delivery services like Loadshare and Dunzo【829694479860832†L18-L26】.
- **Network fee guidance** – the pricing endpoint returns the ONDC network fee (₹1.5 per transaction above ₹250, effective 1 January 2025) based on public announcements【954616984546978†L129-L143】.

## Getting started

1. Install the dependencies:
   ```bash
   cd namma-city-website
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The API will be available at `http://localhost:3000/`.

3. Use your favourite REST client (cURL, Postman, etc.) to interact with the API.  Examples:

   - **Register a seller**:

     ```bash
     curl -X POST http://localhost:3000/api/register \
       -H 'Content-Type: application/json' \
       -d '{"name":"Acme Traders","email":"acme@example.com","password":"secret","subscriptionPlan":"monthly"}'
     ```

   - **Login**:

     ```bash
     curl -X POST http://localhost:3000/api/login \
       -H 'Content-Type: application/json' \
       -d '{"email":"acme@example.com","password":"secret"}'
     ```

     The response will include a `token` which must be sent in the `x‑auth‑token` header for authenticated requests.

   - **Add a product**:

     ```bash
     curl -X POST http://localhost:3000/api/products \
       -H 'Content-Type: application/json' \
       -H 'x-auth-token: <token returned from login>' \
       -d '{"name":"Organic Banana","description":"Fresh bananas from local farms","price":45,"inventory":100,"imageUrl":"https://example.com/images/banana.jpg"}'
     ```

   - **Get logistics providers for Bangalore**:

     ```bash
     curl http://localhost:3000/api/delivery-providers?city=Bangalore
     ```

     This will return a list of logistics partners that serve Bangalore.  Loadshare’s description notes that it offers hyperlocal, standard, same‑day and next‑day delivery in Bangalore and other pilot cities【829694479860832†L18-L26】.

## Extending this project

To evolve Namma City into a fully compliant ONDC seller app (BPP), you will need to:

1. **Implement ONDC/Beckn protocols** – expose endpoints such as `/search`, `/on_search`, `/select`, `/on_select`, `/init`, `/on_init`, `/confirm`, `/on_confirm`, `/status` etc.  These endpoints should sign requests and verify signatures as per the ONDC security guidelines and handle asynchronous callbacks.
2. **Persist data** – replace the in‑memory arrays with a database (MongoDB, PostgreSQL, etc.).  Use an ORM or query builder for maintainability.
3. **Secure authentication** – hash and salt passwords, implement JWT tokens or sessions and use HTTPS.
4. **Integrate payments** – collect monthly subscription fees and handle ONDC transaction fee invoicing (ONDC invoices sellers monthly and payment is due within 10 days【954616984546978†L174-L202】).
5. **UI development** – build a responsive frontend (React/Next.js) for sellers to manage their products, subscriptions and orders.  Connect it to the API implemented here.
6. **Gateway & registry** – register your application with the ONDC registry and integrate with the staging gateway to send search/select/init/confirm calls.  Use ONDC’s sandbox (ONEST) for testing and validation before moving to production.

By following the above steps and referring to the official ONDC specifications, you can transform this prototype into a production‑ready B2B marketplace on the open network.