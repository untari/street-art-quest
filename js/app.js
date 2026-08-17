const COMPLETED_KEY = 'saq_completed';

const map = L.map('map', {
  center: [22.2852, 114.1503],
  zoom: 15,
  zoomControl: true
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

let allArtworks = [];
let markers = [];
let activeFilter = 'all';
let activeQuest = null;
let miniMapInstance = null;
let userMarker = null;
let userCircle = null;

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
const TYPE_COLORS = {
  Mural: '#ff6b9d',
  Sculpture: '#7c4dff',
  'Paste-up': '#ff9f43',
  Sticker: '#2ecc71',
  Installation: '#3498db'
};
const ZONE_RADIUS_M = 180;
let precision = localStorage.getItem(PRECISION_KEY) || 'exact';
let searchQuery = '';
let questPanelTab = 'quests';

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
  marker.on('click', () => openPanel(art));
  return marker;
}

function makeZone(art) {
  const zone = L.circle([art.lat, art.lng], {
    radius: ZONE_RADIUS_M,
    color: TYPE_COLORS[art.type] || '#2d2d2d',
    fillColor: TYPE_COLORS[art.type] || '#2d2d2d',
    fillOpacity: 0.18,
    opacity: 0.7,
    weight: 2,
    className: 'zone-active'
  });

  zone.artData = art;
  zone.on('click', () => openPanel(art));
  return zone;
}

function makeMarkerOrZone(art, isActive) {
  if (precision === 'approx' && !isCompleted(art.id)) {
    return makeZone(art);
  }
  return makeMarker(art, isActive);
}

function renderMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const ordered = orderForPlayMode(allArtworks);
  const lockedSet = computeLockedSet(ordered);
  const activeQuest = ordered.find(a => !isCompleted(a.id) && !lockedSet.has(a.id)) || null;

  allArtworks.forEach(art => {
    const done = isCompleted(art.id);
    const isActive = !!activeQuest && art.id === activeQuest.id;
    if (!done && !isActive) return;
    const m = makeMarkerOrZone(art, isActive);
    m.addTo(map);
    markers.push(m);
  });

  const foundCount = getCompleted().length;
  document.getElementById('count').innerHTML =
    `<strong>${foundCount}</strong> of ${allArtworks.length} found · Sheung Wan, HK`;
}

// ─── Artwork panel ────────────────────────────────

function openPanel(art) {
  closeQuestPanel();
  const panel = document.getElementById('panel');
  const content = document.getElementById('panel-content');

  const done = isCompleted(art.id);
  const hideDetails = !done && precision === 'approx';

  const photoHTML = art.photo
    ? `<div class="panel-photo"><img src="${art.photo}" alt="${art.title}" /></div>`
    : `<div class="panel-photo-placeholder">No photo yet</div>`;

  const foundBadge = done
    ? `<span class="panel-found-badge">FOUND ✓</span>`
    : '';

  const bodyHTML = hideDetails
    ? `
      <div class="panel-hint">${art.hint}</div>
      <div class="panel-address">Somewhere within ${ZONE_RADIUS_M}m of this zone</div>
    `
    : `
      <div class="panel-title">${art.title}</div>
      <div class="panel-artist">
        <strong>${art.artist !== 'Unknown' ? art.artist : 'Unknown artist'}</strong>
      </div>
      <div class="panel-address">${art.address}</div>
    `;

  content.innerHTML = `
    <div class="panel-color-bar ${art.type}"></div>
    ${hideDetails ? '' : photoHTML}
    <div class="panel-body">
      <div class="panel-type-row">
        <span class="panel-type ${art.type}">${art.type}</span>
        <span class="panel-commissioned">${art.commissioned ? '✓ Commissioned' : '○ Unsanctioned'}</span>
        ${foundBadge}
      </div>
      ${bodyHTML}
    </div>
  `;

  panel.classList.add('open');
}

function closePanel() {
  document.getElementById('panel').classList.remove('open');
}

// ─── Quest panel ──────────────────────────────────

function openQuestPanel() {
  closePanel();
  if ((playMode === 'nearest' || playMode === 'artist' || playMode === 'type') && !nearestOrigin) {
    resolveNearestOrigin(refreshQuestUI);
  } else if (playMode === 'shuffle' && !shuffleOrderIds) {
    shuffleOrderIds = shuffleArray(allArtworks.map(a => a.id));
  }
  renderQuestPanelBody();
  document.getElementById('quest-panel').classList.add('open');
  if (!playMode) {
    document.getElementById('play-mode-backdrop').classList.remove('hidden');
  }
}

function closeQuestPanel() {
  document.getElementById('quest-panel').classList.remove('open');
}

