const COMPLETED_KEY = 'saq_completed';
const UNVERIFIED_KEY = 'saq_unverified';

// Basemap tiles — MapTiler (free tier). Restrict the key to this site's
// domain in the MapTiler dashboard. Swap the style name to taste:
// voyager (the CARTO style you had) · positron (clean/light) ·
// streets-v2 (Google-like) · bright-v2 · outdoor-v2 · toner-v2
const MAPTILER_KEY = 'lBugL5cyxnh6To7COAfL';
const MAPTILER_STYLE = 'voyager';
const BASEMAP_URL = `https://api.maptiler.com/maps/${MAPTILER_STYLE}/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`;
const BASEMAP_ATTRIB =
  '<a href="https://www.maptiler.com/copyright/">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>';

const map = L.map('map', {
  center: [22.2852, 114.1503],
  zoom: 15,
  zoomControl: true
});

L.tileLayer(BASEMAP_URL, {
  attribution: BASEMAP_ATTRIB,
  crossOrigin: true,
  maxZoom: 20
}).addTo(map);

let allArtworks = [];
let markers = [];
let activeFilter = 'all';
let activeQuest = null;
let miniMapInstance = null;
let checkinFailCount = 0;
let userMarker = null;
let userCircle = null;
let trackingLine = null;

const PLAY_MODE_KEY = 'saq_play_mode';
const PLAY_MODES = {
  nearest: { icon: '📍', label: 'Nearest first' },
  artist:  { icon: '🎨', label: 'By artist' },
  type:    { icon: '🖼️', label: 'By type' },
  shuffle: { icon: '🎲', label: 'Surprise me' },
  default: { icon: '📋', label: 'List order' }
};
let playMode = localStorage.getItem(PLAY_MODE_KEY);
let nearestOrigin = null;
let shuffleOrderIds = null;

const PRECISION_KEY = 'saq_precision';
let precision = localStorage.getItem(PRECISION_KEY) || 'exact';
let searchQuery = '';
let questPanelTab = 'quests';

const HUNT_MODE_KEY = 'saq_hunt_mode';
// 'explore' = browse every artwork freely on the map and in the list
// 'quest'   = one quest unlocked at a time; the rest stay locked until you check in
let huntMode = localStorage.getItem(HUNT_MODE_KEY) || 'explore';

const ARTIST_KEY = 'saq_artist';
let activeArtist = localStorage.getItem(ARTIST_KEY) || null; // null = every artist

function getActiveQuest() {
  const ordered = orderForPlayMode(allArtworks);
  return ordered.find(a => !isCompleted(a.id)) || null;
}

function isQuestVisible(art) {
  if (huntMode !== 'quest') return true;
  return isCompleted(art.id) || art.id === getActiveQuest()?.id;
}

// Type + artist filters only narrow the browsing view (explore mode).
// Quest mode ignores them — isQuestVisible already shows just the live quest.
function passesExploreFilters(art) {
  if (huntMode === 'quest') return true;
  if (activeFilter !== 'all' && art.type !== activeFilter) return false;
  if (activeArtist && art.artist !== activeArtist) return false;
  return true;
}

// ─── Completion state ─────────────────────────────

function getCompleted() {
  try { return JSON.parse(localStorage.getItem(COMPLETED_KEY)) || []; }
  catch { return []; }
}

function markCompleted(id) {
  const c = getCompleted();
  if (!c.includes(id)) {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify([...c, id]));
  }
}

function isCompleted(id) {
  return getCompleted().includes(id);
}

function getUnverified() {
  try { return JSON.parse(localStorage.getItem(UNVERIFIED_KEY)) || []; }
  catch { return []; }
}

function markUnverified(id) {
  const u = getUnverified();
  if (!u.includes(id)) {
    localStorage.setItem(UNVERIFIED_KEY, JSON.stringify([...u, id]));
  }
}

function isUnverified(id) {
  return getUnverified().includes(id);
}

// ─── Markers ──────────────────────────────────────

function makeMarker(art, isActive) {
  const el = document.createElement('div');
  el.className = `art-marker ${art.type}${isCompleted(art.id) ? ' found' : ''}${isActive ? ' active' : ''}`;

  const marker = L.marker([art.lat, art.lng], {
    icon: L.divIcon({
      html: el.outerHTML,
      className: '',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    })
  });

  marker.artData = art;
  marker.on('click', () => openQuestCard(art));
  return marker;
}

function renderMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const ordered = orderForPlayMode(allArtworks);
  const activeQuest = ordered.find(a => !isCompleted(a.id)) || null;

  allArtworks.forEach(art => {
    if (!passesExploreFilters(art)) return;
    if (!isQuestVisible(art)) return;
    const isActive = !!activeQuest && art.id === activeQuest.id;
    const m = makeMarker(art, isActive);
    m.addTo(map);
    markers.push(m);
  });

  const filtered = allArtworks.filter(passesExploreFilters);
  const foundCount = filtered.filter(a => isCompleted(a.id)).length;
  const label = activeArtist
    ? `by ${activeArtist} found`
    : activeFilter === 'all' ? 'found' : `${activeFilter} quests found`;
  document.getElementById('count').innerHTML =
    `<strong>${foundCount}</strong> of ${filtered.length} ${label} · Sheung Wan, HK`;
}

