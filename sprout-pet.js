(function () {
  if (window.__ecoSproutPetInjected) return;
  window.__ecoSproutPetInjected = true;

  // --- Constants ---
  const DRAG_TOLERANCE_PX = 5;
  const SPEECH_OFFSET_X = 210;
  const SPEECH_OFFSET_Y = 6;
  const SPEECH_MIN_MARGIN = 12;
  const SPEECH_DISPLAY_TIME_MS = 4200;
  const LOW_VITALITY_THRESHOLD = 35;
  
  // --- DOM Elements ---
  let bubbleEl = null;
  let speechEl = null;
  let panelEl = null;
  let speechTimer = null;
  
  // --- State ---
  let dragInfo = { active: false, dragging: false };
  let state = { 
    karma: 0, 
    vitality: 60, 
    streak: 0, 
    sproutName: '', 
    stage: ECOSPROUT_STAGES[0] 
  };

  // --- Utilities ---
  function getStageFor(karma) {
    return ECOSPROUT_STAGES.findLast((s) => karma >= s.minKarma) || ECOSPROUT_STAGES[0];
  }

  function escapeHtml(unsafe) {
    return (unsafe || '').replace(/[&<"'>]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  // --- UI Construction ---
  function buildBubble() {
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'ecosprout-bubble';
    bubbleEl.className = 'ecosprout-widget ecosprout-bubble';
    bubbleEl.innerHTML = '<span class="ecosprout-bubble-ring"></span><span class="ecosprout-bubble-emoji">🌱</span>';

    speechEl = document.createElement('div');
    speechEl.className = 'ecosprout-widget ecosprout-speech';
    speechEl.style.display = 'none';

    panelEl = document.createElement('div');
    panelEl.className = 'ecosprout-widget ecosprout-pet-panel';
    panelEl.style.display = 'none';

    document.body.append(bubbleEl, speechEl, panelEl);

    bubbleEl.addEventListener('mousedown', onDragStart);
    bubbleEl.addEventListener('click', onBubbleClick);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  }

  // --- Event Handlers ---
  function onDragStart(e) {
    const rect = bubbleEl.getBoundingClientRect();
    dragInfo = {
      active: true,
      dragging: false,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top
    };
  }

  function onDragMove(e) {
    if (!dragInfo.active) return;
    
    if (!dragInfo.dragging) {
      const moved = Math.abs(e.clientX - dragInfo.startX) + Math.abs(e.clientY - dragInfo.startY);
      if (moved > DRAG_TOLERANCE_PX) {
        dragInfo.dragging = true;
      }
    }
    
    if (!dragInfo.dragging) return;
    
    bubbleEl.style.right = 'auto';
    bubbleEl.style.bottom = 'auto';
    bubbleEl.style.left = `${e.clientX - dragInfo.offsetX}px`;
    bubbleEl.style.top = `${e.clientY - dragInfo.offsetY}px`;
  }

  function onDragEnd() { 
    dragInfo.active = false; 
  }

  function onBubbleClick() {
    if (dragInfo.dragging) { 
      dragInfo.dragging = false; 
      return; 
    }
    
    const isOpen = panelEl.style.display !== 'none';
    panelEl.style.display = isOpen ? 'none' : 'block';
    
    if (!isOpen) {
      renderPanel();
    }
  }

  // --- Rendering & Visuals ---
  function renderPanel() {
    const pct = Math.max(4, Math.min(100, state.vitality));
    const safeName = escapeHtml(state.sproutName) || 'Your Sprout';
    
    panelEl.innerHTML = `
      <div class="ecosprout-panel-header">
        <span class="ecosprout-panel-emoji">${state.stage.emoji}</span>
        <div>
          <div class="ecosprout-panel-title">${safeName}</div>
          <div class="ecosprout-panel-stage">${state.stage.label}</div>
        </div>
      </div>
      <div class="ecosprout-vitality-track"><div class="ecosprout-vitality-fill" style="width:${pct}%"></div></div>
      <div class="ecosprout-panel-stats"><span>🏆 ${state.karma}</span><span>🔥 ${state.streak}d streak</span></div>
      <div class="ecosprout-panel-footer">Click the EcoSprout icon in your toolbar for the full garden 🌿</div>
    `;
  }

  function positionSpeech() {
    const rect = bubbleEl.getBoundingClientRect();
    speechEl.style.left = `${Math.max(SPEECH_MIN_MARGIN, rect.left - SPEECH_OFFSET_X)}px`;
    speechEl.style.top = `${Math.max(SPEECH_MIN_MARGIN, rect.top - SPEECH_OFFSET_Y)}px`;
  }

  function showSpeech(text, durationMs = SPEECH_DISPLAY_TIME_MS) {
    if (!speechEl) return;
    
    speechEl.textContent = text;
    speechEl.style.display = 'block';
    positionSpeech();
    
    speechEl.classList.remove('ecosprout-pop');
    requestAnimationFrame(() => speechEl.classList.add('ecosprout-pop'));
    
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => { speechEl.style.display = 'none'; }, durationMs);
  }

  function applyMood() {
    if (!bubbleEl) return;
    
    bubbleEl.querySelector('.ecosprout-bubble-emoji').textContent = state.stage.emoji;
    bubbleEl.style.setProperty('--ecosprout-stage-color', state.stage.color);
    bubbleEl.classList.toggle('ecosprout-low-vitality', state.vitality < LOW_VITALITY_THRESHOLD);
  }

  // --- State Synchronization ---
  function refreshState() {
    chrome.storage.local.get(['karmaScore', 'vitality', 'streak', 'sproutName'], (data) => {
      state.karma = data.karmaScore || 0;
      state.vitality = typeof data.vitality === 'number' ? data.vitality : 60;
      state.streak = data.streak || 0;
      state.sproutName = data.sproutName || '';
      state.stage = getStageFor(state.karma);
      
      applyMood();
    });
  }

  // --- Public API ---
  window.SproutPet = {
    init() {
      if (bubbleEl) return;
      buildBubble();
      refreshState();
    },
    destroy() {
      [bubbleEl, speechEl, panelEl].forEach((el) => el && el.remove());
      bubbleEl = null;
      speechEl = null;
      panelEl = null;
    },
    react(text) {
      if (bubbleEl) showSpeech(text);
    }
  };

  // --- Listeners ---
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.karmaScore || changes.vitality || changes.streak || changes.sproutName)) {
        refreshState();
      }
    });
  }
})();
