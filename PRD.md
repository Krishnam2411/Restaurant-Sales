# Product Requirements Document: Aalsi Chatore Sales

## 1. Product Summary

Aalsi Chatore Sales is a simple desktop sales tracker for a small restaurant. It helps the owner or counter staff record daily orders, maintain menu items, see basic sales performance, and keep the data safely on the same computer.

The product should feel closer to a practical counter tool than a corporate dashboard. The main goal is speed and clarity during daily operations.

## 2. Problem

Restaurant sales are often tracked in notebooks, WhatsApp messages, spreadsheets, or memory. This creates common problems:

- Orders are missed during rush hours.
- Daily totals take extra time to calculate.
- Menu prices and active items are hard to maintain consistently.
- Cash and UPI totals are not immediately visible.
- Past sales are difficult to search or verify.

## 3. Goals

- Record an order quickly with item names, quantity, price, payment method, date, and time.
- Keep a local menu list with categories, prices, and active/inactive status.
- Show a clear dashboard with total sales, total orders, top-selling dish, and recent orders.
- Maintain a sales ledger that can be reviewed later.
- Work as a desktop app with local data storage, so the restaurant is not dependent on a remote server for daily use.
- Keep the interface simple enough for non-technical restaurant staff.

## 4. Non-Goals

- This is not a full POS billing system yet.
- This is not inventory stock management yet.
- This is not an accounting or GST filing product yet.
- This is not a customer loyalty or CRM product yet.
- This is not dependent on decorative design assets or project reference dumps.

## 5. Target Users

### Owner
Wants quick visibility into sales, popular dishes, and daily business health.

### Counter Staff
Needs to record orders fast without navigating complex screens.

### Manager
Needs to review past orders, maintain menu items, and correct missed entries.

## 6. Current Product Scope

### 6.1 Dashboard

The dashboard should show:

- Total sales amount.
- Most sold dish.
- Number of active menu items.
- Recent orders with order ID, time, items, payment method, and amount.

### 6.2 Sales Ledger

The ledger should show all recorded sales in a table:

- Date.
- Time.
- Ordered items.
- Payment method.
- Amount.
- Notes.

The ledger should make it easy to review what happened on a given day.

### 6.3 Record Order

The order form should allow:

- Selecting menu items.
- Entering quantity.
- Recording manual/free-text items when needed.
- Choosing payment method.
- Adding notes.
- Backdating or correcting time/date for missed entries.

Current payment methods:

- Cash.
- UPI.

### 6.4 Menu Management

The menu section should allow:

- Add a menu item.
- Bulk add menu items.
- Edit name, price, and category.
- Enable or disable items without deleting old sales records.
- Add custom categories.

Default categories:

- Breakfast.
- Dosa.
- Rice Bowl.
- Kulcha.
- Thali.
- Quick Bites.
- Chaat.
- Snacks.
- Beverages.
- Sweets.
- Other.

### 6.5 App Updates

The desktop app should support update checks and installation through the Tauri updater flow.

## 7. Future Product Scope

### 7.1 Manage Orders

Add a proper order management screen for active and recent orders.

Expected order labels:

- Dine-in.
- Takeaway or handover.
- Zomato.
- Swiggy.

### 7.2 Hybrid Payments

Support split payments for one order, such as:

- Part Cash, part UPI.
- Multiple UPI entries if needed.

The order total must still match the sum of payment parts.

### 7.3 Delivery Platform Tracking

Track sales source/channel:

- Direct counter.
- Dine-in.
- Zomato.
- Swiggy.

This should allow the owner to compare direct sales and platform sales later.

### 7.4 Better Reports

Add useful reports without making the app complex:

- Today, this week, and this month filters.
- Item-wise sales.
- Payment-wise sales.
- Channel-wise sales.
- Export to CSV for Excel.

## 8. Data Requirements

### Sale

Each sale should store:

- Unique ID.
- Date.
- Time.
- Ordered items.
- Total amount.
- Payment method or payment split.
- Optional note.
- Created timestamp.

### Sale Item

Each sale item should store:

- Menu item ID when selected from menu.
- Item name.
- Quantity.
- Unit price.

### Menu Item

Each menu item should store:

- Unique ID.
- Name.
- Price.
- Category.
- Active/inactive status.
- Created timestamp.

## 9. Storage Requirements

- In the desktop app, data should be stored locally using SQLite.
- In browser development mode, fallback storage may be used only for development convenience.
- App updates must not delete restaurant sales data.
- Historical sales must keep item names and prices as they were when the order was recorded.

## 10. Experience Principles

- The first screen should be useful immediately.
- Avoid unnecessary setup before recording an order.
- Keep button labels plain and familiar.
- Make common actions obvious: record order, view ledger, manage menu.
- Avoid decorative or reference-only content inside product screens.
- Prefer dense, readable tables over marketing-style layouts.

## 11. Success Criteria

- A staff member can record a normal order in under 20 seconds.
- The owner can see total sales and recent orders without opening a spreadsheet.
- Menu items can be updated without affecting older sales.
- The app can run locally as a desktop app.
- A non-technical person can understand the README and run the app with help from a developer only when needed.

## 12. Open Decisions

- Whether to keep the current single-page tab layout or introduce route-based pages later.
- Whether order management should be separate from the sales ledger or integrated into it.
- Whether reports should stay simple or use chart components again.
- Whether Zomato and Swiggy entries are manual tracking only or future API integrations.