// ─── Artwork panel ────────────────────────────────

function closePanel() {
  document.getElementById('panel').classList.remove('open');
}

// ─── Quest panel ──────────────────────────────────

function openQuestPanel() {
  closePanel();
  if (playMode === 'shuffle' && !shuffleOrderIds) {
    shuffleOrderIds = shuffleArray(allArtworks.map(a => a.id));
  }
  renderQuestPanelBody();
  document.getElementById('quest-panel').classList.add('open');
  document.getElementById('open-quests').classList.add('active');
}

function closeQuestPanel() {
  document.getElementById('quest-panel').classList.remove('open');
  document.getElementById('open-quests').classList.remove('active');
}

function groupLabelFor(art) {
  // already narrowed to one artist/type — no headers needed
  if (activeArtist || activeFilter !== 'all') return null;
  if (playMode === 'artist') return art.artist || 'Unknown';
  if (playMode === 'type') return art.type;
  return null;
}

function orderForPlayMode(list) {
  if (playMode === 'nearest' && nearestOrigin) {
    return [...list].sort((a, b) =>
      getDistance(nearestOrigin.lat, nearestOrigin.lng, a.lat, a.lng) -
      getDistance(nearestOrigin.lat, nearestOrigin.lng, b.lat, b.lng)
    );
  }
  if ((playMode === 'artist' || playMode === 'type') && !activeArtist && activeFilter === 'all') {
    return [...list].sort((a, b) => {
      const groupCompare = groupLabelFor(a).localeCompare(groupLabelFor(b));
      if (groupCompare !== 0) return groupCompare;
      if (nearestOrigin) {
        return getDistance(nearestOrigin.lat, nearestOrigin.lng, a.lat, a.lng) -
               getDistance(nearestOrigin.lat, nearestOrigin.lng, b.lat, b.lng);
      }
      return 0;
    });
  }
  if (playMode === 'shuffle' && shuffleOrderIds) {
    const rank = id => {
      const i = shuffleOrderIds.indexOf(id);
      return i === -1 ? Infinity : i;
    };
    return [...list].sort((a, b) => rank(a.id) - rank(b.id));
  }
  return list;
}

function renderQuestList() {
  const completed = getCompleted();
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  const ordered = orderForPlayMode(allArtworks);

  const visible = ordered
    .filter(isQuestVisible)
    .filter(passesExploreFilters)
    .filter(art => !searchQuery || (art.artist || '').toLowerCase().includes(searchQuery));

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quest-no-results';
    empty.textContent = searchQuery
      ? `No quests match "${searchQuery}"`
      : activeArtist
        ? `No quests by ${activeArtist}`
        : `No ${activeFilter} quests`;
    list.appendChild(empty);
  }

  let lastGroup = null;
  visible.forEach(art => {
    const groupLabel = groupLabelFor(art);
    if (groupLabel !== null && groupLabel !== lastGroup) {
      const header = document.createElement('div');
      header.className = 'quest-group-header';
      header.textContent = groupLabel;
      list.appendChild(header);
      lastGroup = groupLabel;
    }

    const num = allArtworks.indexOf(art) + 1;
    const done = completed.includes(art.id);
    const item = document.createElement('div');
    item.className = `quest-item${done ? ' completed' : ''}`;
    item.innerHTML = `
      <div class="quest-item-num">${done ? '✓' : num}</div>
      <div class="quest-item-info">
        <div class="quest-item-type">${art.type}</div>
        <div class="quest-item-area">${art.address.split(',')[0]}</div>
      </div>
      ${done
        ? '<div class="quest-item-done-label">Found</div>'
        : '<div class="quest-item-arrow">→</div>'
      }
    `;
    item.addEventListener('click', () => openQuestCard(art));
    list.appendChild(item);
  });

  if (huntMode === 'quest' && !searchQuery) {
    const remaining =
      allArtworks.filter(a => !isCompleted(a.id)).length - (getActiveQuest() ? 1 : 0);
    if (remaining > 0) {
      const locked = document.createElement('div');
      locked.className = 'quest-locked-footer';
      locked.textContent = `🔒 ${remaining} more quest${remaining > 1 ? 's' : ''} locked — check in here to unlock the next`;
      list.appendChild(locked);
    }
  }
}

