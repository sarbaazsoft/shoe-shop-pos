<div align="center">
  # SarbaazSoft Shoe POS

  **Multi-Tenant Retail Shoe Shop POS & Inventory Management SaaS**

  SarbaazSoft Shoe POS is a multi-tenant retail shoe shop POS and inventory management system developed by SarbaazSoft.
</div>

---

## Features

* **Retail Management:** Streamlined workflow for inventory and shoe retail sales operations.
* **AI Integration:** Powered by Google's Gemini API for intelligent inventory tracking and insights.
* **Secure Authentication:** JWT-based user authentication and authorization.
* **Database Support:** Persistent data storage configured for retail management.

---

## Getting Started

Follow these instructions to set up and run the project locally on your machine.

### Prerequisites

Ensure you have the following installed on your system:

* **Node.js** (v18.0 or higher recommended)
* **npm** (comes bundled with Node.js)

### Installation & Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run in development mode:**
   ```bash
   npm run dev
   ```

3. **Build for production:**
   ```bash
   npm run build
   ```

---

## Netlify Deployment

This project is configured out-of-the-box for seamless Netlify deployment:

1. **Connect Repository:** Link this Git repository to your Netlify account.
2. **Build Configuration** (automatically detected from `netlify.toml`):
   * **Build Command:** `npm run build`
   * **Publish Directory:** `dist`
   * **Functions Directory:** `netlify/functions`
3. **Environment Variables** (set in Netlify Site Configuration -> Environment Variables):
   * `DATABASE_URL`: PostgreSQL connection string (e.g. Neon, Supabase, or AWS RDS).
   * `JWT_SECRET`: Secret key for signing authentication tokens.
4. **Deploy:** Click **Deploy site**. All `/api/*` endpoints are handled serverlessly via Netlify Functions, and frontend routes are served by Netlify CDN.
