/**
 * EcoSprout — Carbon Engine
 * Pure, DOM-free heuristic estimation functions. Given structured inputs
 * (scraped by content.js), returns a CO2e estimate plus relatable
 * comparisons and a suggestion.
 *
 * IMPORTANT — read this before trusting the numbers:
 * There is no live emissions-factor API wired in here (this is a
 * zero-network, instant-response MVP). Figures are reasonable,
 * commonly-cited approximations meant to make carbon impact *relatable*,
 * not a certified life-cycle assessment. For production, swap the
 * constants below for a real source (e.g. Climatiq, Carbon Interface,
 * DEFRA conversion factors, or manufacturer-disclosed data) — the function
 * signatures here are designed so that swap doesn't touch content.js at all.
 */
const CarbonEngine = (function () {
  /* ----------------------------- products ----------------------------- */

  const CATEGORY_BASE_EMISSIONS = {
    laptop: 250, phone: 70, smartphone: 70, monitor: 180, tv: 300, television: 300, camera: 90, headphone: 15, earbud: 10, charger: 8, console: 150, speaker: 40, smartwatch: 25, drone: 80, router: 30, tablet: 90,
    sofa: 150, chair: 40, table: 80, desk: 90, mattress: 120, shelf: 50, cabinet: 110, rug: 60, wardrobe: 140, 'bed frame': 100, furniture: 80,
    shirt: 8, jeans: 12, dress: 15, jacket: 30, shoes: 15, sneaker: 15, 't-shirt': 8, sweater: 18, hoodie: 20, coat: 40, apparel: 10, clothing: 10,
    makeup: 5, lotion: 4, shampoo: 3, perfume: 8, skincare: 5, cosmetic: 4, cream: 4,
    toy: 8, lego: 15, doll: 5, puzzle: 3, 'action figure': 5, 'board game': 6,
    book: 3, novel: 3, paperback: 2, hardcover: 4, dvd: 2, 'blu-ray': 2, vinyl: 5,
    snack: 1, grocery: 2, organic: 1.5, tea: 1, coffee: 3, spice: 0.5, cereal: 1.5,
    refrigerator: 500, fridge: 500, washer: 400, dryer: 400, oven: 350, microwave: 120, dishwasher: 300,
    default: 50
  };

  const MATERIAL_FACTORS = {
    steel: 1.9,
    aluminum: 8.2, aluminium: 8.2,
    plastic: 3.4,
    cotton: 5.7,
    wood: 0.5,
    glass: 1.2,
    leather: 15.0,
    polyester: 4.5,
    nylon: 5.5,
    cardboard: 0.8,
    paper: 0.8,
    ceramic: 1.2
  };

  const SHIPPING_PROFILES = {
    standard: { kg: 0.5, label: 'Standard shipping' },
    twoday: { kg: 1.1, label: '2-day shipping' },
    express: { kg: 3.4, label: 'Same-day / next-day shipping' }
  };

  function detectShippingSpeed(text) {
    const lower = text.toLowerCase();
    if (/same.?day|within \d+\s*hours?|get it today/i.test(lower)) return 'express';
    if (/tomorrow|next.?day|1 day|one day/i.test(lower)) return 'express';
    if (/2 days|two days|2-day/i.test(lower)) return 'twoday';
    return 'standard';
  }

  function parsePrice(str) {
    if (!str) return 20; // sensible neutral fallback when price can't be read
    const match = String(str).replace(/,/g, '').match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 20;
  }

  function round0(n) { return Math.round(n); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  async function estimateProduct({ title = '', breadcrumb = '', priceText = '', shippingText = '', weightKg = null, materials = [] }) {
    const text = `${title} ${breadcrumb}`.toLowerCase();
    
    // Find the most specific base category footprint
    let baseKg = CATEGORY_BASE_EMISSIONS.default;
    let matchedCategory = 'product';
    for (const [key, val] of Object.entries(CATEGORY_BASE_EMISSIONS)) {
      if (text.includes(key)) {
        baseKg = val;
        matchedCategory = key;
        break; // Use the first match found
      }
    }

    // Material modifier (average of known material factors)
    let materialMultiplier = 1;
    if (materials && materials.length > 0) {
      let sum = 0;
      let count = 0;
      for (const mat of materials) {
        if (MATERIAL_FACTORS[mat]) {
          sum += MATERIAL_FACTORS[mat];
          count++;
        }
      }
      if (count > 0) {
        const avgMaterialFactor = sum / count;
        materialMultiplier = Math.max(0.8, Math.min(1.3, 1 + ((avgMaterialFactor - 3) / 20)));
      }
    }

    // Weight modifier (smooth scaling)
    let weightMultiplier = 1;
    if (weightKg) {
      weightMultiplier = 1 + (0.15 * Math.log10(weightKg + 1));
    }

    const price = parsePrice(priceText);
    const shippingSpeed = detectShippingSpeed(shippingText);
    const shippingKg = SHIPPING_PROFILES[shippingSpeed].kg;
    
    // Calculate final manufacturing footprint
    let manufacturingKg = 0;
    let confidence = 'High';
    if (matchedCategory === 'product') {
       // Fallback proxy for unrecognized items using non-linear curve
       manufacturingKg = round2(5 * Math.pow(Math.max(price, 5), 0.7));
       confidence = 'Low';
    } else {
       manufacturingKg = round2(baseKg * materialMultiplier * weightMultiplier);
       const hasMat = materials && materials.length > 0;
       const hasWeight = weightKg !== null && weightKg !== undefined;
       if (hasMat && hasWeight) confidence = 'High';
       else if (hasMat || hasWeight) confidence = 'Medium';
       else confidence = 'Low';
    }

    const totalKg = round2(manufacturingKg + shippingKg);

    const suggestions = [];
    if (shippingSpeed === 'express') {
      const saving = round2(shippingKg - SHIPPING_PROFILES.standard.kg);
      suggestions.push(`Switching to standard shipping could save ~${saving}kg CO2 — the delivery truck is going that way anyway.`);
    }
    
    if (['laptop', 'phone', 'smartphone', 'monitor', 'tv'].includes(matchedCategory)) {
      suggestions.push(`Electronics like this ${matchedCategory} carry a heavy manufacturing footprint — a refurbished pick can cut this by 50%+.`);
    } else if (materials && materials.includes('plastic') && !['laptop', 'phone', 'smartphone', 'monitor', 'tv'].includes(matchedCategory)) {
      suggestions.push(`This item contains virgin plastics. Looking for recycled or wood/bamboo alternatives reduces embodied emissions.`);
    } else if (weightKg && weightKg > 20) {
      suggestions.push(`Heavy items (${weightKg}kg) require massive shipping fuel. Sourcing locally or buying second-hand is a huge win.`);
    }

    if (!suggestions.length) {
      suggestions.push(`This is a relatively light pick! Combining it with another order saves on shipping trips too.`);
    }
    const suggestion = suggestions[0];

    const severity = totalKg < 8 ? 'low' : totalKg < 25 ? 'medium' : 'high';

    return {
      totalKg,
      manufacturingKg,
      shippingKg,
      category: matchedCategory,
      shippingSpeed,
      severity,
      confidence,
      milesEquivalent: round1(totalKg / ECOSPROUT_REFERENCE.KG_PER_MILE_DRIVEN),
      phoneChargesEquivalent: round0(totalKg / ECOSPROUT_REFERENCE.KG_PER_PHONE_CHARGE),
      suggestion
    };
  }

  /* ------------------------------ flights ------------------------------ */

  // A compact set of major-hub coordinates so we can do a real haversine
  // distance calculation entirely offline when an itinerary's airport codes
  // are detectable from the URL.
  const AIRPORTS = {
    JFK: [40.6413, -73.7781], LAX: [33.9416, -118.4085], ORD: [41.9742, -87.9073], ATL: [33.6407, -84.4277],
    SFO: [37.6213, -122.3790], SEA: [47.4502, -122.3088], DFW: [32.8998, -97.0403], DEN: [39.8561, -104.6737],
    MIA: [25.7959, -80.2870], BOS: [42.3656, -71.0096], YYZ: [43.6777, -79.6248], YVR: [49.1947, -123.1792],
    LHR: [51.4700, -0.4543], LGW: [51.1481, -0.1903], CDG: [49.0097, 2.5479], AMS: [52.3105, 4.7683],
    FRA: [50.0379, 8.5622], MAD: [40.4983, -3.5676], FCO: [41.8003, 12.2389], IST: [41.2753, 28.7519],
    DXB: [25.2532, 55.3657], DOH: [25.2731, 51.6080], DEL: [28.5562, 77.1000], BOM: [19.0896, 72.8656],
    HYD: [17.2403, 78.4294], BLR: [13.1986, 77.7066], MAA: [12.9941, 80.1709], CCU: [22.6520, 88.4463],
    SIN: [1.3644, 103.9915], HKG: [22.3080, 113.9185], NRT: [35.7720, 140.3929], HND: [35.5494, 139.7798],
    ICN: [37.4602, 126.4407], PVG: [31.1443, 121.8083], PEK: [40.0801, 116.5846], SYD: [-33.9399, 151.1753],
    MEL: [-37.6690, 144.8410], JNB: [-26.1392, 28.2460], GRU: [-23.4356, -46.4731], MEX: [19.4363, -99.0721],
    ZRH: [47.4647, 8.5492], MUC: [48.3538, 11.7861], VIE: [48.1103, 16.5697], CPH: [55.6180, 12.6560],
    ARN: [59.6519, 17.9186], OSL: [60.1976, 11.1004], HEL: [60.3172, 24.9633], WAW: [52.1657, 20.9671],
    ATH: [37.9364, 23.9445], LIS: [38.7813, -9.1359], BCN: [41.2974, 2.0833]
  };

  const CABIN_MULTIPLIER = { economy: 1, premium: 1.5, business: 2.6, first: 3.6 };

  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function perKmFactor(distanceKm) {
    return Math.max(0.09, Math.min(0.22, 0.22 - (0.000025 * distanceKm)));
  }

  function estimateFlight({ originCode, destCode, stops = 0, cabin = 'economy' }) {
    const origin = AIRPORTS[originCode];
    const dest = AIRPORTS[destCode];
    const cabinKey = CABIN_MULTIPLIER[cabin] ? cabin : 'economy';
    const RADIATIVE_MULTIPLIER = 1.9;

    if (origin && dest) {
      const distanceKm = round0(haversineKm(origin, dest));
      const base = distanceKm * perKmFactor(distanceKm);
      const stopPenalty = stops * 25;
      const directKg = round0(base * CABIN_MULTIPLIER[cabinKey] * RADIATIVE_MULTIPLIER);
      const actualKg = round0((base + stopPenalty) * CABIN_MULTIPLIER[cabinKey] * RADIATIVE_MULTIPLIER);

      return {
        mode: 'precise',
        confidence: 'High',
        distanceKm,
        cabin: cabinKey,
        stops,
        estimatedKg: actualKg,
        directKg,
        savingsVsDirect: round0(actualKg - directKg),
        milesEquivalent: round1(actualKg / ECOSPROUT_REFERENCE.KG_PER_MILE_DRIVEN),
        message: stops > 0
          ? `This ${stops}-stop routing adds ~${round0(actualKg - directKg)}kg CO2 vs. flying direct — extra takeoffs burn the most fuel.`
          : 'Nice — direct flights skip the extra takeoff & landing cycle that makes layovers so carbon-heavy.'
      };
    }

    // No matching airport codes found (common — many flight search URLs
    // encode this opaquely) — fall back to a generic, still-useful estimate.
    const genericBaseKg = 250;
    const stopPenalty = stops * 25;
    const estimatedKg = round0((genericBaseKg + stopPenalty) * CABIN_MULTIPLIER[cabinKey] * RADIATIVE_MULTIPLIER);
    return {
      mode: 'generic',
      confidence: 'Low',
      stops,
      cabin: cabinKey,
      estimatedKg,
      message: stops > 0
        ? 'Each layover typically adds 50–100kg CO2 from extra takeoff & landing fuel burn. Flying direct is the easy win here.'
        : "Direct flights are already your lowest-carbon option for this route — nice pick."
    };
  }

  /* --------------------------- food delivery ---------------------------- */

  const FOOD_KEYWORDS = {
    redMeat: ['beef', 'steak', 'burger', 'brisket', 'lamb', 'mutton'],
    poultryPork: ['chicken', 'turkey', 'pork', 'bacon', 'ham', 'sausage'],
    seafood: ['fish', 'shrimp', 'prawn', 'salmon', 'tuna', 'crab', 'seafood'],
    dairyEgg: ['cheese', 'paneer', 'egg', 'butter', 'cream', 'yogurt', 'milk'],
    plantBased: ['salad', 'veggie', 'vegetable', 'tofu', 'vegan', 'vegetarian', 'beans', 'lentil', 'dal', 'plant-based', 'mushroom']
  };

  // Approximate kg CO2e "per dish" — a simplification standing in for
  // portion-weighted, ingredient-level life-cycle data.
  const FOOD_FACTORS = { redMeat: 6.5, poultryPork: 2.0, seafood: 2.5, dairyEgg: 1.8, plantBased: 0.4, other: 1.2 };

  function classifyFoodItem(name) {
    const n = name.toLowerCase();
    for (const [cat, words] of Object.entries(FOOD_KEYWORDS)) {
      if (words.some((w) => n.includes(w))) return cat;
    }
    return 'other';
  }

  function getServingMultiplier(name) {
    const n = name.toLowerCase();
    if (n.includes('family')) return 4.0;
    if (n.includes('double')) return 1.7;
    if (n.includes('large')) return 1.4;
    if (n.includes('small')) return 0.8;
    return 1.0;
  }

  function estimateFoodCart(items) {
    const counts = { redMeat: 0, poultryPork: 0, seafood: 0, dairyEgg: 0, plantBased: 0, other: 0 };
    let totalKg = 0;
    items.forEach((name) => {
      const cat = classifyFoodItem(name);
      counts[cat] += 1;
      const mult = getServingMultiplier(name);
      totalKg += FOOD_FACTORS[cat] * mult;
    });
    
    // Add Delivery Impact (Motorcycle proxy)
    totalKg += 0.4;
    totalKg = round2(totalKg);

    const heavyCount = counts.redMeat + counts.poultryPork + counts.seafood;
    const tier = heavyCount === 0
      ? 'green'
      : counts.plantBased >= heavyCount
        ? 'green'
        : heavyCount <= counts.plantBased + 1
          ? 'balanced'
          : 'heavy';

    let message;
    if (tier === 'green') {
      message = 'Your cart is looking pretty green! 🌱 Nicely done.';
    } else if (tier === 'balanced') {
      message = 'Balanced cart — one more plant-based swap would tip this into green territory. 🥗';
    } else {
      const saving = round1(FOOD_FACTORS.redMeat - FOOD_FACTORS.plantBased);
      message = `Swapping one meat dish for a plant-based one could save ~${saving}kg CO2 — about a 30-minute drive's worth.`;
    }

    return { totalKg, counts, tier, message, confidence: 'Medium' };
  }

  return { estimateProduct, estimateFlight, estimateFoodCart, AIRPORTS };
})();

if (typeof window !== 'undefined') window.CarbonEngine = CarbonEngine;
if (typeof self !== 'undefined') self.CarbonEngine = CarbonEngine;
