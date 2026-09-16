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
let activeTypes = []; // multi-select: [] = every type, otherwise an OR match
let activeQuest = null;
let miniMapInstance = null;
let checkinFailCount = 0;
let userMarker = null;
let userCircle = null;
let trackingLine = null;
let activeQuestId = null; // id of the currently glowing pin — re-render when it moves

// Sort is no longer a choice — always nearest-first once your location is
// known (falls back to natural order until then). Artist/type stay as
// independent filters (activeArtists / activeTypes) that combine with it.
let nearestOrigin = null;

const PRECISION_KEY = 'saq_precision';
let precision = localStorage.getItem(PRECISION_KEY) || 'exact';
let questPanelTab = 'quests';

const HUNT_MODE_KEY = 'saq_hunt_mode';
// 'explore' = browse every artwork freely on the map and in the list
// 'quest'   = one quest unlocked at a time; the rest stay locked until you check in
let huntMode = localStorage.getItem(HUNT_MODE_KEY) || 'explore';

const ARTIST_KEY = 'saq_artist';
// multi-select: [] = every artist, otherwise an OR match against this list
let activeArtists = (() => {
  try { return JSON.parse(localStorage.getItem(ARTIST_KEY)) || []; }
  catch { return []; }
})();

// The "current" quest is the closest un-found piece that matches any active
// artist/type filter (a no-op filter in Quest mode — always cleared on entry)
// — falling back to any un-found piece if the filter matches nothing, and to
// natural order if location isn't known yet. The glowing pin is always
// somewhere you can actually walk to.
function getActiveQuest() {
  const unfound = allArtworks.filter(a => !isCompleted(a.id));
  const pool = unfound.filter(passesExploreFilters);
  return sortByDistance(pool.length ? pool : unfound)[0] || null;
}

function isQuestVisible(art) {
  if (huntMode !== 'quest') return true;
  return isCompleted(art.id) || art.id === getActiveQuest()?.id;
}

