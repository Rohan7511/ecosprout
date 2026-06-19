# EcoSprout Testing Workflow

This document outlines the workflow and core test cases to ensure the EcoSprout extension functions correctly.

## Workflow

1. **Local Setup:** Load the unpacked extension in Chrome via `chrome://extensions/`.
2. **DOM Inspection (Content Script):** Navigate to supported host pages (Amazon, DoorDash, Kayak) and verify that the `ecosprout-widget` DOM nodes are successfully injected without throwing cross-origin or script errors.
3. **Engine Validation:** Verify `carbon-engine.js` estimates via the console by invoking `window.CarbonEngine.estimateProduct({title: 'test', priceText: '20'})` and confirming reasonable outputs.
4. **State Management:** Open the extension popup, interact with the UI (e.g. settings toggles, name input), and ensure values persist across re-opening the popup.
5. **Logging & Debugging:** Monitor the browser's developer tools console (for the active tab or the background service worker) to view `console.log` and `console.debug` lines. These logs are intentionally used for tracking state, verifying event lifecycles, and fixing errors during development.

## Core Test Cases

1. **E-Commerce Scrape Accuracy**
   - **Action:** Visit an Amazon product page for a heavy item (e.g., a refrigerator).
   - **Expected:** The content script identifies the product, `carbon-engine.js` categorizes it correctly, and the popup displays a high severity warning.

2. **Flight Route Calculation**
   - **Action:** Visit Google Flights and search for a direct flight vs a flight with 2 layovers.
   - **Expected:** The Sprout pet reacts with a message encouraging direct flights, and the estimated carbon footprint for the layover flight is significantly higher.

3. **Vitality Decay & Streak**
   - **Action:** Simulate a `high` severity product view event.
   - **Expected:** The Sprout pet's vitality decreases, and the `karmaScore` is updated.
   - **Action:** Simulate 48 hours of inactivity.
   - **Expected:** The user's streak resets to 0.

4. **UI Toggle Persistence**
   - **Action:** In the popup settings, disable the "Floating Sprout" toggle.
   - **Expected:** The Sprout pet disappears from the active tab. Upon reloading the tab, the Sprout pet remains hidden.
