/**
 * EcoSprout — Background Service Worker
 * Deliberately holds NO long-lived in-memory state. MV3 service workers can
 * be killed and restarted at any time, so every handler reads the latest
 * state from chrome.storage.local, mutates a local copy, and writes it
 * straight back. This is the correct MV3 pattern — porting an MV2
 * background-page habit of caching state in module-level variables is a
 * common source of "it works until the worker naps" bugs.
 */
importScripts('constants.js');

const DEFAULT_STATE = {
  karmaScore: 0,
  vitality: 60,
  streak: 0,
  lastActiveDate: null,
  history: [],
  achievements: [],
  sproutName: null,
  settings: { ecommerce: true, flight: true, food: true, petBubble: true }
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function minutesUntilHour(targetHour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(targetHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return Math.max(1, Math.round((next - now) / 60000));
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (existing) => {
    chrome.storage.local.set({ ...DEFAULT_STATE, ...existing });
  });
  chrome.alarms.create('ecosprout-daily-check', { delayInMinutes: minutesUntilHour(18), periodInMinutes: 1440 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get('ecosprout-daily-check', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('ecosprout-daily-check', { delayInMinutes: minutesUntilHour(18), periodInMinutes: 1440 });
    }
  });
});

function clampVitality(v) {
  return Math.max(20, Math.min(100, v)); // floor at 20 — "thirsty", never "dying"
}

function applyStreak(state) {
  const today = todayString();
  if (state.lastActiveDate === today) return state;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  state.streak = state.lastActiveDate === yesterday ? state.streak + 1 : 1;
  state.lastActiveDate = today;
  return state;
}

function checkAchievements(state) {
  const unlocked = new Set(state.achievements);
  if (state.history.some((h) => h.points > 0)) unlocked.add('first_step');
  if (state.history.some((h) => h.reason === 'product_greener_choice')) unlocked.add('green_pick');
  if (state.history.filter((h) => h.reason === 'flight_direct_consideration').length >= 3) unlocked.add('direct_flyer');
  if (state.history.filter((h) => h.reason === 'food_green_addition').length >= 3) unlocked.add('veggie_voyager');
  if (state.streak >= 7) unlocked.add('week_warrior');
  if (state.karmaScore >= 100) unlocked.add('century_club');
  if (state.karmaScore >= ECOSPROUT_STAGES[ECOSPROUT_STAGES.length - 1].minKarma) unlocked.add('mighty_oak');
  state.achievements = [...unlocked];
  return state;
}

function updateBadge(state) {
  chrome.action.setBadgeBackgroundColor({ color: '#2FAE71' });
  chrome.action.setBadgeText({ text: state.streak > 0 ? String(state.streak) : '' });
}

function withState(callback) {
  chrome.storage.local.get(null, (data) => {
    const state = { ...DEFAULT_STATE, ...data, settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) } };
    callback(state, (updated) => {
      chrome.storage.local.set(updated);
      updateBadge(updated);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'KARMA_EVENT') {
    withState((state, save) => {
      state.karmaScore += message.points;
      state.vitality = clampVitality(state.vitality + Math.round(message.points / 2));
      state.history.unshift({ reason: message.reason, points: message.points, meta: message.meta, at: message.at });
      state.history = state.history.slice(0, 50);
      applyStreak(state);
      checkAchievements(state);
      save(state);
    });
    return false;
  } else if (message.type === 'LOG_EVENT') {
    withState((state, save) => {
      state.history.unshift({ reason: (message.meta && message.meta.kind) || 'view', points: 0, meta: message.meta, at: message.at });
      state.history = state.history.slice(0, 50);
      if (message.meta && message.meta.severity === 'high') {
        state.vitality = clampVitality(state.vitality - 1);
      } else if (message.meta && (message.meta.severity === 'low' || message.meta.tier === 'green')) {
        state.vitality = clampVitality(state.vitality + 1);
      }
      save(state);
    });
  }
  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'ecosprout-daily-check') return;
  withState((state) => {
    if (state.lastActiveDate !== todayString()) {
      chrome.notifications.create('ecosprout-reminder', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: `${state.sproutName || 'Your Sprout'} misses you! 🌱`,
        message: 'A few mindful picks today could grow your Carbon Karma. Come say hi!'
      });
    }
  });
});
