<!-- Test Cases: None required. Documentation. -->
# EcoSprout: Carbon Karma Companion 🌱

A browser extension that turns carbon awareness into something you *feel* while you shop, fly, and order food — not something you have to remember to check. No dashboard, no separate app: a small companion (your "Sprout") lives in your toolbar and reacts in real time, right inside the pages you're already on.

100% local: every estimate is computed in your browser and stored in `chrome.storage.local`. Nothing is ever sent to a server.

EcoSprout was built to be accessible to ordinary users, not just sustainability enthusiasts.

The entire setup takes less than 10 clicks. And you don't have to worry ever again.

---

## What's inside

- **E-commerce injector** — on Amazon (and other stores), reads the product's structured data and injects a small "Carbon Estimate" card near the buy box, with a relatable comparison (miles driven, phone charges) and a one-click "choose the greener option" suggestion.
- **Flight & food nudges** — on flight search sites, estimates the trip's footprint (using real great-circle distance when airport codes are detectable) and flags how much a layover or cabin upgrade costs in CO2. On food delivery sites, scans your cart for meat-heavy vs. plant-based items and nudges toward balance.
- **The lively popup** — a "Carbon Karma" score with a count-up animation and confetti on real progress, a daily streak, rotating quirky tips, unlockable achievement badges, and a recent-activity feed.
- **Wildcard feature — the Sprout terrarium** — a small floating, *draggable* companion that lives directly on the page and reacts with contextual one-liners to whatever it just saw ("Ooh, a light pick! 🌿" / "Whoa, that's a heavy one! 👀"). It grows through real plant stages (Seed → Sprout → Sapling → Young Tree → Mighty Oak) as lifetime Karma rises — that axis never goes backward — while a separate day-to-day "vitality" meter responds to recent activity, gently, with a floor so it can look a little thirsty but never feels punishing.

---

## Install it (Load as Unpacked Extension)

1. Unzip `ecosprout-extension.zip` somewhere permanent (don't load it from a temp/Downloads folder you'll delete).
2. Open Chrome or Brave and go to `chrome://extensions` (Brave: `brave://extensions`).
3. Toggle **Developer mode** on (top-right corner).
4. Click **Load unpacked**.
5. Select the unzipped `ecosprout-extension` folder (the one containing `manifest.json`).
6. EcoSprout should appear in your toolbar. Pin it for easy access (click the puzzle-piece icon → pin EcoSprout).

That's it — no build step, no `npm install`. It's plain JavaScript, loaded directly by the browser.

## Try it

- **Amazon**: visit any product page, e.g. `https://www.amazon.com/dp/B0BSHF7WHW` (or any product on `amazon.in`, `amazon.co.uk`, etc.) — a Carbon Estimate card should appear near the price/buy box within a second or two.
- **Flights**: search a route on `https://www.google.com/travel/flights`, `kayak.com`, or `expedia.com` — a floating Flight Footprint card appears bottom-right.
- **Food delivery**: open a restaurant cart on `doordash.com` or `ubereats.com` — an Order Footprint card appears once items are detected in the cart panel.
- **The Sprout**: on any of the above, a small glowing green bubble appears bottom-right. Click it to see a mini stats panel, or drag it anywhere on the page. Click the toolbar icon any time to open the full terrarium view.

If a card doesn't appear, open DevTools (`F12`) → Console and look for `[EcoSprout]` debug lines — see Troubleshooting below.

---

## Permissions, explained

- `storage` — saves your Karma, streak, and settings locally.
- `alarms` — schedules the once-daily "come say hi" check (fires once around 6pm if you haven't visited that day).
- `notifications` — shows that reminder as an OS notification.
- **No `host_permissions`.** The content script declares its own `matches` in `manifest.json`, which is sufficient for injection — no background fetch or cross-origin access is ever made, so there's nothing extra to request.

---

## Troubleshooting

- **Nothing shows up on a supported site** → Open DevTools Console, look for `[EcoSprout] detection skipped this pass` — that means a selector threw and was safely swallowed; the message tells you it's non-fatal. If you see nothing at all, confirm the extension is enabled and the URL matches one of the patterns in `manifest.json`.
- **Background features (badge, daily reminder) seem stuck** → go to `chrome://extensions`, find EcoSprout, click "service worker" under "Inspect views" to open its dedicated console.
- **Popup looks empty on first install** → give it a second; `chrome.storage` writes from `onInstalled` and the first page visit happen asynchronously.
- **Want a clean slate** → open the popup → ⚙ Settings → "Reset my data" (tap twice to confirm).

---