function renderGallery() {
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  const found = allArtworks.filter(a => isCompleted(a.id) && passesExploreFilters(a));

  if (!found.length) {
    const empty = document.createElement('div');
    empty.className = 'quest-no-results';
    empty.textContent = 'Nothing found yet — go hunt!';
    list.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  found.forEach(art => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <div class="gallery-card-thumb ${art.type}">${art.photo ? `<img src="${art.photo}" alt="${art.title}">` : '✓'}</div>
      <div class="gallery-card-title">${art.title}</div>
      <div class="gallery-card-artist">${art.artist}</div>
    `;
    card.addEventListener('click', () => openQuestCard(art));
    grid.appendChild(card);
  });
  list.appendChild(grid);
}

function updateQuestScore() {
  const completed = getCompleted();
  const score = document.getElementById('quest-panel-score');
  if (score) score.textContent = `${completed.length} / ${allArtworks.length}`;
  updateNavScore();
}

function renderQuestPanelBody() {
  document.getElementById('play-mode-pill').classList.toggle('hidden', questPanelTab === 'gallery');
  document.querySelector('.quest-search-row').classList.toggle(
    'hidden', questPanelTab === 'gallery' || huntMode === 'quest'
  );

  if (questPanelTab === 'gallery') {
    renderGallery();
  } else {
    renderQuestList();
  }
  updateQuestScore();
}

function initGalleryToggle() {
  const btn = document.getElementById('gallery-toggle');
  const title = document.querySelector('.quest-panel-title');
  btn.addEventListener('click', () => {
    questPanelTab = questPanelTab === 'gallery' ? 'quests' : 'gallery';
    if (questPanelTab === 'gallery') {
      btn.textContent = '🎯';
      btn.title = 'Back to quests';
      title.textContent = 'GALLERY';
    } else {
      btn.textContent = '🖼️';
      btn.title = 'View gallery';
      title.textContent = 'QUESTS';
    }
    renderQuestPanelBody();
  });
}

// ─── Play mode ────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveNearestOrigin(callback) {
  if (userMarker) {
    const ll = userMarker.getLatLng();
    nearestOrigin = { lat: ll.lat, lng: ll.lng };
    callback();
    return;
  }
  if (!navigator.geolocation) { callback(); return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      nearestOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      callback();
    },
    () => callback(),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function updatePlayModePill() {
  const pill = document.getElementById('play-mode-pill');
  if (!pill) return;
  if (activeArtist) {
    pill.textContent = `🎨 ${activeArtist}`;
    return;
  }
  if (activeFilter && activeFilter !== 'all') {
    pill.textContent = `🖼️ ${activeFilter}`;
    return;
  }
  const mode = playMode && PLAY_MODES[playMode] ? playMode : 'default';
  const { icon, label } = PLAY_MODES[mode];
  pill.textContent = `${icon} ${label}`;
}

function refreshQuestUI() {
  renderQuestPanelBody();
  renderMarkers();
}

function openPlayModeBackdrop() {
  document.getElementById('restart-hunt-row').classList.toggle('hidden', getCompleted().length === 0);
  document.getElementById('restart-hunt-btn').classList.remove('hidden');
  document.getElementById('restart-confirm').classList.add('hidden');
  closeArtistPicker();  // floating dropdowns always start collapsed
  closeTypePicker();
  syncPlayOptionState();
  document.getElementById('play-mode-backdrop').classList.remove('hidden');
}

// the sheet stays open while you tune every option — this is the only thing that closes it
function closePlayModeBackdrop() {
  closeArtistPicker();
  closeTypePicker();
  document.getElementById('play-mode-backdrop').classList.add('hidden');
}

function syncPlayOptionState() {
  const typeActive = activeFilter && activeFilter !== 'all';
  document.querySelectorAll('.play-mode-option').forEach(btn => {
    let on;
    if (btn.dataset.mode === 'artist') on = !!activeArtist;
    else if (btn.dataset.mode === 'type') on = !!typeActive;
    else on = !activeArtist && !typeActive && playMode === btn.dataset.mode;
    btn.classList.toggle('active', on);
  });
}

function resetProgress() {
  localStorage.removeItem(COMPLETED_KEY);
  localStorage.removeItem(UNVERIFIED_KEY);
  closeQuestCard();
  document.getElementById('play-mode-backdrop').classList.add('hidden');
  renderMarkers();
  renderQuestPanelBody();
}

function setPlayMode(mode) {
  playMode = mode;
  localStorage.setItem(PLAY_MODE_KEY, mode);
  clearActiveArtist();
  clearActiveType();
  closeArtistPicker();
  closeTypePicker();
  updatePlayModePill();
  syncPlayOptionState();

  if (mode === 'nearest') {
    resolveNearestOrigin(refreshQuestUI);
  } else if (mode === 'artist' || mode === 'type') {
    refreshQuestUI();
    if (!nearestOrigin) resolveNearestOrigin(refreshQuestUI);
  } else if (mode === 'shuffle') {
    shuffleOrderIds = shuffleArray(allArtworks.map(a => a.id));
    refreshQuestUI();
  } else {
    refreshQuestUI();
  }
}

function initPlayMode() {
  document.querySelectorAll('.play-mode-option').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === 'artist') { toggleArtistPicker(); return; }
      if (btn.dataset.mode === 'type') { toggleTypePicker(); return; }
      setPlayMode(btn.dataset.mode);
    });
  });
  document.getElementById('play-mode-done').addEventListener('click', closePlayModeBackdrop);
  document.getElementById('play-mode-pill').addEventListener('click', openPlayModeBackdrop);
  // click the dimmed area outside the card to close
  document.getElementById('play-mode-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closePlayModeBackdrop();
  });
  initArtistPicker();
  initTypePicker();
  updatePlayModePill();
}

// ─── Filter pickers (artist / type) ───────────────

function clearActiveArtist() {
  activeArtist = null;
  localStorage.removeItem(ARTIST_KEY);
}

function clearActiveType() {
  activeFilter = 'all';
  syncFilterBar();
}

// keep the header type-filter bar's highlight in step with activeFilter
function syncFilterBar() {
  document.querySelectorAll('#filters .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === activeFilter);
  });
}

function toggleArtistPicker() {
  const picker = document.getElementById('artist-picker');
  const willShow = picker.classList.contains('hidden');
  closeTypePicker();
  picker.classList.toggle('hidden', !willShow);
  if (willShow) {
    buildArtistPicker();
    document.getElementById('artist-picker-search').focus();
  }
}

function buildArtistPicker() {
  const listEl = document.getElementById('artist-picker-list');
  const search = document.getElementById('artist-picker-search');
  const q = (search.value || '').trim().toLowerCase();
  const artists = [...new Set(allArtworks.map(a => a.artist).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  listEl.innerHTML = '';

  const addItem = (label, value) => {
    const b = document.createElement('button');
    b.className = 'opt-picker-item' + (value === activeArtist ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => selectArtist(value));
    listEl.appendChild(b);
  };

  if (!q) addItem('All artists', null);
  artists
    .filter(name => !q || name.toLowerCase().includes(q))
    .forEach(name => addItem(name, name));

  if (!listEl.children.length) {
    const empty = document.createElement('div');
    empty.className = 'opt-picker-empty';
    empty.textContent = 'No artist matches';
    listEl.appendChild(empty);
  }
}

function selectArtist(name) {
  activeArtist = name || null;
  if (activeArtist) localStorage.setItem(ARTIST_KEY, activeArtist);
  else localStorage.removeItem(ARTIST_KEY);
  clearActiveType();

  playMode = 'artist';
  localStorage.setItem(PLAY_MODE_KEY, 'artist');

  closeArtistPicker();
  updatePlayModePill();
  syncPlayOptionState();
  refreshQuestUI();
}

function closeArtistPicker() {
  const picker = document.getElementById('artist-picker');
  if (picker) picker.classList.add('hidden');
}

function initArtistPicker() {
  const search = document.getElementById('artist-picker-search');
  if (search) search.addEventListener('input', buildArtistPicker);
  initPickerOutsideClose('artist-picker', '.artist-option-wrap', closeArtistPicker);
}

// ─── Type picker ──────────────────────────────────

function toggleTypePicker() {
  const picker = document.getElementById('type-picker');
  const willShow = picker.classList.contains('hidden');
  closeArtistPicker();
  picker.classList.toggle('hidden', !willShow);
  if (willShow) buildTypePicker();
}

function buildTypePicker() {
  const listEl = document.getElementById('type-picker-list');
  const types = [...new Set(allArtworks.map(a => a.type).filter(Boolean))].sort();
  listEl.innerHTML = '';

  const addItem = (label, value) => {
    const b = document.createElement('button');
    b.className = 'opt-picker-item' + (value === activeFilter ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => selectType(value));
    listEl.appendChild(b);
  };

  addItem('All types', 'all');
  types.forEach(t => addItem(t, t));
}

function selectType(type) {
  activeFilter = type || 'all';
  clearActiveArtist();
  syncFilterBar();

  playMode = 'type';
  localStorage.setItem(PLAY_MODE_KEY, 'type');

  closeTypePicker();
  updatePlayModePill();
  syncPlayOptionState();
  refreshQuestUI();
}

function closeTypePicker() {
  const picker = document.getElementById('type-picker');
  if (picker) picker.classList.add('hidden');
}

function initTypePicker() {
  initPickerOutsideClose('type-picker', '.type-option-wrap', closeTypePicker);
}

// shared: click anywhere in the sheet outside this picker's wrap closes it
function initPickerOutsideClose(pickerId, wrapSel, close) {
  document.getElementById('play-mode-backdrop').addEventListener('click', e => {
    const picker = document.getElementById(pickerId);
    if (!picker || picker.classList.contains('hidden')) return;
    if (e.target.closest(wrapSel)) return;
    close();
  });
}

function applyHuntMode() {
  const filters = document.getElementById('filters');
  if (filters) filters.classList.toggle('hidden', huntMode === 'quest');

  if (huntMode === 'quest') {
    clearActiveType();
    clearActiveArtist();
    updatePlayModePill();
  }

  document.querySelectorAll('.mode-option').forEach(b => {
    b.classList.toggle('active', b.dataset.modeChoice === huntMode);
  });
}

function setHuntMode(mode) {
  huntMode = mode;
  localStorage.setItem(HUNT_MODE_KEY, mode);
  closeArtistPicker();
  closeTypePicker();
  applyHuntMode();
  syncPlayOptionState();
  refreshQuestUI();
}

function initHuntMode() {
  document.querySelectorAll('.mode-option').forEach(btn => {
    btn.addEventListener('click', () => setHuntMode(btn.dataset.modeChoice));
  });
  applyHuntMode();
}

function initRestart() {
  document.getElementById('restart-hunt-btn').addEventListener('click', () => {
    document.getElementById('restart-hunt-btn').classList.add('hidden');
    document.getElementById('restart-confirm').classList.remove('hidden');
  });
  document.getElementById('restart-confirm-cancel').addEventListener('click', () => {
    document.getElementById('restart-confirm').classList.add('hidden');
    document.getElementById('restart-hunt-btn').classList.remove('hidden');
  });
  document.getElementById('restart-confirm-yes').addEventListener('click', resetProgress);
}

function setPrecision(mode) {
  precision = mode;
  localStorage.setItem(PRECISION_KEY, mode);
  document.querySelectorAll('.precision-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.precision === mode);
  });
  renderMarkers();
  if (activeQuest && !document.getElementById('quest-card').classList.contains('hidden')) {
    openQuestCard(activeQuest);
  }
}

function initPrecision() {
  document.querySelectorAll('.precision-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.precision === precision);
    btn.addEventListener('click', () => setPrecision(btn.dataset.precision));
  });
}

// ─── Quest search ─────────────────────────────────

function initSearch() {
  const input = document.getElementById('quest-search');
  const clearBtn = document.getElementById('quest-search-clear');
  if (!input) return;

  input.addEventListener('input', () => {
    searchQuery = input.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', !searchQuery);
    renderQuestPanelBody();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    searchQuery = '';
    clearBtn.classList.add('hidden');
    renderQuestPanelBody();
    input.focus();
  });
}

// ─── Quest card ───────────────────────────────────

function openQuestCard(art) {
  if (miniMapInstance) {
    miniMapInstance.remove();
    miniMapInstance = null;
  }

  activeQuest = art;
  const done = isCompleted(art.id);
  const content = document.getElementById('quest-card-content');
  checkinFailCount = 0;

  const showMiniMap = !done && !art.photo && precision === 'exact';

  const photoHTML = art.photo
    ? `<div class="quest-photo"><img src="${art.photo}" alt="Quest" /></div>`
    : done
      ? `<div class="quest-photo-placeholder">✓</div>`
      : precision === 'approx'
        ? `<div class="quest-zone-placeholder">
             <div class="quest-zone-placeholder-icon">🌫️</div>
             <div class="quest-zone-placeholder-text">Approximate zone — follow the hint</div>
           </div>`
        : `<div id="quest-mini-map" class="quest-mini-map"></div>`;

  const nextQuest = done ? getNextQuest() : null;

  content.innerHTML = `
    <div class="quest-card-header">
      <span class="quest-card-type ${art.type}">${art.type}</span>
      ${done ? `<span class="quest-card-found-badge">FOUND ✓${isUnverified(art.id) ? ' <span class="unverified-tag">unverified</span>' : ''}</span>` : ''}
    </div>
    ${photoHTML}
    ${done ? '' : `<div class="quest-card-hint">${art.hint}</div><div id="quest-extra-hint" class="quest-extra-hint hidden"></div>`}
    ${done
      ? `<div class="quest-revealed">
           <div class="quest-revealed-title">${art.title}</div>
           <div class="quest-revealed-artist">by ${art.artist}</div>
         </div>
         <div class="quest-fun-fact"><strong>Fun fact</strong>${art.hint}</div>
         ${nextQuest
           ? `<button id="next-quest-btn" class="checkin-btn">→ Next: ${nextQuest.type} at ${nextQuest.address.split(',')[0]}</button>`
           : `<div class="quest-all-done">
                <div class="quest-all-done-title">🏆 Hunt complete!</div>
                <div class="quest-all-done-text">You found all ${allArtworks.length} pieces across Sheung Wan. Nice work!</div>
              </div>`
         }`
      : `<button id="checkin-btn" class="checkin-btn">📍 I'm here — Check In</button>
         <div id="gps-status" class="gps-status"></div>`
    }
  `;

  document.getElementById('quest-card').classList.remove('hidden');
  document.getElementById('quest-backdrop').classList.remove('hidden');

  if (showMiniMap) {
    miniMapInstance = L.map('quest-mini-map', {
      center: [art.lat, art.lng],
      zoom: 17,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      attributionControl: false
    });
    L.tileLayer(BASEMAP_URL, {
      crossOrigin: true,
      maxZoom: 20
    }).addTo(miniMapInstance);
    L.circle([art.lat, art.lng], {
      radius: art.radius || 50,
      color: '#2ec4b6',
      fillColor: '#2ec4b6',
      fillOpacity: 0.18,
      weight: 2.5
    }).addTo(miniMapInstance);
  }

  if (!done) {
    document.getElementById('checkin-btn').addEventListener('click', attemptCheckin);
  } else if (nextQuest) {
    document.getElementById('next-quest-btn').addEventListener('click', () => openQuestCard(nextQuest));
  }
}

function getNextQuest() {
  return getActiveQuest();
}

function celebrateFind(big) {
  const card = document.getElementById('quest-card');
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const emojis = ['🎉', '✨', '⭐', '🎊'];
  const count = big ? 32 : 14;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    layer.appendChild(piece);
  }
  card.appendChild(layer);
  setTimeout(() => layer.remove(), 1400);
}

function closeQuestCard() {
  if (miniMapInstance) {
    miniMapInstance.remove();
    miniMapInstance = null;
  }
  document.getElementById('quest-card').classList.add('hidden');
  document.getElementById('quest-backdrop').classList.add('hidden');
  activeQuest = null;
}

// ─── GPS check-in ─────────────────────────────────

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function playCheckinFeedback(big) {
  if (navigator.vibrate) {
    navigator.vibrate(big ? [40, 60, 40, 60, 120] : [40]);
  }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    setTimeout(() => ctx.close(), (notes.length * 0.09 + 0.5) * 1000);
  } catch {}
}

function completeQuest(art, { unverified } = {}) {
  markCompleted(art.id);
  if (unverified) markUnverified(art.id);
  renderMarkers();
  if (userMarker) {
    const ll = userMarker.getLatLng();
    updateTrackingLine(ll.lat, ll.lng);
  }
  openQuestCard(art);
  const allDone = getCompleted().length === allArtworks.length;
  celebrateFind(allDone);
  playCheckinFeedback(allDone);
  if (allDone) {
    mascotSay('🏆 Hunt complete!', `You found all ${allArtworks.length} pieces — incredible work!`);
  } else {
    mascotSay('Nice find! 🎉', `That's one more ${art.type} down.`);
  }
  renderQuestPanelBody();
}

function manualCheckin(art) {
  showCheckinConfirm(art, { unverified: true });
}

function showCheckinConfirm(art, { unverified } = {}) {
  activeQuest = art;
  const content = document.getElementById('quest-card-content');

  const photoHTML = art.photo
    ? `<div class="quest-photo"><img src="${art.photo}" alt="${art.title}" /></div>`
    : `<div class="quest-photo-placeholder">🖼️</div>`;

  content.innerHTML = `
    <div class="quest-card-header">
      <span class="quest-card-type ${art.type}">${art.type}</span>
    </div>
    ${photoHTML}
    <div class="quest-confirm-body">
      <div class="quest-confirm-title">${art.title}</div>
      <div class="quest-confirm-artist">by ${art.artist}</div>
      <div class="quest-confirm-hint">${art.hint}</div>
      <div class="quest-confirm-question">Does this match what you found?</div>
    </div>
    <button id="confirm-yes-btn" class="checkin-btn">✅ Yes, this is it!</button>
    <button id="confirm-no-btn" class="confirm-no-btn">Not this one — keep looking</button>
  `;

  document.getElementById('confirm-yes-btn').addEventListener('click', () => completeQuest(art, { unverified }));
  document.getElementById('confirm-no-btn').addEventListener('click', () => openQuestCard(art));
}

function offerManualCheckin(status, message) {
  if (!status) return;
  status.innerHTML = `${message} <button id="manual-checkin-btn" class="manual-checkin-btn">Check in anyway (unverified)</button>`;
  document.getElementById('manual-checkin-btn').addEventListener('click', () => manualCheckin(activeQuest));
}

function maybeShowExtraHint() {
  if (checkinFailCount < 3 || precision !== 'approx' || !activeQuest) return;
  const el = document.getElementById('quest-extra-hint');
  if (el && el.classList.contains('hidden')) {
    el.textContent = `Still stuck? It's around: ${activeQuest.address}`;
    el.classList.remove('hidden');
  }
}

function attemptCheckin() {
  const status = document.getElementById('gps-status');
  const btn = document.getElementById('checkin-btn');

  if (!navigator.geolocation) {
    offerManualCheckin(status, 'GPS not available on this device.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Getting location…';

  navigator.geolocation.getCurrentPosition(
    pos => {
      const dist = getDistance(
        pos.coords.latitude, pos.coords.longitude,
        activeQuest.lat, activeQuest.lng
      );
      const radius = activeQuest.radius || 50;

      if (dist <= radius) {
        checkinFailCount = 0;
        showCheckinConfirm(activeQuest);
      } else {
        checkinFailCount++;
        btn.disabled = false;
        btn.textContent = "📍 I'm here — Check In";
        if (status) status.textContent = `You're about ${Math.round(dist)}m away. Get closer!`;
        maybeShowExtraHint();
      }
    },
    () => {
      btn.disabled = false;
      btn.textContent = "📍 I'm here — Check In";
      offerManualCheckin(status, 'Could not get your location.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ─── Nav score ────────────────────────────────────

function updateNavScore() {
  const completed = getCompleted();
  const el = document.getElementById('quest-nav-score');
  if (el) el.textContent = `${completed.length}/${allArtworks.length}`;
}

// ─── Filters ──────────────────────────────────────

function initFilters() {
  const container = document.getElementById('filters');
  const types = [...new Set(allArtworks.map(a => a.type).filter(Boolean))].sort();

  container.querySelectorAll('.filter-btn[data-type]:not([data-type="all"])').forEach(btn => btn.remove());

  types.forEach(type => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.type = type;
    btn.textContent = type;
    if (type === activeFilter) btn.classList.add('active');
    container.appendChild(btn);
  });

  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.type;
      clearActiveArtist();
      updatePlayModePill();
      renderMarkers();
      renderQuestPanelBody();
      closePanel();
    };
  });
}

// ─── Community submissions ────────────────────────

function mapSubmissionToArtwork(row) {
  return {
    id: `sub-${row.id}`,
    title: row.title || 'Untitled Find',
    artist: row.artist || 'Unknown',
    type: row.type && row.type !== 'Not sure' ? row.type : 'Other',
    lat: row.lat,
    lng: row.lng,
    photo: row.photo_url || '',
    commissioned: false,
    address: 'Community find, Sheung Wan',
    hint: 'Spotted by a fellow hunter — exact clue coming soon. Look around the pinned location.',
    radius: 40
  };
}

async function loadApprovedSubmissions() {
  if (typeof db === 'undefined') return;

  const { data, error } = await db
    .from('submissions')
    .select('*')
    .eq('status', 'approved');

  if (error || !data || !data.length) return;

  const community = data
    .filter(row => row.lat != null && row.lng != null)
    .map(mapSubmissionToArtwork);

  if (!community.length) return;

  allArtworks = allArtworks.concat(community);
  initFilters();
  renderMarkers();
  updateNavScore();
}

// ─── User location ────────────────────────────────

function updateTrackingDistance(dist) {
  const el = document.getElementById('tracking-distance');
  if (!el) return;
  if (dist == null) {
    el.textContent = '';
    el.classList.add('hidden');
  } else {
    el.textContent = `📍 ${Math.round(dist)}m to next quest`;
    el.classList.remove('hidden');
  }
}

function updateTrackingLine(lat, lng) {
  const target = getNextQuest();
  if (!target) {
    if (trackingLine) { map.removeLayer(trackingLine); trackingLine = null; }
    updateTrackingDistance(null);
    return;
  }
  const latlngs = [[lat, lng], [target.lat, target.lng]];
  if (!trackingLine) {
    trackingLine = L.polyline(latlngs, {
      color: '#2ec4b6',
      weight: 3,
      opacity: 0.6,
      dashArray: '6 8',
      interactive: false
    }).addTo(map);
  } else {
    trackingLine.setLatLngs(latlngs);
  }
  updateTrackingDistance(getDistance(lat, lng, target.lat, target.lng));
}

function initLocation() {
  const btn = document.getElementById('locate-btn');
  if (!btn) return;

  if (!navigator.geolocation) {
    btn.style.display = 'none';
    return;
  }

  let watchId = null;

  btn.addEventListener('click', () => {
    if (userMarker) {
      map.flyTo(userMarker.getLatLng(), 17, { duration: 1 });
      return;
    }

    if (watchId !== null) return;

    btn.classList.add('locating');

    watchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;

        if (!userMarker) {
          userMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              html: '<div class="user-dot"></div>',
              className: '',
              iconSize: [18, 18],
              iconAnchor: [9, 9]
            }),
            zIndexOffset: 9999,
            interactive: false
          }).addTo(map);

          userCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#4285f4',
            fillColor: '#4285f4',
            fillOpacity: 0.1,
            weight: 1,
            interactive: false
          }).addTo(map);

          map.flyTo([lat, lng], 17, { duration: 1.5 });
          btn.classList.remove('locating');
          btn.classList.add('active');
        } else {
          userMarker.setLatLng([lat, lng]);
          userCircle.setLatLng([lat, lng]);
          userCircle.setRadius(accuracy);
        }

        updateTrackingLine(lat, lng);
      },
      () => {
        btn.classList.remove('locating');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
    );
  });
}

