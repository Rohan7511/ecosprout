/**
 * EcoSprout — Content Script
 * Detects e-commerce, flight, and food-delivery pages, scrapes lightweight
 * signals from the DOM, asks CarbonEngine for an estimate, and injects a
 * small, native-feeling card. Also boots the floating Sprout companion.
 *
 * Defensive by design: every detector fails soft (returns / no-ops) rather
 * than throwing, because we don't control the host page's markup and it
 * WILL change over time. See SITE_HANDLERS-style selector objects below —
 * they're intentionally easy to find and extend.
 */
(function () {
  'use strict';
  if (window.__ecoSproutContentInjected) return;
  window.__ecoSproutContentInjected = true;

  const host = location.hostname;
  const ECOMMERCE_HOSTS = ['amazon.', 'walmart.com', 'ebay.com', 'etsy.com', 'target.com', 'bestbuy.com', 'flipkart.com'];
  const FOOD_HOSTS = ['doordash.com', 'ubereats.com', 'grubhub.com', 'instacart.com'];
  const FLIGHT_HOSTS = ['kayak.com', 'expedia.com', 'skyscanner.'];

  function detectSiteType() {
    if (FOOD_HOSTS.some((h) => host.includes(h))) return 'food';
    if (ECOMMERCE_HOSTS.some((h) => host.includes(h))) return 'ecommerce';
    if (host.includes('google.com') && location.pathname.includes('/travel/flights')) return 'flight';
    if (FLIGHT_HOSTS.some((h) => host.includes(h))) return 'flight';
    return null;
  }

  const SITE_TYPE = detectSiteType();
  if (!SITE_TYPE) return;

  let settings = { ecommerce: true, flight: true, food: true, petBubble: true };

  function sendKarmaEvent(points, reason, meta) {
    try { chrome.runtime.sendMessage({ type: 'KARMA_EVENT', points, reason, meta, at: Date.now() }); }
    catch (e) { /* extension context can be invalidated on reload/update — safe to ignore */ }
  }
  function sendLogEvent(meta) {
    try { chrome.runtime.sendMessage({ type: 'LOG_EVENT', meta, at: Date.now() }); }
    catch (e) { /* see above */ }
  }

  /* ----------------------- shared product extraction ----------------------- */

  // Layered fallback strategy: standardized structured data first (works
  // across most modern e-commerce platforms), then OpenGraph meta tags,
  // then Amazon's long-stable element IDs as a final, specific boost.
  function readJsonLdProduct() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of list) {
          const graphNode = item['@graph'] && item['@graph'].find((g) => g['@type'] === 'Product');
          const node = graphNode || (item['@type'] === 'Product' ? item : null);
          if (node) {
            const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
            return {
              title: node.name || '',
              priceText: offer && offer.price ? String(offer.price) : '',
              breadcrumb: node.category || ''
            };
          }
        }
      } catch (e) { /* not every ld+json block is a clean Product — expected, skip it */ }
    }
    return null;
  }

  function readOgProduct() {
    const title = document.querySelector('meta[property="og:title"]');
    const priceEl = document.querySelector('meta[property="product:price:amount"]')
      || document.querySelector('meta[property="og:price:amount"]');
    if (!title && !priceEl) return null;
    return { title: title ? title.content : document.title, priceText: priceEl ? priceEl.content : '', breadcrumb: '' };
  }

  const AMAZON_SELECTORS = {
    title: ['#productTitle'],
    price: ['.a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice', '.a-price-whole'],
    breadcrumb: ['#wayfinding-breadcrumbs_feature_div'],
    shipping: ['#mir-layout-DELIVERY_BLOCK', '#deliveryBlockMessage', '#delivery-block'],
    anchor: ['#desktop_buybox', '#buybox', '#rightCol', '#ppd'],
    details: ['#productDetails_techSpec_section_1', '#prodDetails', '#detailBullets_feature_div', '#technicalSpecifications_section_1']
  };

  function queryFirstText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return '';
  }

  function findAnchor() {
    for (const sel of AMAZON_SELECTORS.anchor) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function extractTechDetails() {
    let detailsText = '';
    for (const sel of AMAZON_SELECTORS.details) {
      const el = document.querySelector(sel);
      if (el) detailsText += ' ' + el.textContent.toLowerCase();
    }
    
    if (!detailsText) {
      const scope = document.querySelector('#ppd') || document.body;
      detailsText = scope.textContent.toLowerCase();
    }

    let weightKg = null;
    let materials = [];

    const weightMatch = detailsText.match(/(?:item weight|weight|shipping weight)[^0-9]*?(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lbs?|pounds?|oz|ounces?)/i);
    if (weightMatch) {
      const val = parseFloat(weightMatch[1]);
      const unit = weightMatch[2].toLowerCase();
      if (unit.startsWith('kg') || unit.startsWith('kilo')) weightKg = val;
      else if (unit.startsWith('g')) weightKg = val / 1000;
      else if (unit.startsWith('lb') || unit.startsWith('pound')) weightKg = val * 0.453592;
      else if (unit.startsWith('oz') || unit.startsWith('ounce')) weightKg = val * 0.0283495;
    }

    const commonMaterials = ['steel', 'aluminum', 'aluminium', 'plastic', 'cotton', 'wood', 'glass', 'leather', 'polyester', 'nylon', 'cardboard', 'paper', 'ceramic'];
    for (const mat of commonMaterials) {
      // Basic word boundary check
      if (new RegExp('\\b' + mat + '\\b').test(detailsText)) {
        materials.push(mat);
      }
    }

    return { weightKg, materials };
  }

  function extractProductData() {
    const nativeTitle = queryFirstText(AMAZON_SELECTORS.title);
    const ld = readJsonLdProduct();
    const og = readOgProduct();

    const title = nativeTitle || (ld && ld.title) || (og && og.title);
    if (!title) return null;

    const { weightKg, materials } = extractTechDetails();

    return {
      title,
      priceText: queryFirstText(AMAZON_SELECTORS.price) || (ld && ld.priceText) || (og && og.priceText) || '',
      breadcrumb: queryFirstText(AMAZON_SELECTORS.breadcrumb) || (ld && ld.breadcrumb) || '',
      shippingText: queryFirstText(AMAZON_SELECTORS.shipping),
      weightKg,
      materials
    };
  }

  function severityToQuip(estimate) {
    if (estimate.severity === 'low') return 'Ooh, a light pick! My leaves are happy. 🌿';
    if (estimate.severity === 'medium') return 'Mid-size footprint here — a small tweak could lighten it!';
    return "Whoa, that's a heavy one! Peep my tip below 👀";
  }

  function createCard(id, extraClass) {
    const card = document.createElement('div');
    card.id = id;
    card.className = `ecosprout-widget ecosprout-card ${extraClass || ''}`.trim();
    return card;
  }

  let lastProductKey = '';
  async function renderProductCard() {
    const data = extractProductData();
    if (!data) return;
    const key = `${data.title}|${data.priceText}|${data.shippingText}`;
    if (key === lastProductKey) return;
    lastProductKey = key;

    let card = document.getElementById('ecosprout-product-card');
    if (!card) card = createCard('ecosprout-product-card');

    const anchor = findAnchor();

    // Show a loading state before awaiting the AI
    card.className = `ecosprout-widget ecosprout-card ecosprout-sev-medium${anchor ? '' : ' ecosprout-floating'}`;
    card.innerHTML = `
      <div class="ecosprout-card-head">
        <span class="ecosprout-card-badge">✨ Estimating footprint...</span>
      </div>
    `;

    if (anchor) {
      if (card.parentElement !== anchor.parentElement || !document.body.contains(card)) {
        anchor.parentElement.insertBefore(card, anchor);
      }
    } else if (!document.body.contains(card)) {
      document.body.appendChild(card);
    }

    const estimate = await CarbonEngine.estimateProduct(data);

    // Safety check in case they navigated away while generating
    if (key !== lastProductKey) return;

    card.className = `ecosprout-widget ecosprout-card ecosprout-sev-${estimate.severity}${anchor ? '' : ' ecosprout-floating'}`;
    card.innerHTML = `
      <div class="ecosprout-card-head">
        <span class="ecosprout-card-badge">🌍 Carbon Estimate</span>
        <span class="ecosprout-card-kg">${estimate.totalKg}kg CO2e</span>
      </div>
      <div class="ecosprout-card-bar"><div class="ecosprout-card-bar-fill" style="width:${Math.min(100, estimate.totalKg * 2)}%"></div></div>
      <div class="ecosprout-card-equiv">≈ ${estimate.milesEquivalent} miles driven · ${estimate.phoneChargesEquivalent} phone charges</div>
      <div class="ecosprout-card-suggestion">${estimate.suggestion}</div>
      <button class="ecosprout-card-cta" type="button">I'll choose the greener option 🌱</button>
    `;

    card.querySelector('.ecosprout-card-cta').addEventListener('click', (e) => {
      sendKarmaEvent(5, 'product_greener_choice', { category: estimate.category });
      e.target.textContent = 'Nice choice! 🌟';
      e.target.disabled = true;
      SproutPet.react("Yes! That's the stuff. 💚");
    });

    sendLogEvent({ kind: 'product_view', kg: estimate.totalKg, severity: estimate.severity, category: estimate.category });
    SproutPet.react(severityToQuip(estimate));
  }

  /* ------------------------------ flights ------------------------------ */

  function scanFlightSignals() {
    const scope = document.querySelector('[role="main"], main') || document.body;
    const text = scope.innerText.slice(0, 20000); // capped for performance
    const stopMatches = [...text.matchAll(/(\d+)\s*stop/gi)].map((m) => parseInt(m[1], 10));
    const hasNonstop = /nonstop|non-stop|direct flight/i.test(text);
    const stops = stopMatches.length ? Math.min(...stopMatches) : hasNonstop ? 0 : 1;
    let cabin = 'economy';
    if (/first class/i.test(text)) cabin = 'first';
    else if (/business class/i.test(text)) cabin = 'business';
    else if (/premium economy/i.test(text)) cabin = 'premium';
    return { stops, cabin };
  }

  function tryExtractAirportCodes() {
    const matches = [...location.href.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]);
    const known = matches.filter((code) => CarbonEngine.AIRPORTS[code]);
    return { originCode: known[0] || null, destCode: known[1] || null };
  }

  let flightInitialized = false;
  function renderFlightNudge() {
    const { stops, cabin } = scanFlightSignals();
    const { originCode, destCode } = tryExtractAirportCodes();
    const estimate = CarbonEngine.estimateFlight({ originCode, destCode, stops, cabin });

    let panel = document.getElementById('ecosprout-flight-panel');
    if (!panel) {
      panel = createCard('ecosprout-flight-panel', 'ecosprout-floating');
      document.body.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="ecosprout-card-head">
        <span class="ecosprout-card-badge">✈️ Flight Footprint</span>
        <span class="ecosprout-card-kg">~${estimate.estimatedKg}kg CO2e</span>
      </div>
      <div class="ecosprout-card-suggestion">${estimate.message}</div>
      <button class="ecosprout-card-cta" type="button">I'll look at direct flights 🧭</button>
    `;
    panel.querySelector('.ecosprout-card-cta').addEventListener('click', (e) => {
      sendKarmaEvent(5, 'flight_direct_consideration', { stops });
      e.target.textContent = 'Good call! ✨';
      e.target.disabled = true;
      SproutPet.react('Fewer stops, fresher skies. Love it. ✈️💚');
    });

    if (!flightInitialized) {
      flightInitialized = true;
      sendLogEvent({ kind: 'flight_view', kg: estimate.estimatedKg });
      SproutPet.react('Watching the skies with you! ✈️');
    }
  }

  /* --------------------------- food delivery ---------------------------- */

  function scanCartItemNames() {
    const found = new Set();
    const priceLike = /[$₹€£]\s?\d/;
    document.querySelectorAll('[data-testid*="cart" i], [class*="cart" i], [id*="cart" i]').forEach((container) => {
      container.querySelectorAll('span, div, p, li').forEach((node) => {
        const t = node.textContent && node.textContent.trim();
        if (t && t.length > 2 && t.length < 60 && /[a-zA-Z]/.test(t) && !priceLike.test(t)) found.add(t);
      });
    });
    return [...found].slice(0, 25);
  }

  let lastFoodKey = '';
  function renderFoodNudge() {
    const items = scanCartItemNames();
    if (!items.length) return;
    const key = items.join('|');
    if (key === lastFoodKey) return;
    lastFoodKey = key;

    const estimate = CarbonEngine.estimateFoodCart(items);
    let panel = document.getElementById('ecosprout-food-panel');
    if (!panel) {
      panel = createCard('ecosprout-food-panel', 'ecosprout-floating');
      document.body.appendChild(panel);
    }
    const tierEmoji = { green: '🌱', balanced: '⚖️', heavy: '🥩' }[estimate.tier];
    panel.innerHTML = `
      <div class="ecosprout-card-head">
        <span class="ecosprout-card-badge">${tierEmoji} Order Footprint</span>
        <span class="ecosprout-card-kg">~${estimate.totalKg}kg CO2e</span>
      </div>
      <div class="ecosprout-card-suggestion">${estimate.message}</div>
      ${estimate.tier !== 'green' ? '<button class="ecosprout-card-cta" type="button">Add something green 🥗</button>' : ''}
    `;
    const cta = panel.querySelector('.ecosprout-card-cta');
    if (cta) {
      cta.addEventListener('click', (e) => {
        sendKarmaEvent(5, 'food_green_addition', { tier: estimate.tier });
        e.target.textContent = 'Yum, noted! 🌟';
        e.target.disabled = true;
        SproutPet.react('Tofu, beans, veggies… my favorite trio! 🥦');
      });
    }

    sendLogEvent({ kind: 'food_view', kg: estimate.totalKg, tier: estimate.tier });
    if (estimate.tier === 'green') SproutPet.react('Your cart smells like fresh basil. Love it. 🌿');
  }

  /* ------------------------- orchestration / SPA -------------------------- */

  function isOwnNode(node) {
    return !!(node && node.closest && node.closest('.ecosprout-widget'));
  }

  function runDetection() {
    try {
      if (SITE_TYPE === 'ecommerce' && settings.ecommerce) renderProductCard();
      if (SITE_TYPE === 'flight' && settings.flight) renderFlightNudge();
      if (SITE_TYPE === 'food' && settings.food) renderFoodNudge();
    } catch (err) {
      console.debug('[EcoSprout] detection skipped this pass:', err);
    }
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  chrome.storage.local.get('settings', (data) => {
    settings = { ecommerce: true, flight: true, food: true, petBubble: true, ...(data.settings || {}) };

    if (settings.petBubble) SproutPet.init();
    runDetection();

    const debouncedRun = debounce(runDetection, 500);
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => !isOwnNode(m.target) && (m.addedNodes.length || m.type === 'characterData'));
      if (relevant) debouncedRun();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    // SPA resilience: Amazon/Kayak/etc. often update price/results via
    // client-side routing without a full reload — intercept history API
    // changes so a fresh detection pass runs immediately after.
    ['pushState', 'replaceState'].forEach((fnName) => {
      const original = history[fnName];
      history[fnName] = function (...args) {
        const result = original.apply(this, args);
        lastProductKey = '';
        lastFoodKey = '';
        flightInitialized = false;
        setTimeout(runDetection, 700);
        return result;
      };
    });
    window.addEventListener('popstate', () => setTimeout(runDetection, 700));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = { ecommerce: true, flight: true, food: true, petBubble: true, ...changes.settings.newValue };
      if (!settings.petBubble) SproutPet.destroy();
      else if (!document.getElementById('ecosprout-bubble')) SproutPet.init();
    });
  });
})();
