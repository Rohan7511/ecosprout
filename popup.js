/**
 * EcoSprout — Popup Script
 * Renders the "lively" home base: the Sprout terrarium, an animated Karma
 * counter, streak, rotating tips, achievement badges, and recent activity.
 *
 * Note: native confirm()/alert() dialogs are unreliable inside Chrome
 * extension popups (the popup can lose focus and close mid-dialog), so the
 * reset control below uses a "tap again to confirm" pattern instead.
 */

// --- Constants ---
const MS_PER_MINUTE = 60000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const ONE_DAY_MS = 86400000;
const CONFETTI_COLORS = Object.freeze(['#6EE7A8', '#F2A93B', '#2FAE71', '#E7F1EA']);
const CONFETTI_COUNT = 24;
const CONFETTI_DURATION_MS = 1200;
const MAX_ACTIVITY_ITEMS = 8;
const RESET_CONFIRM_MS = 3000;
const DEBOUNCE_NAME_MS = 400;

const POPUP_DEFAULTS = Object.freeze({
  karmaScore: 0,
  vitality: 60,
  streak: 0,
  lastActiveDate: null,
  lastSeenScore: 0,
  history: [],
  achievements: [],
  sproutName: '',
  settings: Object.freeze({ ecommerce: true, flight: true, food: true, petBubble: true })
});

const ACTIVITY_LABELS = Object.freeze({
  product_view: '🛍️ Viewed a product',
  flight_view: '✈️ Checked a flight',
  food_view: '🍔 Checked a food order',
  product_greener_choice: '🌱 Chose a greener shipping option',
  flight_direct_consideration: '✈️ Considered a direct flight',
  food_green_addition: '🥗 Added something green'
});