// ─── Mascot ───────────────────────────────────────

function mascotSay(title, text) {
  document.getElementById('mascot-actions').classList.add('hidden');
  document.getElementById('mascot-dismiss').classList.remove('hidden');
  document.getElementById('mascot-title').textContent = title;
  document.getElementById('mascot-text').textContent = text;
  document.getElementById('mascot').classList.remove('hidden');
}

function mascotFirstQuestHint() {
  mascotSay('Ready?', 'That highlighted dot is your first quest — get close and tap it to check in.');
}

function initMascot(startTour) {
  const mascot = document.getElementById('mascot');
  const dismissBtn = document.getElementById('mascot-dismiss');

  dismissBtn.addEventListener('click', () => {
    mascot.classList.add('hidden');
  });

  if (startTour) {
    document.getElementById('mascot-walkthrough').addEventListener('click', startTour);
    document.getElementById('mascot-skip').addEventListener('click', () => {
      localStorage.setItem(TOUR_KEY, '1');
      mascotFirstQuestHint();
    });
  } else {
    mascot.classList.add('hidden');
  }
}

// ─── Quest button first-open hint ─────────────────

const WELCOME_KEY = 'saq_welcomed';

function initWelcome() {
  const questBtn = document.getElementById('open-quests');
  if (!localStorage.getItem(WELCOME_KEY)) {
    questBtn.classList.add('pulsing');
  }
}