// Type + artist filters only narrow the browsing view (explore mode).
// Quest mode ignores them — isQuestVisible already shows just the live quest.
function passesExploreFilters(art) {
  if (huntMode === 'quest') return true;
  if (activeTypes.length && !activeTypes.includes(art.type)) return false;
  if (activeArtists.length && !activeArtists.includes(art.artist)) return false;
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

// ─── Type colours ─────────────────────────────────
// The core types have hand-picked colours (kept in sync with the CSS custom
// properties). Community submissions can carry any free-text type; every
// unknown type gets its own colour from an on-brand palette, assigned in the
// order the type is first seen. Submissions load oldest-first (query is
// ordered by id), so a type keeps its colour for good once it appears —
// approving a newer type only ever adds a colour at the end.

const TYPE_COLORS = {
  'Mural':        '#ff6b9d', // --pink
  'Sculpture':    '#7c4dff', // --purple
  'Paste-up':     '#ff9f43', // --orange
  'Sticker':      '#2ecc71', // --green
  'Installation': '#3498db', // --blue
};

// friendly-flat family matching the five cores above, spread around the wheel
const TYPE_PALETTE = [
  '#2ec4b6', // teal (brand accent)
  '#ffd166', // warm yellow
  '#ef476f', // raspberry
  '#06d6a0', // mint
  '#9b5de5', // violet
  '#f78c6b', // coral
  '#4d96ff', // cornflower
  '#c77dff', // orchid
  '#43aa8b', // jade
  '#f9844a', // tangerine
  '#b5179e', // magenta
  '#90be6d', // sage
  '#577590', // slate blue
  '#f94144', // red
  '#4361ee', // indigo
  '#ff8fab', // flamingo
];

let _typeColorMap = null;

function buildTypeColorMap() {
  _typeColorMap = {};
  let i = 0;
  for (const art of allArtworks) {
    const t = (art.type || 'Other').trim();
    if (!t || TYPE_COLORS[t] || t in _typeColorMap) continue;
    // once past the curated palette, fall back to evenly-spaced hues (still unique)
    _typeColorMap[t] = TYPE_PALETTE[i] ||
      `hsl(${Math.round((i * 137.508) % 360)}, 62%, 55%)`;
    i++;
  }
}

function typeColor(type) {
  const key = (type || 'Other').trim();
  if (TYPE_COLORS[key]) return TYPE_COLORS[key];
  if (!_typeColorMap || !(key in _typeColorMap)) buildTypeColorMap();
  return _typeColorMap[key] || TYPE_PALETTE[0];
}

// ─── Markers ──────────────────────────────────────

// Google Maps' "approximate location" halo: no border, no dashes — just a
// soft radial falloff, faked with a few borderless concentric circles since
// Leaflet has no native radial-gradient fill. Returns the layers so callers
// can track them for cleanup.
function drawApproxZone(mapInstance, latlng, radius, color) {
  const circle = L.circle(latlng, {
    radius,
    color,
    weight: 2,
    opacity: 0.6,
    fillColor: color,
    fillOpacity: 0.18,
    interactive: false
  });
  circle.addTo(mapInstance);
  return [circle];
}

function makeMarker(art, isActive) {
  const el = document.createElement('div');
  el.className = `art-marker ${art.type}${isCompleted(art.id) ? ' found' : ''}${isActive ? ' active' : ''}`;
  el.style.background = typeColor(art.type);

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

  const activeQuest = getActiveQuest();
  activeQuestId = activeQuest?.id ?? null;

  allArtworks.forEach(art => {
    if (!passesExploreFilters(art)) return;
    if (!isQuestVisible(art)) return;
    const isActive = !!activeQuest && art.id === activeQuest.id;

    // Approx mode should look different on the map itself, not just once you
    // tap in — the active quest gets a wide "zone" halo instead of pretending
    // the small dot isn't still sitting exactly on the true spot.
    if (isActive && precision === 'approx' && !isCompleted(art.id)) {
      const zoneRadius = Math.max(200, (art.radius || 50) * 4);
      markers.push(...drawApproxZone(map, [art.lat, art.lng], zoneRadius, '#9b5de5'));
    }

    const m = makeMarker(art, isActive);
    m.addTo(map);
    markers.push(m);
  });

  const filtered = allArtworks.filter(passesExploreFilters);
  const foundCount = filtered.filter(a => isCompleted(a.id)).length;
  const artistLabel = artistFilterLabel();
  const typeLabel = typeFilterLabel();
  const label = artistLabel
    ? `by ${artistLabel} found`
    : typeLabel ? `${typeLabel} quests found` : 'found';
  document.getElementById('count').innerHTML =
    `<strong>${foundCount}</strong> of ${filtered.length} ${label} · Sheung Wan, HK`;
}

// ─── Artwork panel ────────────────────────────────

function closePanel() {
  document.getElementById('panel').classList.remove('open');
}

// ─── Quest panel ──────────────────────────────────

// opening the list is the "ready to hunt" moment — a natural place to ask for
// location once, so nearest-first sorting can kick in without a manual step
let locationRequested = false;
function maybeRequestLocation() {
  if (locationRequested || nearestOrigin || !navigator.geolocation) return;
  locationRequested = true;
  resolveNearestOrigin(refreshQuestUI);
}

function openQuestPanel() {
  closePanel();
  maybeRequestLocation();
  renderQuestPanelBody();
  document.getElementById('quest-panel').classList.add('open');
}

function closeQuestPanel() {
  document.getElementById('quest-panel').classList.remove('open');
}

// names when there are few enough to read at a glance, a count once it'd wrap
function artistFilterLabel() {
  if (!activeArtists.length) return null;
  return activeArtists.length <= 2 ? activeArtists.join(' & ') : `${activeArtists.length} artists`;
}

function typeFilterLabel() {
  if (!activeTypes.length) return null;
  return activeTypes.length <= 2 ? activeTypes.join(' & ') : `${activeTypes.length} types`;
}

// artist/type are plain filters now (not sort modes), so there's at most one
// combined label for the whole list — never a per-item group to sort by
function groupLabelFor() {
  const parts = [];
  const artistLabel = artistFilterLabel();
  if (artistLabel) parts.push(artistLabel);
  const typeLabel = typeFilterLabel();
  if (typeLabel) parts.push(typeLabel);
  return parts.length ? parts.join(' · ') : null;
}

// Nearest-first once we know where you are; natural (data.js) order otherwise.
function sortByDistance(list) {
  if (!nearestOrigin) return list;
  return [...list].sort((a, b) =>
    getDistance(nearestOrigin.lat, nearestOrigin.lng, a.lat, a.lng) -
    getDistance(nearestOrigin.lat, nearestOrigin.lng, b.lat, b.lng)
  );
}

function renderQuestList() {
  const completed = getCompleted();
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  const ordered = sortByDistance(allArtworks);

  const visible = ordered
    .filter(isQuestVisible)
    .filter(passesExploreFilters);

  const groupLabel = groupLabelFor();
  renderFilterSummary(document.getElementById('quest-list-summary'), { withClear: true, funMode: true });

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quest-no-results';
    empty.textContent = groupLabel ? `No quests match: ${groupLabel}` : 'No quests found';
    list.appendChild(empty);
  }

  visible.forEach(art => {
    const num = allArtworks.indexOf(art) + 1;
    const done = completed.includes(art.id);
    // quest mode keeps the piece a mystery until check-in — show only its type.
    // everywhere else, lead with the name so a narrowed-down list reads right.
    const reveal = huntMode !== 'quest' || done;
    const area = art.address.split(',')[0];
    // drop details the header above already shows
    // only redundant when exactly one type is picked — with several picked,
    // each row's actual type still varies and is worth showing
    const typeIsRedundant = activeTypes.length === 1;
    // only redundant when exactly one artist is picked — with several picked,
    // each row's actual artist still varies and is worth showing
    const artistIsRedundant = activeArtists.length === 1;
    const hasArtist = art.artist && art.artist !== 'Unknown';
    const primary = reveal ? art.title : art.type;
    const secondary = reveal
      ? [
          hasArtist && !artistIsRedundant ? `by ${art.artist}` : null,
          !typeIsRedundant ? art.type : null,
          area,
        ].filter(Boolean).join(' · ')
      : area;
    const item = document.createElement('div');
    item.className = `quest-item${done ? ' completed' : ''}`;
    item.innerHTML = `
      <div class="quest-item-num">${done ? '✓' : num}</div>
      <div class="quest-item-info">
        <div class="quest-item-type${reveal ? ' is-title' : ''}">${primary}</div>
        <div class="quest-item-area">${secondary}</div>
      </div>
      ${done
        ? '<div class="quest-item-done-label">Found</div>'
        : '<div class="quest-item-arrow">→</div>'
      }
    `;
    item.addEventListener('click', () => openQuestCard(art));
    list.appendChild(item);
  });

  if (huntMode === 'quest') {
    const remaining =
      allArtworks.filter(a => !isCompleted(a.id)).length - (getActiveQuest() ? 1 : 0);
    if (remaining > 0) {
      const locked = document.createElement('div');
      locked.className = 'quest-locked-footer';
      locked.textContent = `🔒 ${remaining} more quest${remaining > 1 ? 's' : ''} locked. Check in here to unlock the next`;
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
    empty.textContent = 'Nothing found yet. Go hunt!';
    list.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';
  found.forEach(art => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <div class="gallery-card-thumb ${art.type}" style="background:${typeColor(art.type)}">${art.photo ? `<img src="${art.photo}" alt="${art.title}">` : '✓'}</div>
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
}

function renderQuestPanelBody() {
  document.getElementById('play-mode-pill').classList.toggle('hidden', questPanelTab === 'gallery');

  if (questPanelTab === 'gallery') {
    renderGallery();
  } else {
    renderQuestList();
  }
  updateQuestScore();
}

// checklist icon (quest list) / image icon (gallery) — same line-icon style
// as the rest of the UI, swapped in as the panel's two tabs toggle
const GALLERY_TOGGLE_ICONS = {
  quests: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/>
    <path d="M4 6l1 1 2-2"/><path d="M4 12l1 1 2-2"/><path d="M4 18l1 1 2-2"/>
  </svg>`,
  gallery: `<svg class="icon-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
  </svg>`
};

function initGalleryToggle() {
  const btn = document.getElementById('gallery-toggle');
  const title = document.querySelector('.quest-panel-title');
  btn.addEventListener('click', () => {
    questPanelTab = questPanelTab === 'gallery' ? 'quests' : 'gallery';
    if (questPanelTab === 'gallery') {
      btn.innerHTML = GALLERY_TOGGLE_ICONS.quests;
      btn.title = 'Back to quests';
      title.textContent = 'GALLERY';
    } else {
      btn.innerHTML = GALLERY_TOGGLE_ICONS.gallery;
      btn.title = 'View gallery';
      title.textContent = 'QUESTS';
    }
    renderQuestPanelBody();
  });
}

// ─── Play mode ────────────────────────────────────

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

// sort is automatic now, so the pill's only job is the artist/type filter —
// same combined label as the quest list's own header (groupLabelFor)
// static label — it used to show the active filter, but that's confusing
// when it silently changes text/icon depending on what you picked. The
// quest list's own header already shows the active filter (with a ✕ to
// clear it), so the pill's only job is "tap here to change settings."
function updatePlayModePill() {
  const pill = document.getElementById('play-mode-pill');
  if (!pill) return;
  pill.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3.2"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
  Change play mode ⌄`;
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
  syncNarrowControls();
  document.getElementById('play-mode-backdrop').classList.remove('hidden');
}

// the sheet stays open while you tune every option — this is the only thing that closes it
function closePlayModeBackdrop() {
  closeArtistPicker();
  closeTypePicker();
  document.getElementById('play-mode-backdrop').classList.add('hidden');
}

// keep the "Artist" / "Type" narrow-down rows in the settings sheet, and the
// pill above the quest list, showing the current pick (or "All …"/unfiltered)
function syncNarrowControls() {
  const artistBtn = document.getElementById('artist-filter-btn');
  if (artistBtn) {
    document.getElementById('artist-filter-value').textContent = artistFilterLabel() || 'All artists';
    artistBtn.classList.toggle('active', activeArtists.length > 0);
  }
  const typeBtn = document.getElementById('type-filter-btn');
  if (typeBtn) {
    document.getElementById('type-filter-value').textContent = typeFilterLabel() || 'All types';
    typeBtn.classList.toggle('active', activeTypes.length > 0);
  }
  updateFilterSummary();
  updatePlayModePill();
}

// one-line recap of the combined filter state — "Showing Mural · by Xeva —
// 2 pieces" — hidden entirely when nothing's picked. Built with textContent,
// not innerHTML, so an "&" in a name can't be misread as an HTML entity.
// shared by the settings sheet and the quest list — same "Artist: X (n),
// Y (n)" / "Type: A (n)" recap, optionally with a one-tap clear-all button
// (the quest list has one so you don't have to reopen the sheet just to
// reset; the sheet doesn't need one since "All artists"/"All types" already
// does that from inside each picker)
function renderFilterSummary(container, { withClear = false, funMode = false } = {}) {
  if (!container) return;
  // in fun mode (the quest list) the header chip bar already shows the active
  // type, so repeating it here would be redundant — only artists get a line
  const hasContent = activeArtists.length > 0 || (!funMode && activeTypes.length > 0);
  if (!hasContent) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '';
  const lines = document.createElement('div');
  lines.className = 'filter-summary-lines';
  if (funMode) {
    if (activeArtists.length) lines.appendChild(summaryLineFun('🔍 Tracking', activeArtists, tallyArtistsInContext(activeArtists)));
  } else {
    if (activeArtists.length) lines.appendChild(summaryLine('Artist', activeArtists, tallyArtistsInContext(activeArtists)));
    if (activeTypes.length) lines.appendChild(summaryLine('Type', activeTypes, tallyTypesInContext(activeTypes)));
  }
  container.appendChild(lines);

  if (withClear) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'filter-summary-clear';
    clearBtn.title = 'Clear filters';
    clearBtn.setAttribute('aria-label', 'Clear filters');
    clearBtn.textContent = '✕';
    clearBtn.addEventListener('click', () => {
      clearActiveArtist();
      clearActiveType();
      syncFilterBar();
      syncNarrowControls();
      refreshQuestUI();
    });
    container.appendChild(clearBtn);
  }

  container.classList.remove('hidden');
}

function updateFilterSummary() {
  renderFilterSummary(document.getElementById('filter-summary'));
}

// one line of the filter summary: "Artist: Xeva (2), Alex Croft (1)" — each
// selected name with its own piece count, built with textContent/createTextNode
// (not innerHTML) so a name with "&" can't be misread as an HTML entity
function summaryLine(label, names, counts) {
  const line = document.createElement('div');
  line.appendChild(document.createTextNode(`${label}: `));
  names.forEach((name, i) => {
    if (i > 0) line.appendChild(document.createTextNode(', '));
    line.appendChild(document.createTextNode(`${name} `));
    const strong = document.createElement('strong');
    strong.textContent = `(${counts[name] || 0})`;
    line.appendChild(strong);
  });
  return line;
}

// quest-list variant of summaryLine: each name gets a trailing count badge
// (pill) instead of "(n)" text, for a punchier, less form-like look
function summaryLineFun(label, names, counts) {
  const line = document.createElement('div');
  line.appendChild(document.createTextNode(`${label}: `));
  names.forEach((name, i) => {
    if (i > 0) line.appendChild(document.createTextNode(', '));
    const chip = document.createElement('span');
    chip.className = 'summary-name-chip';
    chip.appendChild(document.createTextNode(name));
    const badge = document.createElement('span');
    badge.className = 'summary-count-badge';
    badge.textContent = counts[name] || 0;
    chip.appendChild(badge);
    line.appendChild(chip);
  });
  return line;
}

function resetProgress() {
  localStorage.removeItem(COMPLETED_KEY);
  localStorage.removeItem(UNVERIFIED_KEY);
  closeQuestCard();
  document.getElementById('play-mode-backdrop').classList.add('hidden');
  renderMarkers();
  renderQuestPanelBody();
}

function initPlayMode() {
  document.getElementById('artist-filter-btn').addEventListener('click', toggleArtistPicker);
  document.getElementById('type-filter-btn').addEventListener('click', toggleTypePicker);
  // also opens the list — a no-op if it's already open (e.g. tweaking settings mid-hunt)
  document.getElementById('play-mode-done').addEventListener('click', () => {
    closePlayModeBackdrop();
    openQuestPanel();
  });
  document.getElementById('play-mode-pill').addEventListener('click', openPlayModeBackdrop);
  // re-explain the current mode, then land back on this same sheet
  document.getElementById('play-mode-back').addEventListener('click', () => {
    closePlayModeBackdrop();
    showHowToPlay(huntMode);
  });
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
  activeArtists = [];
  localStorage.removeItem(ARTIST_KEY);
}

function clearActiveType() {
  activeTypes = [];
  syncFilterBar();
}

// keep the header type-filter bar's highlight in step with activeTypes —
// multi-select, so several chips (plus "All" when none are picked) can be active
function syncFilterBar() {
  document.querySelectorAll('#filters .filter-btn').forEach(b => {
    const isActive = b.dataset.type === 'all'
      ? activeTypes.length === 0
      : activeTypes.includes(b.dataset.type);
    b.classList.toggle('active', isActive);
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

// how many artworks fall under each value of a given field, across ALL
// pieces — used by the pickers, where every row should show its true total
// regardless of what's currently selected elsewhere
function tallyBy(field) {
  const counts = {};
  allArtworks.forEach(a => { if (a[field]) counts[a[field]] = (counts[a[field]] || 0) + 1; });
  return counts;
}

// how many artworks match a selected artist/type NARROWED by whatever is
// selected in the other category — e.g. picking Xeva + Mural should say how
// many of Xeva's pieces are murals (possibly 0), not her total piece count,
// so the summary tells you how much there is left to actually go find
function tallyArtistsInContext(names) {
  const counts = {};
  names.forEach(name => {
    counts[name] = allArtworks.filter(a =>
      a.artist === name && (!activeTypes.length || activeTypes.includes(a.type))
    ).length;
  });
  return counts;
}

function tallyTypesInContext(types) {
  const counts = {};
  types.forEach(type => {
    counts[type] = allArtworks.filter(a =>
      a.type === type && (!activeArtists.length || activeArtists.includes(a.artist))
    ).length;
  });
  return counts;
}

function buildArtistPicker() {
  const listEl = document.getElementById('artist-picker-list');
  const search = document.getElementById('artist-picker-search');
  const q = (search.value || '').trim().toLowerCase();

  const counts = tallyBy('artist');
  const artists = Object.keys(counts).sort((a, b) => a.localeCompare(b));

  listEl.innerHTML = '';
  if (!q) addPickerItem(listEl, 'All artists', allArtworks.length, activeArtists.length === 0, selectAllArtists);
  artists
    .filter(name => !q || name.toLowerCase().includes(q))
    .forEach(name => addPickerItem(listEl, name, counts[name], activeArtists.includes(name), () => toggleArtist(name)));

  if (!listEl.children.length) {
    const empty = document.createElement('div');
    empty.className = 'opt-picker-empty';
    empty.textContent = 'No artist matches';
    listEl.appendChild(empty);
  }
}

// shared by the artist and type pickers — a name/label on the left, how many
// pieces it covers on the right. Built with textContent (not innerHTML) so
// names with "&" or other characters (e.g. "Carol Mui & Rebecca T Lin") can't
// break the markup.
function addPickerItem(listEl, label, count, isActive, onClick) {
  const b = document.createElement('button');
  b.className = 'opt-picker-item' + (isActive ? ' active' : '');
  const nameEl = document.createElement('span');
  nameEl.textContent = label;
  const countEl = document.createElement('span');
  countEl.className = 'opt-picker-count';
  countEl.textContent = count;
  b.appendChild(nameEl);
  b.appendChild(countEl);
  b.addEventListener('click', onClick);
  listEl.appendChild(b);
}

// multi-select: tapping a name adds/removes it, so the picker stays open
// (only the outside-tap handler closes it) instead of closing on the first
// pick the way the old single-select version did
function toggleArtist(name) {
  const i = activeArtists.indexOf(name);
  if (i === -1) activeArtists.push(name); else activeArtists.splice(i, 1);
  localStorage.setItem(ARTIST_KEY, JSON.stringify(activeArtists));
  buildArtistPicker();
  syncNarrowControls();
  refreshQuestUI();
}

function selectAllArtists() {
  clearActiveArtist();
  buildArtistPicker();
  syncNarrowControls();
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

  const counts = tallyBy('type');
  const types = Object.keys(counts).sort();

  listEl.innerHTML = '';
  addPickerItem(listEl, 'All types', allArtworks.length, activeTypes.length === 0, () => selectType('all'));
  types.forEach(t => addPickerItem(listEl, t, counts[t], activeTypes.includes(t), () => selectType(t)));
}

// multi-select, same as artist: 'all' clears the selection, anything else
// toggles in/out. Also the header filter bar's click handler, so it and the
// sheet's picker share one "the type filter changed" code path. Doesn't
// auto-close the picker — same reasoning as toggleArtist.
function selectType(type) {
  if (!type || type === 'all') {
    activeTypes = [];
  } else {
    const i = activeTypes.indexOf(type);
    if (i === -1) activeTypes.push(type); else activeTypes.splice(i, 1);
  }
  syncFilterBar();
  buildTypePicker();
  syncNarrowControls();
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
    syncNarrowControls();
  }

  document.querySelectorAll('.mode-option, .quest-nav-btn[data-mode-choice]').forEach(b => {
    b.classList.toggle('active', b.dataset.modeChoice === huntMode);
  });
}

function setHuntMode(mode) {
  huntMode = mode;
  localStorage.setItem(HUNT_MODE_KEY, mode);
  closeArtistPicker();
  closeTypePicker();
  applyHuntMode();
  syncNarrowControls();
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

  // Approx mode still shows a map — just zoomed out, with a much wider,
  // dashed "zone" circle instead of the tight check-in radius, so there's
  // an actual visible difference from Exact instead of a bare text placeholder.
  const isApprox = precision === 'approx';
  const showMiniMap = !done && !art.photo;

  const photoHTML = art.photo
    ? `<div class="quest-photo"><img src="${art.photo}" alt="Quest" /></div>`
    : done
      ? `<div class="quest-photo-placeholder">✓</div>`
      : `<div id="quest-mini-map" class="quest-mini-map"></div>`;

  const nextQuest = done ? getNextQuest() : null;

  content.innerHTML = `
    <div class="quest-card-header">
      <span class="quest-card-type ${art.type}" style="background:${typeColor(art.type)}">${art.type}</span>
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
      : `<button id="checkin-btn" class="checkin-btn">📍 Check In Here</button>
         <div id="gps-status" class="gps-status"></div>
         <button id="no-gps-btn" class="manual-checkin-btn">No GPS? Check in another way</button>
         <div id="manual-checkin-panel" class="manual-checkin-panel hidden">
           <div class="manual-checkin-label">Paste your coordinates from Google Maps</div>
           <div class="coords-row">
             <input id="coords-input" class="coords-input" type="text" placeholder="e.g. 22.2866, 114.1503" />
             <button id="coords-confirm-btn" class="coords-confirm-btn">Check</button>
           </div>
           <div id="coords-status" class="coords-status"></div>
           <button id="skip-verify-btn" class="manual-checkin-btn">Check in without a location</button>
         </div>`
    }
  `;

  document.getElementById('quest-card').classList.remove('hidden');
  document.getElementById('quest-backdrop').classList.remove('hidden');

  if (showMiniMap) {
    const zoneRadius = isApprox ? Math.max(200, (art.radius || 50) * 4) : (art.radius || 50);
    miniMapInstance = L.map('quest-mini-map', {
      center: [art.lat, art.lng],
      zoom: isApprox ? 15 : 17,
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
    if (isApprox) {
      drawApproxZone(miniMapInstance, [art.lat, art.lng], zoneRadius, '#9b5de5');
    } else {
      L.circle([art.lat, art.lng], {
        radius: zoneRadius,
        color: '#2ec4b6',
        fillColor: '#2ec4b6',
        fillOpacity: 0.18,
        weight: 2.5
      }).addTo(miniMapInstance);
    }
  }

  if (!done) {
    document.getElementById('checkin-btn').addEventListener('click', attemptCheckin);
    document.getElementById('no-gps-btn').addEventListener('click', () => {
      document.getElementById('manual-checkin-panel').classList.toggle('hidden');
    });
    document.getElementById('coords-confirm-btn').addEventListener('click', attemptCoordsCheckin);
    document.getElementById('skip-verify-btn').addEventListener('click', () => manualCheckin(activeQuest));
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
    mascotSay('🏆 Hunt complete!', `You found all ${allArtworks.length} pieces. Incredible work!`);
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
      <span class="quest-card-type ${art.type}" style="background:${typeColor(art.type)}">${art.type}</span>
    </div>
    ${photoHTML}
    <div class="quest-confirm-body">
      <div class="quest-confirm-title">${art.title}</div>
      <div class="quest-confirm-artist">by ${art.artist}</div>
      <div class="quest-confirm-hint">${art.hint}</div>
      <div class="quest-confirm-question">Does this match what you found?</div>
    </div>
    <button id="confirm-yes-btn" class="checkin-btn">✅ Yes, this is it!</button>
    <button id="confirm-no-btn" class="confirm-no-btn">Not this one, keep looking</button>
  `;

  document.getElementById('confirm-yes-btn').addEventListener('click', () => completeQuest(art, { unverified }));
  document.getElementById('confirm-no-btn').addEventListener('click', () => openQuestCard(art));
}

// just explains why GPS didn't work — the always-visible "No GPS? Check in
// manually" link (below the status area) is the single call-to-action now,
// so this no longer injects its own duplicate button
function offerManualCheckin(status, message) {
  if (!status) return;
  status.textContent = message;
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
        btn.textContent = "📍 Check In Here";
        if (status) status.textContent = `You're about ${Math.round(dist)}m away. Get closer!`;
        maybeShowExtraHint();
      }
    },
    () => {
      btn.disabled = false;
      btn.textContent = "📍 Check In Here";
      offerManualCheckin(status, 'Could not get your location.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// pulls the first "lat, lng" decimal pair out of pasted text — matches a bare
// "22.2866, 114.1503" (what Google Maps' "Copy coordinates" gives you) as
// well as one embedded in a share URL like ".../@22.2866,114.1503,17z"
function parseCoords(text) {
  const match = (text || '').match(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// same proximity check as GPS check-in, just fed coordinates the user pasted
// in instead of ones read from the device — so this still counts as verified
function attemptCoordsCheckin() {
  const input = document.getElementById('coords-input');
  const status = document.getElementById('coords-status');
  const coords = parseCoords(input.value);

  if (!coords) {
    status.textContent = "Couldn't read that. Paste coordinates like 22.2866, 114.1503.";
    return;
  }

  const dist = getDistance(coords.lat, coords.lng, activeQuest.lat, activeQuest.lng);
  const radius = activeQuest.radius || 50;

  if (dist <= radius) {
    checkinFailCount = 0;
    showCheckinConfirm(activeQuest);
  } else {
    checkinFailCount++;
    status.textContent = `That's about ${Math.round(dist)}m away. Get closer, or check in without a location below.`;
    maybeShowExtraHint();
  }
}

// ─── Filters ──────────────────────────────────────

function initFilters() {
  buildTypeColorMap(); // refresh now that allArtworks may have grown
  const container = document.getElementById('filters');
  const types = [...new Set(allArtworks.map(a => a.type).filter(Boolean))].sort();

  container.querySelectorAll('.filter-btn[data-type]:not([data-type="all"])').forEach(btn => btn.remove());

  types.forEach(type => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.type = type;
    btn.textContent = type;
    btn.style.background = typeColor(type);
    if (activeTypes.includes(type)) btn.classList.add('active');
    container.appendChild(btn);
  });
  syncFilterBar(); // also corrects the static "All" chip's active state

  // same code path as the settings-sheet type picker — one place owns
  // "the type filter changed", so the header bar, the sheet, and the quest
  // list's clear-filter button all stay in sync
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = () => {
      selectType(btn.dataset.type);
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
    hint: 'Spotted by a fellow hunter. Exact clue coming soon. Look around the pinned location.',
    radius: 40
  };
}

async function loadApprovedSubmissions() {
  if (typeof db === 'undefined') return;

  const { data, error } = await db
    .from('submissions')
    .select('*')
    .eq('status', 'approved')
    .order('id', { ascending: true }); // oldest-first keeps type→colour assignment stable

  if (error || !data || !data.length) return;

  const community = data
    .filter(row => row.lat != null && row.lng != null)
    .map(mapSubmissionToArtwork);

  if (!community.length) return;

  allArtworks = allArtworks.concat(community);
  initFilters();
  buildArtistPicker(); // keep the sheet's counts/names current if it loaded before this resolved
  buildTypePicker();
  renderMarkers();
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

        // keep the "nearest" origin current so the glowing pin follows you;
        // only repaint the markers when the closest un-found piece actually changes
        nearestOrigin = { lat, lng };
        if (getActiveQuest()?.id !== activeQuestId) renderMarkers();

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
  mascotSay('Ready?', 'Tap 📍 to see how far you are, then head to the glowing dot to check in.');
}

function initMascot(startTour) {
  const mascot = document.getElementById('mascot');
  const dismissBtn = document.getElementById('mascot-dismiss');

  dismissBtn.addEventListener('click', () => {
    mascot.classList.add('hidden');
  });

  if (startTour) {
    document.getElementById('mascot-walkthrough').addEventListener('click', () => {
      clearWelcomePulse();
      startTour();
    });
    document.getElementById('mascot-skip').addEventListener('click', () => {
      clearWelcomePulse();
      localStorage.setItem(TOUR_KEY, '1');
      mascotFirstQuestHint();
    });
  } else {
    mascot.classList.add('hidden');
  }
}

// ─── Quest nav buttons (Explore / Quest) ───────────

const WELCOME_KEY = 'saq_welcomed';

function initWelcome() {
  if (!localStorage.getItem(WELCOME_KEY)) {
    document.getElementById('nav-explore').classList.add('pulsing');
    document.getElementById('nav-quest').classList.add('pulsing');
  }
}

// stops the pulse the moment the user is pointed elsewhere (tour start/skip)
// or opens the list directly — never leave two contradictory CTAs on screen
function clearWelcomePulse() {
  document.getElementById('nav-explore').classList.remove('pulsing');
  document.getElementById('nav-quest').classList.remove('pulsing');
  localStorage.setItem(WELCOME_KEY, '1');
}

// a returning player who left off in quest mode lands on a near-empty map
// (one pin, no filter bar) — remind them which mode they're in and offer a way
// out. Shown on every load/return while quest mode is active.
function initQuestWelcome() {
  const backdrop = document.getElementById('quest-welcome-backdrop');
  const close = () => backdrop.classList.add('hidden');

  document.getElementById('quest-welcome-resume').addEventListener('click', () => {
    close();
    openQuestPanel();
  });
  document.getElementById('quest-welcome-explore').addEventListener('click', () => {
    close();
    setHuntMode('explore');
  });
  backdrop.addEventListener('click', e => {
    if (e.target === e.currentTarget) close();
  });

  const isReturning = localStorage.getItem(WELCOME_KEY);
  if (huntMode !== 'quest' || !isReturning) return;

  const found = getCompleted().length;
  document.getElementById('quest-welcome-text').textContent = found > 0
    ? `You're mid-hunt: ${found} of ${allArtworks.length} found`
    : `Only one pin shows on the map at a time`;
  backdrop.classList.remove('hidden');
}

// each nav button explains just its own mode — no combined chooser.
// Continuing sets that mode, then hands off to the existing sort/challenge
// settings sheet before the list opens.
const HOWTO_TEXT = {
  quest: {
    label: 'Quest mode',
    text: 'Only one pin shows on the map at a time. Walk to it and check in. It reveals what it is, then your next quest appears.'
  },
  explore: {
    label: 'Explore mode',
    text: 'All 21 pins show on the map right away. Tap any one, in any order, and check in whenever you get there.'
  }
};
let pendingHuntMode = null;

// returning players (they've already found something) get asked whether to
// pick up where they left off instead of walking back through onboarding
function handleQuestNavClick(mode) {
  clearWelcomePulse();
  if (getCompleted().length > 0) {
    showResumeChoice(mode);
  } else {
    showHowToPlay(mode);
  }
}

function initQuestNav() {
  document.getElementById('nav-explore').addEventListener('click', () => handleQuestNavClick('explore'));
  document.getElementById('nav-quest').addEventListener('click', () => handleQuestNavClick('quest'));
}

function showResumeChoice(mode) {
  pendingHuntMode = mode;
  const found = getCompleted().length;
  document.getElementById('resume-progress-text').textContent =
    `You've found ${found} of ${allArtworks.length} so far`;
  document.getElementById('resume-restart-btn').classList.remove('hidden');
  document.getElementById('resume-restart-confirm').classList.add('hidden');
  document.getElementById('resume-backdrop').classList.remove('hidden');
}

function hideResumeChoice() {
  document.getElementById('resume-backdrop').classList.add('hidden');
}

function initResumeChoice() {
  document.getElementById('resume-continue').addEventListener('click', () => {
    hideResumeChoice();
    setHuntMode(pendingHuntMode);
    openQuestPanel();
  });
  document.getElementById('resume-restart-btn').addEventListener('click', () => {
    document.getElementById('resume-restart-btn').classList.add('hidden');
    document.getElementById('resume-restart-confirm').classList.remove('hidden');
  });
  document.getElementById('resume-restart-cancel').addEventListener('click', () => {
    document.getElementById('resume-restart-confirm').classList.add('hidden');
    document.getElementById('resume-restart-btn').classList.remove('hidden');
  });
  document.getElementById('resume-restart-yes').addEventListener('click', () => {
    resetProgress();
    hideResumeChoice();
    showHowToPlay(pendingHuntMode);
  });
  document.getElementById('resume-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideResumeChoice();
  });
}

function showHowToPlay(mode) {
  pendingHuntMode = mode;
  document.getElementById('howto-mode-label').textContent = HOWTO_TEXT[mode].label;
  document.getElementById('howto-mode-text').textContent = HOWTO_TEXT[mode].text;
  document.getElementById('howto-backdrop').classList.remove('hidden');
}

function hideHowToPlay() {
  document.getElementById('howto-backdrop').classList.add('hidden');
}

function initHowToPlay() {
  document.getElementById('howto-continue').addEventListener('click', () => {
    hideHowToPlay();
    setHuntMode(pendingHuntMode);
    openPlayModeBackdrop();
  });
  document.getElementById('howto-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) hideHowToPlay();
  });
}

// ─── Guided tour ──────────────────────────────────

const TOUR_KEY = 'saq_tour_seen';

// Core loop first (map → locate → quest list), secondary tools last (filters, add art)
const TOUR_STEPS = [
  { selector: '#map', title: 'The map', text: 'That glowing dot is your current quest. Tap it for a hint and to check in.' },
  { selector: '#locate-btn', title: 'Find yourself', text: 'Tap to show your position and see live distance to your next quest.' },
  { selector: '.quest-mode-nav', title: 'Explore or Quest', text: 'Explore browses all 21 freely; Quest guides you one at a time. Tap either to see your list.' },
  { selector: '#filters', title: 'Filter by type', text: 'Show just the kinds of art you\'ve found so far, and narrow your quest list.' },
  { selector: '.add-btn', title: 'Add art', text: 'Spotted a piece that’s not on the map yet? Submit it here.' }
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
initQuestNav();
initHowToPlay();
initResumeChoice();
renderMarkers();
initLocation();
initPlayMode();
initRestart();
initPrecision();
initGalleryToggle();
const startTour = initTour();
initMascot(startTour);
initWelcome();
initQuestWelcome();
loadApprovedSubmissions();

document.getElementById('close-panel').addEventListener('click', closePanel);
document.getElementById('close-quest-panel').addEventListener('click', closeQuestPanel);
document.getElementById('close-quest-card').addEventListener('click', closeQuestCard);
document.getElementById('quest-backdrop').addEventListener('click', closeQuestCard);

map.on('click', () => {
  closePanel();
  closeQuestPanel();
});
