# SarbaazSoft Shoe POS

**Multi-Tenant Retail Shoe Shop POS & Inventory Management SaaS**

SarbaazSoft Shoe POS is a multi-tenant retail shoe shop POS and inventory management system designed for speed, offline resiliency, barcode label printing, and multi-store operations.

---

## ⚠️ AI Studio Rules & Development Guidelines

All engineers, contributors, and AI assistants working in this repository must strictly adhere to the following core directives:

### 1. Read Before Running
> **Mandatory:** Read this file completely before starting, running, building, or modifying the web application. Always verify the current project structure, environment configuration, and active services before making changes.

### 2. No Unwanted Restyling / Refactoring
> **Do not restyle or refactor the app during imports from the GitHub repository.**
> Preserve the existing visual design system, color palette, typography (Montserrat headings, Inter body), component layout, and user flows. Do not introduce alternative styling frameworks or rewrite working components unless specifically requested by the user.

### 3. Synchronized Codebase Updates
> **Every change must systematically update all related parts of the codebase.**
> Modifications must never be isolated or partial. When introducing or editing a feature, update:
> - **React Hooks & State References:** Keep all components, local state, context providers, and custom hooks aligned.
> - **API Endpoints & Contracts:** Synchronize frontend API service calls (`src/services/api.ts`) with backend Express route handlers (`src/server/routes/*`).
> - **Middleware & Authentication:** Ensure role-based access control (RBAC), tenant routing middleware (`src/server/middleware/*`), and JWT auth stay strictly in sync.
> - **Database Queries & Types:** Keep database schemas, TypeScript interfaces (`src/types.ts`), and mock fallbacks consistent across the full stack.

### 4. Code Cleanliness & Architecture
> **Maintain strict code organization and architecture to prevent technical debt.**
> - Keep modular component structures and avoid monolithic or duplicated logic.
> - Enforce strict TypeScript typing with zero unresolved lint or build issues.
> - Do not leave behind unused dead code, abandoned placeholder files, or duplicate notifications.
> - Preserve single-process architecture (`tsx server.ts` serving API routes and Vite SPA on port 3000).

---

## Core Features

- **Multi-Tenant POS Terminal:** High-performance barcode scanner entry, quick search, itemized cart, and instant receipts.
- **Persistent Top Notification Banner:** Dedicated cashier announcements and Super Admin notices with real-time SSE stream delivery.
- **Offline Resiliency & Sync:** IndexedDB local caching with automated background synchronization for sales, returns, and inventory.
- **Barcode & Label Printing:** Integrated TSPL and ESC/POS thermal printer support for barcode stickers and side-box shoe labels.
- **Footwear Catalog Management:** Comprehensive shoe size matrices, pair/carton configurations, minimum floor price enforcement, and brand logos.
- **Role-Based Access Control:** Strict role isolation across Platform SuperAdmin, Store Owners/Admins, and Counter Cashiers.

---

## Getting Started

### Prerequisites

- **Node.js**: v20 or v22 (recommended)
- **npm**: v10+

### Local Environment Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy `.env.example` to `.env` and configure your database and authentication secrets:
   ```bash
   cp .env.example .env
   ```

3. **Start Development Server:**
   ```bash
   npm run dev
   ```
   The application runs on `http://0.0.0.0:3000`.

4. **Lint and Type Check:**
   ```bash
   npm run lint
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```
