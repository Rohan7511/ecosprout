(function () {
  'use strict';
  if (window.__ecoSproutContentInjected) return;
  window.__ecoSproutContentInjected = true;

  // --- Constants ---
  const SPA_RELOAD_DELAY_MS = 500;
  const ROUTING_DELAY_MS = 700;
  const MAX_FLIGHT_TEXT_LENGTH = 20000;
  const FOOD_CART_MAX_ITEMS = 25;
  const LBS_TO_KG = 0.453592;
  const OZ_TO_KG = 0.0283495;

  const ECOMMERCE_HOSTS = ['amazon.', 'walmart.com', 'ebay.com', 'etsy.com', 'target.com', 'bestbuy.com', 'flipkart.com'];
  const FOOD_HOSTS = ['doordash.com', 'ubereats.com', 'grubhub.com', 'instacart.com'];
  const FLIGHT_HOSTS = ['kayak.com', 'expedia.com', 'skyscanner.'];

  const REGEX_WEIGHT = /(?:item weight|weight|shipping weight)[^0-9]*?(\d+(?:\.\d+)?)\s*(kg|kilograms?|g|grams?|lbs?|pounds?|oz|ounces?)/i;
  const COMMON_MATERIALS = ['steel', 'aluminum', 'aluminium', 'plastic', 'cotton', 'wood', 'glass', 'leather', 'polyester', 'nylon', 'cardboard', 'paper', 'ceramic'];

  const AMAZON_SELECTORS = Object.freeze({
    title: ['#productTitle'],
    price: ['.a-price .a-offscreen', '#priceblock_ourprice', '#priceblock_dealprice', '.a-price-whole'],
    breadcrumb: ['#wayfinding-breadcrumbs_feature_div'],
    shipping: ['#mir-layout-DELIVERY_BLOCK', '#deliveryBlockMessage', '#delivery-block'],
    anchor: ['#desktop_buybox', '#buybox', '#rightCol', '#ppd'],
    details: ['#productDetails_techSpec_section_1', '#prodDetails', '#detailBullets_feature_div', '#technicalSpecifications_section_1']
  });

  const host = location.hostname;

  function detectSiteType() {
    if (FOOD_HOSTS.some((h) => host.includes(h))) return 'food';
    if (ECOMMERCE_HOSTS.some((h) => host.includes(h))) return 'ecommerce';
    if (host.includes('google.com') && location.pathname.includes('/travel/flights')) return 'flight';
    if (FLIGHT_HOSTS.some((h) => host.includes(h))) return 'flight';
    return null;
  }

  const SITE_TYPE = detectSiteType();
  if (!SITE_TYPE) return;

  let settings = ECOSPROUT_DEFAULT_SETTINGS;

  // --- Utilities ---

  function safeSendMessage(payload) {
    try {
      chrome.runtime.sendMessage({ ...payload, at: Date.now() });
    } catch (e) {
    }
  }

  function sendKarmaEvent(points, reason, meta) {
    safeSendMessage({ type: 'KARMA_EVENT', points, reason, meta });
  }

  function sendLogEvent(meta) {
    safeSendMessage({ type: 'LOG_EVENT', meta });
  }

  function createCard(id, extraClass = '') {
    const card = document.createElement('div');
    card.id = id;
    card.className = `ecosprout-widget ecosprout-card ${extraClass}`.trim();
    return card;
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  /* ----------------------- shared product extraction ----------------------- */

  function readJsonLdProduct() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const parsed = JSON.parse(s.textContent);
        const list = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of list) {
          const graphNode = item['@graph'] && item['@graph'].find((g) => g['@type'] === 'Product');
          const node = graphNode || (item['@type'] === 'Product' ? item : null);

          if (!node) continue;

          const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          return {
            title: node.name || '',
            priceText: offer && offer.price ? String(offer.price) : '',
            breadcrumb: node.category || ''
          };
        }
      } catch (e) {
      }
    }
    return null;
  }

  function readOgProduct() {
    const title = document.querySelector('meta[property="og:title"]');
    const priceEl = document.querySelector('meta[property="product:price:amount"]')
      || document.querySelector('meta[property="og:price:amount"]');

    if (!title && !priceEl) return null;

    return {
      title: title ? title.content : document.title,
      priceText: priceEl ? priceEl.content : '',
      breadcrumb: ''
    };
  }

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

  function parseWeightString(val, unit) {
    if (unit.startsWith('kg') || unit.startsWith('kilo')) return val;
    if (unit.startsWith('g')) return val / 1000;
    if (unit.startsWith('lb') || unit.startsWith('pound')) return val * LBS_TO_KG;
    if (unit.startsWith('oz') || unit.startsWith('ounce')) return val * OZ_TO_KG;
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
    const weightMatch = detailsText.match(REGEX_WEIGHT);
    if (weightMatch) {
      weightKg = parseWeightString(parseFloat(weightMatch[1]), weightMatch[2].toLowerCase());
    }

    const materials = [];
    for (const mat of COMMON_MATERIALS) {
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
    const text = scope.innerText.slice(0, MAX_FLIGHT_TEXT_LENGTH);

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
        if (t && t.length > 2 && t.length < 60 && /[a-zA-Z]/.test(t) && !priceLike.test(t)) {
          found.add(t);
        }
      });
    });

    return [...found].slice(0, FOOD_CART_MAX_ITEMS);
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

  chrome.storage.local.get('settings', (data) => {
    settings = { ...ECOSPROUT_DEFAULT_SETTINGS, ...(data.settings || {}) };

    if (settings.petBubble) SproutPet.init();
    runDetection();

    const debouncedRun = debounce(runDetection, SPA_RELOAD_DELAY_MS);
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => !isOwnNode(m.target) && (m.addedNodes.length || m.type === 'characterData'));
      if (relevant) debouncedRun();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    ['pushState', 'replaceState'].forEach((fnName) => {
      const original = history[fnName];
      history[fnName] = function (...args) {
        const result = original.apply(this, args);
        lastProductKey = '';
        lastFoodKey = '';
        flightInitialized = false;
        setTimeout(runDetection, ROUTING_DELAY_MS);
        return result;
      };
    });

    window.addEventListener('popstate', () => setTimeout(runDetection, ROUTING_DELAY_MS));

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = { ...ECOSPROUT_DEFAULT_SETTINGS, ...changes.settings.newValue };
      if (!settings.petBubble) SproutPet.destroy();
      else if (!document.getElementById('ecosprout-bubble')) SproutPet.init();
    });
  });
})();