function handleQuestsClick() {
  document.getElementById('open-quests').classList.remove('pulsing');
  localStorage.setItem(WELCOME_KEY, '1');
  if (document.getElementById('quest-panel').classList.contains('open')) {
    closeQuestPanel();
  } else {
    openQuestPanel();
  }
}

// ─── Guided tour ──────────────────────────────────

const TOUR_KEY = 'saq_tour_seen';

const TOUR_STEPS = [
  { selector: '#map', title: 'The map', text: 'That glowing dot is your current quest — tap it for a hint and to check in.' },
  { selector: '#filters', title: 'Filter by type', text: 'Show just the kinds of art you\'ve found so far, and narrow your quest list.' },
  { selector: '#open-quests', title: 'Your quests', text: 'See your full checklist of artworks and track how many you’ve found.' },
  { selector: '.add-btn', title: 'Add art', text: 'Spotted a piece that’s not on the map yet? Submit it here.' },
  { selector: '#locate-btn', title: 'Find yourself', text: 'Tap to show your current location on the map.' }
];

function initTour() {
  if (localStorage.getItem(TOUR_KEY)) return null;

  const overlay = document.getElementById('tour-overlay');
  const highlight = document.getElementById('tour-highlight');
  const tooltip = document.getElementById('tour-tooltip');
  const titleEl = document.getElementById('tour-title');
  const textEl = document.getElementById('tour-text');
  const progressEl = document.getElementById('tour-progress');
  const nextBtn = document.getElementById('tour-next');
  const skipBtn = document.getElementById('tour-skip');
  const mascot = document.getElementById('mascot');

  let step = 0;

  function positionStep() {
    const config = TOUR_STEPS[step];
    const target = document.querySelector(config.selector);
    if (!target) { nextStep(); return; }

    const rect = target.getBoundingClientRect();
    const pad = 8;

    highlight.style.top = `${rect.top - pad}px`;
    highlight.style.left = `${rect.left - pad}px`;
    highlight.style.width = `${rect.width + pad * 2}px`;
    highlight.style.height = `${rect.height + pad * 2}px`;

    titleEl.textContent = config.title;
    textEl.textContent = config.text;
    progressEl.textContent = `${step + 1} / ${TOUR_STEPS.length}`;
    nextBtn.textContent = step === TOUR_STEPS.length - 1 ? 'Done' : 'Next →';

    const gap = 14;
    const tooltipRect = tooltip.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;

    tooltip.style.top = spaceBelow > tooltipRect.height + gap
      ? `${rect.bottom + gap}px`
      : `${Math.max(12, rect.top - tooltipRect.height - gap)}px`;

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    left = Math.min(Math.max(left, 12), window.innerWidth - tooltipRect.width - 12);
    tooltip.style.left = `${left}px`;
  }

  function nextStep() {
    step += 1;
    if (step >= TOUR_STEPS.length) {
      endTour();
    } else {
      positionStep();
    }
  }

  function endTour() {
    overlay.classList.add('hidden');
    localStorage.setItem(TOUR_KEY, '1');
    window.removeEventListener('resize', positionStep);
    mascotFirstQuestHint();
  }

  nextBtn.addEventListener('click', nextStep);
  skipBtn.addEventListener('click', endTour);
  window.addEventListener('resize', positionStep);

  return function startTour() {
    mascot.classList.add('hidden');
    overlay.classList.remove('hidden');
    positionStep();
  };
}

// ─── Init ─────────────────────────────────────────

allArtworks = ARTWORKS;
initFilters();
initHuntMode();
renderMarkers();
updateNavScore();
initLocation();
initPlayMode();
initRestart();
initPrecision();
initSearch();
initGalleryToggle();
const startTour = initTour();
initMascot(startTour);
initWelcome();
loadApprovedSubmissions();

document.getElementById('close-panel').addEventListener('click', closePanel);
document.getElementById('open-quests').addEventListener('click', handleQuestsClick);
document.getElementById('close-quest-panel').addEventListener('click', closeQuestPanel);
document.getElementById('close-quest-card').addEventListener('click', closeQuestCard);
document.getElementById('quest-backdrop').addEventListener('click', closeQuestCard);

map.on('click', () => {
  closePanel();
  closeQuestPanel();
});