// --- Elements ---
const els = {
  petAvatar: document.getElementById('petAvatar'),
  petAura: document.getElementById('petAura'),
  petStageLabel: document.getElementById('petStageLabel'),
  vitalityFill: document.getElementById('vitalityFill'),
  vitalityLabel: document.getElementById('vitalityLabel'),
  karmaScore: document.getElementById('karmaScore'),
  karmaDelta: document.getElementById('karmaDelta'),
  streakBadge: document.getElementById('streakBadge'),
  tipText: document.getElementById('tipText'),
  shuffleTip: document.getElementById('shuffleTip'),
  badgesRow: document.getElementById('badgesRow'),
  activityList: document.getElementById('activityList'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsPanel: document.getElementById('settingsPanel'),
  sproutNameInput: document.getElementById('sproutNameInput'),
  resetBtn: document.getElementById('resetBtn'),
  confettiLayer: document.getElementById('confettiLayer'),
  toggleEcommerce: document.getElementById('toggleEcommerce'),
  toggleFlight: document.getElementById('toggleFlight'),
  toggleFood: document.getElementById('toggleFood'),
  togglePet: document.getElementById('togglePet')
};

// --- Utilities ---
function getStageFor(karma) {
  let current = ECOSPROUT_STAGES[0];
  for (const s of ECOSPROUT_STAGES) {
    if (karma >= s.minKarma) current = s;
  }
  return current;
}

function animateCount(el, from, to, durationMs = 700) {
  const start = performance.now();
  function step(now) {
    const progress = Math.min(1, (now - start) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function relativeTime(ts) {
  const mins = Math.round((Date.now() - ts) / MS_PER_MINUTE);
  if (mins < 1) return 'just now';
  if (mins < MINUTES_PER_HOUR) return `${mins}m ago`;
  
  const hours = Math.round(mins / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `${hours}h ago`;
  
  return `${Math.round(hours / HOURS_PER_DAY)}d ago`;
}

function streakIsAtRisk(state) {
  if (!state.lastActiveDate || state.streak <= 0) return false;
  
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - ONE_DAY_MS).toISOString().slice(0, 10);
  
  return state.lastActiveDate !== today && state.lastActiveDate !== yesterday;
}

// --- Visual Effects ---
function burstConfetti(container) {
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = '50%';
    piece.style.top = '34%';
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 90;
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    piece.style.animationDelay = `${Math.random() * 80}ms`;
    
    container.appendChild(piece);
    setTimeout(() => piece.remove(), CONFETTI_DURATION_MS);
  }
}

// --- Render Logic ---
function renderPet(state) {
  const stage = getStageFor(state.karmaScore);
  
  els.petAvatar.textContent = stage.emoji;
  els.petStageLabel.textContent = stage.label.toUpperCase();
  els.petAura.style.background = `radial-gradient(circle, ${stage.color} 0%, transparent 68%)`;

  const vitalityPct = Math.max(4, Math.min(100, state.vitality));
  els.vitalityFill.style.width = `${vitalityPct}%`;
  els.vitalityLabel.textContent = `${vitalityPct}%`;
  els.petAura.style.animationDuration = `${3.8 - (vitalityPct / 100) * 1.8}s`;

  if (document.activeElement !== els.sproutNameInput) {
    els.sproutNameInput.value = state.sproutName || '';
  }
}

function renderStats(state, lastSeenScore) {
  animateCount(els.karmaScore, lastSeenScore, state.karmaScore);
  
  const delta = state.karmaScore - lastSeenScore;
  if (delta > 0) {
    els.karmaDelta.textContent = `+${delta}`;
    burstConfetti(els.confettiLayer);
  } else {
    els.karmaDelta.textContent = '';
  }

  els.streakBadge.textContent = streakIsAtRisk(state) ? '💤 streak paused' : `🔥 ${state.streak}-day streak`;

  els.badgesRow.innerHTML = ECOSPROUT_ACHIEVEMENTS.map((a) => {
    const unlocked = state.achievements.includes(a.id);
    return `<div class="badge ${unlocked ? 'unlocked' : 'locked'}" title="${a.name}: ${a.desc}">${a.emoji}</div>`;
  }).join('');
}

function renderActivity(state) {
  const recent = state.history.slice(0, MAX_ACTIVITY_ITEMS);
  els.activityList.innerHTML = recent.length
    ? recent.map((h) => `
        <div class="activity-row">
          <span class="activity-label">${ACTIVITY_LABELS[h.reason] || (h.meta && ACTIVITY_LABELS[h.meta.kind]) || '🌍 Activity'}</span>
          <span class="activity-time">${relativeTime(h.at)}</span>
        </div>`).join('')
    : '<div class="activity-empty">Browse a product, flight, or food order to get started!</div>';
}

function renderSettings(state) {
  els.toggleEcommerce.checked = state.settings.ecommerce !== false;
  els.toggleFlight.checked = state.settings.flight !== false;
  els.toggleFood.checked = state.settings.food !== false;
  els.togglePet.checked = state.settings.petBubble !== false;
}

function render(state, lastSeenScore) {
  renderPet(state);
  renderStats(state, lastSeenScore);
  renderActivity(state);
  renderSettings(state);
}

// --- Initialization & Listeners ---
function loadAndRender() {
  chrome.storage.local.get(null, (data) => {
    const state = { ...POPUP_DEFAULTS, ...data, settings: { ...POPUP_DEFAULTS.settings, ...(data.settings || {}) } };
    const lastSeen = typeof data.lastSeenScore === 'number' ? data.lastSeenScore : state.karmaScore;
    
    render(state, lastSeen);
    
    if (state.karmaScore !== lastSeen) {
      chrome.storage.local.set({ lastSeenScore: state.karmaScore });
    }
  });
}

function pickTip() {
  els.tipText.textContent = ECOSPROUT_TIPS[Math.floor(Math.random() * ECOSPROUT_TIPS.length)];
}

els.shuffleTip.addEventListener('click', pickTip);

els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

let nameDebounce;
els.sproutNameInput.addEventListener('input', (e) => {
  clearTimeout(nameDebounce);
  const value = e.target.value;
  nameDebounce = setTimeout(() => chrome.storage.local.set({ sproutName: value }), DEBOUNCE_NAME_MS);
});

[['toggleEcommerce', 'ecommerce'], ['toggleFlight', 'flight'], ['toggleFood', 'food'], ['togglePet', 'petBubble']]
  .forEach(([elId, key]) => {
    els[elId].addEventListener('change', () => {
      chrome.storage.local.get('settings', ({ settings }) => {
        chrome.storage.local.set({ settings: { ...(settings || {}), [key]: els[elId].checked } });
      });
    });
  });

let resetArmed = false;
let resetArmTimer;
els.resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    els.resetBtn.textContent = 'Tap again to confirm';
    clearTimeout(resetArmTimer);
    resetArmTimer = setTimeout(() => { 
      resetArmed = false; 
      els.resetBtn.textContent = 'Reset my data'; 
    }, RESET_CONFIRM_MS);
    return;
  }
  
  clearTimeout(resetArmTimer);
  resetArmed = false;
  chrome.storage.local.clear(() => {
    els.resetBtn.textContent = 'Reset my data';
    loadAndRender();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') loadAndRender();
});

document.addEventListener('DOMContentLoaded', () => {
  pickTip();
  loadAndRender();
});
