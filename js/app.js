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

function makeMarker(art) {
  const el = document.createElement('div');
  el.className = `art-marker ${art.type}${isCompleted(art.id) ? ' found' : ''}`;

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

function renderMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  const filtered = activeFilter === 'all'
    ? allArtworks
    : allArtworks.filter(a => a.type === activeFilter);

  filtered.forEach(art => {
    const m = makeMarker(art);
    m.addTo(map);
    markers.push(m);
  });

  document.getElementById('count').innerHTML =
    `<strong>${filtered.length}</strong> artwork${filtered.length !== 1 ? 's' : ''} · Sheung Wan, HK`;
}

// ─── Artwork panel ────────────────────────────────

function openPanel(art) {
  closeQuestPanel();
  const panel = document.getElementById('panel');
  const content = document.getElementById('panel-content');

  const photoHTML = art.photo
    ? `<div class="panel-photo"><img src="${art.photo}" alt="${art.title}" /></div>`
    : `<div class="panel-photo-placeholder">No photo yet</div>`;

  const foundBadge = isCompleted(art.id)
    ? `<span class="panel-found-badge">FOUND ✓</span>`
    : '';

  content.innerHTML = `
    <div class="panel-color-bar ${art.type}"></div>
    ${photoHTML}
    <div class="panel-body">
      <div class="panel-type-row">
        <span class="panel-type ${art.type}">${art.type}</span>
        <span class="panel-commissioned">${art.commissioned ? '✓ Commissioned' : '○ Unsanctioned'}</span>
        ${foundBadge}
      </div>
      <div class="panel-title">${art.title}</div>
      <div class="panel-artist">
        <strong>${art.artist !== 'Unknown' ? art.artist : 'Unknown artist'}</strong>
      </div>
      <div class="panel-address">${art.address}</div>
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
  renderQuestList();
  document.getElementById('quest-panel').classList.add('open');
}

function closeQuestPanel() {
  document.getElementById('quest-panel').classList.remove('open');
}

function renderQuestList() {
  const completed = getCompleted();
  const list = document.getElementById('quest-list');
  list.innerHTML = '';

  allArtworks.forEach((art, i) => {
    const done = completed.includes(art.id);
    const item = document.createElement('div');
    item.className = `quest-item${done ? ' completed' : ''}`;
    item.innerHTML = `
      <div class="quest-item-num">${done ? '✓' : (i + 1)}</div>
      <div class="quest-item-info">
        <div class="quest-item-type">${art.type}</div>
        <div class="quest-item-area">${art.address.split(',')[0]}</div>
      </div>
      ${done ? '<div class="quest-item-done-label">Found</div>' : '<div class="quest-item-arrow">→</div>'}
    `;
    item.addEventListener('click', () => openQuestCard(art));
    list.appendChild(item);
  });

  const score = document.getElementById('quest-panel-score');
  if (score) score.textContent = `${completed.length} / ${allArtworks.length}`;
  updateNavScore();
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

  const photoHTML = art.photo
    ? `<div class="quest-photo"><img src="${art.photo}" alt="Quest" /></div>`
    : done
      ? `<div class="quest-photo-placeholder">✓</div>`
      : `<div id="quest-mini-map" class="quest-mini-map"></div>`;

  content.innerHTML = `
    <div class="quest-card-header">
      <span class="quest-card-type ${art.type}">${art.type}</span>
      ${done ? '<span class="quest-card-found-badge">FOUND ✓</span>' : ''}
    </div>
    ${photoHTML}
    <div class="quest-card-hint">${art.hint}</div>
    ${done
      ? `<div class="quest-revealed">
           <div class="quest-revealed-title">${art.title}</div>
           <div class="quest-revealed-artist">by ${art.artist}</div>
         </div>`
      : `<button id="checkin-btn" class="checkin-btn">📍 I'm here — Check In</button>
         <div id="gps-status" class="gps-status"></div>`
    }
  `;

  document.getElementById('quest-card').classList.remove('hidden');
  document.getElementById('quest-backdrop').classList.remove('hidden');

  if (!done && !art.photo) {
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
  }
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
        markCompleted(activeQuest.id);
        renderMarkers();
        openQuestCard(activeQuest);
        renderQuestList();
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
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.type;
      renderMarkers();
      closePanel();
    });
  });
}

// ─── User location ────────────────────────────────

function initLocation() {
  const btn = document.getElementById('locate-btn');
  if (!btn) return;

  if (!navigator.geolocation) {
    btn.style.display = 'none';
    return;
  }

  btn.addEventListener('click', () => {
    if (userMarker) {
      map.flyTo(userMarker.getLatLng(), 17, { duration: 1 });
      return;
    }

    btn.classList.add('locating');

    navigator.geolocation.watchPosition(
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

function initMascot() {
  const MASCOT_KEY = 'saq_mascot_dismissed';
  const mascot = document.getElementById('mascot');
  const dismiss = document.getElementById('mascot-dismiss');

  if (localStorage.getItem(MASCOT_KEY)) {
    mascot.classList.add('hidden');
    return;
  }

  dismiss.addEventListener('click', () => {
    mascot.classList.add('hidden');
    localStorage.setItem(MASCOT_KEY, '1');
  });

  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    if (!mascot.classList.contains('hidden')) {
      mascot.classList.add('hidden');
      localStorage.setItem(MASCOT_KEY, '1');
    }
  }, 10000);
}

// ─── Welcome modal ────────────────────────────────

const WELCOME_KEY = 'saq_welcomed';

function initWelcome() {
  const questBtn = document.getElementById('open-quests');
  if (!localStorage.getItem(WELCOME_KEY)) {
    questBtn.classList.add('pulsing');
  }

  document.getElementById('welcome-start').addEventListener('click', () => {
    document.getElementById('welcome-backdrop').classList.add('hidden');
    localStorage.setItem(WELCOME_KEY, '1');
    openQuestPanel();
  });
}

function handleQuestsClick() {
  if (!localStorage.getItem(WELCOME_KEY)) {
    document.getElementById('open-quests').classList.remove('pulsing');
    document.getElementById('welcome-backdrop').classList.remove('hidden');
  } else {
    openQuestPanel();
  }
}

// ─── Init ─────────────────────────────────────────

allArtworks = ARTWORKS;
initFilters();
renderMarkers();
updateNavScore();
initLocation();
initMascot();
initWelcome();

document.getElementById('close-panel').addEventListener('click', closePanel);
document.getElementById('open-quests').addEventListener('click', handleQuestsClick);
document.getElementById('close-quest-panel').addEventListener('click', closeQuestPanel);
document.getElementById('close-quest-card').addEventListener('click', closeQuestCard);
document.getElementById('quest-backdrop').addEventListener('click', closeQuestCard);

map.on('click', () => {
  closePanel();
  closeQuestPanel();
});