function groupLabelFor(art) {
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
  if (playMode === 'artist' || playMode === 'type') {
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

function computeLockedSet(ordered) {
  const locked = new Set();
  let unlockedAssigned = false;

  ordered.forEach(art => {
    if (isCompleted(art.id)) return;
    if (!unlockedAssigned) {
      unlockedAssigned = true;
    } else {
      locked.add(art.id);
    }
  });

  return locked;
}

function renderQuestList() {
  const completed = getCompleted();
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  const locked = computeLockedSet(orderForPlayMode(allArtworks));

  const filtered = activeFilter === 'all'
    ? allArtworks
    : allArtworks.filter(a => a.type === activeFilter);

  const ordered = orderForPlayMode(filtered);

  const visible = searchQuery
    ? ordered.filter(art =>
        (art.artist || '').toLowerCase().includes(searchQuery) ||
        art.type.toLowerCase().includes(searchQuery)
      )
    : ordered;

  if (searchQuery && visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'quest-no-results';
    empty.textContent = `No quests match "${searchQuery}"`;
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
    const isLocked = locked.has(art.id);
    const item = document.createElement('div');
    item.className = `quest-item${done ? ' completed' : ''}${isLocked ? ' locked' : ''}`;
    item.innerHTML = `
      <div class="quest-item-num">${done ? '✓' : num}</div>
      <div class="quest-item-info">
        <div class="quest-item-type">${art.type}</div>
        <div class="quest-item-area">${art.address.split(',')[0]}</div>
      </div>
      ${done
        ? '<div class="quest-item-done-label">Found</div>'
        : isLocked
          ? '<div class="quest-item-lock">🔒</div>'
          : '<div class="quest-item-arrow">→</div>'
      }
    `;
    if (isLocked) {
      item.title = 'Find your current quest first';
    } else {
      item.addEventListener('click', () => openQuestCard(art));
    }
    list.appendChild(item);
  });
}

function renderGallery() {
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  const found = allArtworks.filter(a => isCompleted(a.id));

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
  document.querySelector('.quest-search-row').classList.toggle('hidden', questPanelTab === 'gallery');

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
  const mode = playMode && PLAY_MODES[playMode] ? playMode : 'default';
  const { icon, label } = PLAY_MODES[mode];
  pill.textContent = `${icon} ${label}`;
}

function refreshQuestUI() {
  renderQuestPanelBody();
  renderMarkers();
}

function setPlayMode(mode) {
  playMode = mode;
  localStorage.setItem(PLAY_MODE_KEY, mode);
  document.getElementById('play-mode-backdrop').classList.add('hidden');
  updatePlayModePill();

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
    btn.addEventListener('click', () => setPlayMode(btn.dataset.mode));
  });
  document.getElementById('play-mode-skip').addEventListener('click', () => setPlayMode('default'));
  document.getElementById('play-mode-pill').addEventListener('click', () => {
    document.getElementById('play-mode-backdrop').classList.remove('hidden');
  });
  updatePlayModePill();
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

  const nextQuest = done ? getNextUnlockedQuest() : null;

  content.innerHTML = `
    <div class="quest-card-header">
      <span class="quest-card-type ${art.type}">${art.type}</span>
      ${done ? '<span class="quest-card-found-badge">FOUND ✓</span>' : ''}
    </div>
    ${photoHTML}
    ${done ? '' : `<div class="quest-card-hint">${art.hint}</div>`}
    ${done
      ? `<div class="quest-revealed">
           <div class="quest-revealed-title">${art.title}</div>
           <div class="quest-revealed-artist">by ${art.artist}</div>
         </div>
         <div class="quest-fun-fact"><strong>Fun fact</strong>${art.hint}</div>
         ${nextQuest
           ? `<button id="next-quest-btn" class="checkin-btn">→ Next: ${nextQuest.type} at ${nextQuest.address.split(',')[0]}</button>`
           : `<div class="quest-all-done">🎉 Nothing else unlocked right now — nice work!</div>`
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
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
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

function getNextUnlockedQuest() {
  const ordered = orderForPlayMode(allArtworks);
  const locked = computeLockedSet(ordered);
  return ordered.find(a => !isCompleted(a.id) && !locked.has(a.id)) || null;
}

function celebrateFind() {
  const card = document.getElementById('quest-card');
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const emojis = ['🎉', '✨', '⭐', '🎊'];
  for (let i = 0; i < 14; i++) {
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

function attemptCheckin() {
  const status = document.getElementById('gps-status');
  const btn = document.getElementById('checkin-btn');

  if (!navigator.geolocation) {
    status.textContent = 'GPS not available on this device.';
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
        const found = activeQuest;
        markCompleted(found.id);
        renderMarkers();
        openQuestCard(found);
        celebrateFind();
        mascotSay('Nice find! 🎉', `That's one more ${found.type} down.`);
        renderQuestPanelBody();
      } else {
        btn.disabled = false;
        btn.textContent = "📍 I'm here — Check In";
        if (status) status.textContent = `You're about ${Math.round(dist)}m away. Get closer!`;
      }
    },
    () => {
      btn.disabled = false;
      btn.textContent = "📍 I'm here — Check In";
      if (status) status.textContent = 'Could not get your location. Try again.';
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
      mascot.classList.add('hidden');
    });
  } else {
    mascot.classList.add('hidden');
  }
}

// ─── Welcome modal ────────────────────────────────

const WELCOME_KEY = 'saq_welcomed';

function initWelcome() {
  const questBtn = document.getElementById('open-quests');
  if (!localStorage.getItem(WELCOME_KEY)) {
    questBtn.classList.add('pulsing');
  }

  function dismissWelcome() {
    document.getElementById('welcome-backdrop').classList.add('hidden');
    localStorage.setItem(WELCOME_KEY, '1');
    openQuestPanel();
  }

  document.getElementById('welcome-start').addEventListener('click', dismissWelcome);
  document.getElementById('welcome-skip').addEventListener('click', dismissWelcome);
}

function handleQuestsClick() {
  document.getElementById('open-quests').classList.remove('pulsing');
  if (localStorage.getItem(WELCOME_KEY)) {
    openQuestPanel();
  } else {
    document.getElementById('welcome-backdrop').classList.remove('hidden');
  }
}

// ─── Guided tour ──────────────────────────────────

const TOUR_KEY = 'saq_tour_seen';

const TOUR_STEPS = [
  { selector: '#map', title: 'The map', text: 'Tap any coloured dot to see a hidden mural or street art piece nearby.' },
  { selector: '#filters', title: 'Filter by type', text: 'Narrow the map down to just the kinds of art you want to hunt.' },
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
renderMarkers();
updateNavScore();
initLocation();
initPlayMode();
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
