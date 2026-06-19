importScripts('constants.js');

const ONE_DAY_MS = 86400000;
const MAX_HISTORY_ITEMS = 50;
const MIN_VITALITY = 20;
const MAX_VITALITY = 100;

const DEFAULT_STATE = Object.freeze({
  karmaScore: 0,
  vitality: 60,
  streak: 0,
  lastActiveDate: null,
  history: [],
  achievements: [],
  sproutName: null,
  settings: ECOSPROUT_DEFAULT_SETTINGS
});

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayString() {
  return new Date(Date.now() - ONE_DAY_MS).toISOString().slice(0, 10);
}

function clampVitality(v) {
  return Math.max(MIN_VITALITY, Math.min(MAX_VITALITY, v));
}

function applyStreak(state) {
  const today = todayString();
  if (state.lastActiveDate === today) return state;

  const yesterday = getYesterdayString();
  state.streak = state.lastActiveDate === yesterday ? state.streak + 1 : 1;
  state.lastActiveDate = today;

  return state;
}

function checkAchievements(state) {
  const unlocked = new Set(state.achievements);
  const { history, streak, karmaScore } = state;

  if (history.some((h) => h.points > 0)) unlocked.add('first_step');
  if (history.some((h) => h.reason === 'product_greener_choice')) unlocked.add('green_pick');
  if (history.filter((h) => h.reason === 'flight_direct_consideration').length >= 3) unlocked.add('direct_flyer');
  if (history.filter((h) => h.reason === 'food_green_addition').length >= 3) unlocked.add('veggie_voyager');

  if (streak >= 7) unlocked.add('week_warrior');
  if (karmaScore >= 100) unlocked.add('century_club');

  const maxStageKarma = ECOSPROUT_STAGES[ECOSPROUT_STAGES.length - 1].minKarma;
  if (karmaScore >= maxStageKarma) unlocked.add('mighty_oak');

  state.achievements = [...unlocked];
  return state;
}

function updateBadge(state) {
  chrome.action.setBadgeBackgroundColor({ color: '#2FAE71' });
  chrome.action.setBadgeText({ text: state.streak > 0 ? String(state.streak) : '' });
}

function withState(callback) {
  chrome.storage.local.get(null, (data) => {
    const state = {
      ...DEFAULT_STATE,
      ...data,
      settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) }
    };

    callback(state, (updatedState) => {
      chrome.storage.local.set(updatedState);
      updateBadge(updatedState);
    });
  });
}

function handleKarmaEvent(state, message) {
  state.karmaScore += message.points;
  state.vitality = clampVitality(state.vitality + Math.round(message.points / 2));

  state.history.unshift({
    reason: message.reason,
    points: message.points,
    meta: message.meta,
    at: message.at
  });
  state.history = state.history.slice(0, MAX_HISTORY_ITEMS);

  applyStreak(state);
  checkAchievements(state);
}

function handleLogEvent(state, message) {
  const reason = (message.meta && message.meta.kind) || 'view';
  state.history.unshift({
    reason,
    points: 0,
    meta: message.meta,
    at: message.at
  });
  state.history = state.history.slice(0, MAX_HISTORY_ITEMS);

  if (!message.meta) return;

  if (message.meta.severity === 'high') {
    state.vitality = clampVitality(state.vitality - 1);
  } else if (message.meta.severity === 'low' || message.meta.tier === 'green') {
    state.vitality = clampVitality(state.vitality + 1);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (existing) => {
    chrome.storage.local.set({ ...DEFAULT_STATE, ...existing });
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'KARMA_EVENT') {
    withState((state, save) => {
      handleKarmaEvent(state, message);
      save(state);
    });
    return false;
  }

  if (message.type === 'LOG_EVENT') {
    withState((state, save) => {
      handleLogEvent(state, message);
      save(state);
    });
    return false;
  }

  return false;
});
