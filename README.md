# Aalsi Chatore Sales

Aalsi Chatore Sales is a simple desktop app for recording restaurant orders and checking daily sales.

It is made for Aalsi Chatore, but the idea is simple: instead of writing orders in a notebook or maintaining a spreadsheet manually, the app lets you record orders, manage menu items, and review sales from one place.

## What The App Does

- Records food orders with date, time, items, quantity, amount, and payment method.
- Tracks Cash and UPI sales.
- Shows recent orders and total sales.
- Helps find the most sold dish.
- Lets you add, edit, disable, and organize menu items.
- Stores data locally in the desktop app.
- Supports app updates through the desktop updater.

## Main Screens

### Dashboard

Shows the most important daily business information at a glance:

- Total sales.
- Most sold dish.
- Active menu item count.
- Recent orders.

### Sales Ledger

Shows recorded orders in a table so they can be checked later.

### Menu Items

Used to maintain the restaurant menu:

- Add one item.
- Bulk add items.
- Edit prices.
- Add categories.
- Disable items that are no longer sold.

### Updates

Used to check for desktop app updates.

## Who This Is For

This app is for a restaurant owner, manager, or counter staff member who wants a straightforward way to record sales without using a complicated POS system.

## Data Storage

When used as a desktop app, sales and menu data are stored locally on the computer using SQLite. App updates should not delete sales data.

When opened in browser development mode, the app is mainly for testing and development.

## For Developers

This project uses:

- React.
- TypeScript.
- Vite.
- Tauri.
- SQLite through the Tauri SQL plugin.

### macOS: Local Setup

```bash
# Install Bun
brew install bun

# Install Rust for Tauri
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart the terminal after installing Rust if `cargo` is not found.

### Windows: Local Setup

Install these first:

- Bun from `https://bun.sh`.
- Rust from `https://rustup.rs`.
- Microsoft C++ Build Tools from Visual Studio 2022.
- WebView2 Runtime if Windows does not already have it.

Then open PowerShell or Command Prompt in the project folder.

### Install Project Dependencies

```bash
bun install
```

### Run Locally In Browser

```bash
bun run dev
```

The browser version opens at:

```text
http://localhost:5173
```

Use this for quick UI development. Local desktop-only features may not behave exactly the same in the browser.

### Run Locally As Desktop App

```bash
bun run tauri:dev
```

Use this when testing the real app behavior, including local SQLite storage and the updater screen.

### Test Before Release

Run these before creating a release:

```bash
bun run lint
bun run build
bun run tauri:build
```

Check these flows manually:

- Add a menu item.
- Bulk add menu items.
- Record an order.
- Check Dashboard totals.
- Check Sales Ledger.
- Restart the desktop app and confirm data is still present.

### Build Web Assets Only

```bash
bun run build
```

### Build Desktop Installer Locally

```bash
bun run tauri:build
```

Installer files are created under `src-tauri/target/release/bundle`.

## Developer Release Flow

GitHub Releases are built by `.github/workflows/release.yml`. The workflow runs when a Git tag starting with `v` is pushed, for example `v0.1.1`.

### One-Time GitHub Setup

1. Generate Tauri updater signing keys:

   ```bash
   bunx tauri signer generate -w
   ```

2. Add these GitHub repository secrets:

   ```text
   TAURI_PRIVATE_KEY
   TAURI_KEY_PASSWORD
   ```

3. Put the generated public key in `src-tauri/tauri.conf.json` under:

   ```text
   plugins.updater.pubkey
   ```

4. Update the updater endpoint in `src-tauri/tauri.conf.json`:

   ```text
   https://github.com/OWNER/REPO/releases/latest/download/latest.json
   ```

   Replace `OWNER/REPO` with the actual GitHub repository path. The current config still contains `{REPO_NAME}`, so update it before relying on auto-updates.

### Publish A New GitHub Release

1. Update the app version in:

   ```text
   package.json
   src-tauri/tauri.conf.json
   src-tauri/Cargo.toml
   ```

2. Test locally:

   ```bash
   bun install
   bun run lint
   bun run build
   bun run tauri:build
   ```

3. Commit the changes:

   ```bash
   git add .
   git commit -m "Release vX.Y.Z"
   ```

4. Create and push a version tag:

   ```bash
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```

5. Open GitHub Actions and wait for the `Release` workflow to finish on macOS and Windows.

6. Open the GitHub Release and confirm it contains installers and `latest.json`.

## How Users Get Updates

After the GitHub Release is published:

- New users download the installer from the latest GitHub Release.
- Existing desktop app users open the app and go to `Updates`.
- The app checks `latest.json` from GitHub Releases.
- If a newer signed version exists, the app can download and install it.
- Their local SQLite sales data should remain on the computer after updating.

## Project Notes

- Product requirements are in `PRD.md`.
- Upcoming work is tracked in `TODO.md`.
- Generated folders like `node_modules`, `dist`, and `src-tauri/target` are not product documentation.

## Current Roadmap

- Add a Manage Orders screen.
- Add hybrid Cash + UPI payments.
- Add order channels such as Dine-in, Handover, Zomato, and Swiggy.
- Improve reports and exports.
- Test the full order flow and release flow.
