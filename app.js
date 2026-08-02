document.addEventListener('DOMContentLoaded', () => {
  const BASE_API_URL = "https://ranacabletv.alwaysdata.net/oxoo/rest-api/v100/";
  const API_KEY = "1adj2wv368c6pnaavh7od79n";

  let allChannels = [];
  let currentQuickFilter = 'All';      // 'All', 'Favorites', 'Recent'
  let currentCountryFilter = 'All';    // 'All', or specific country name (e.g. 'India', 'United States')
  let currentGenreFilter = 'All';      // 'All', or specific genre name
  
  let hlsInstance = null;
  let currentPlayingChannel = null;

  // Batch rendering for 60FPS UI performance
  const BATCH_SIZE = 60;
  let currentFilteredChannels = [];
  let currentlyRenderedCount = 0;

  // LocalStorage state for Favorites and Recent history
  let favoriteIds = JSON.parse(localStorage.getItem('iptv_favorites') || '[]');
  let recentList = JSON.parse(localStorage.getItem('iptv_recents') || '[]');

  // DOM Elements
  const sidebar = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');

  const sidebarGenresContainer = document.getElementById('sidebarGenresContainer');
  const sidebarCountriesContainer = document.getElementById('sidebarCountriesContainer');
  const activeFilterText = document.getElementById('activeFilterText');

  const countrySelect = document.getElementById('countrySelect');
  const genreSelect = document.getElementById('genreSelect');

  const playerWrapper = document.getElementById('playerWrapper');
  const videoContainer = document.getElementById('videoContainer');
  const videoPlayer = document.getElementById('videoPlayer');
  const currentChannelTitle = document.getElementById('currentChannelTitle');
  const channelsGrid = document.getElementById('channelsGrid');
  const searchInput = document.getElementById('searchInput');
  const btnSearch = document.getElementById('btnSearch');
  const searchDropdown = document.getElementById('searchDropdown');
  const channelCountSpan = document.getElementById('channelCount');
  const statusBadge = document.getElementById('statusBadge');
  
  const btnRefresh = document.getElementById('btnRefresh');
  const btnPip = document.getElementById('btnPip');
  const btnClosePlayer = document.getElementById('btnClosePlayer');

  // Mobile Sidebar Drawer Toggle Logic
  function openMobileSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
  }

  function closeMobileSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      if (sidebar && sidebar.classList.contains('open')) {
        closeMobileSidebar();
      } else {
        openMobileSidebar();
      }
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  // Click on Brand Title ("Indian & Global IPTVs") leads to Home Page
  const brandLogo = document.getElementById('brandLogo') || document.querySelector('.brand');
  if (brandLogo) {
    brandLogo.style.cursor = 'pointer';
    brandLogo.addEventListener('click', () => {
      if (playerWrapper && playerWrapper.classList.contains('active')) {
        closePlayer(true);
      }
      clearAllSidebarActiveStates();
      currentQuickFilter = 'All';
      currentCountryFilter = 'All';
      currentGenreFilter = 'All';
      if (searchInput) searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');

      const allChannelsBtn = document.querySelector('.sidebar-nav-item[data-value="All"]');
      if (allChannelsBtn) allChannelsBtn.classList.add('active');

      syncMobilePillsActiveState();
      filterAndRender();
      closeMobileSidebar();

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Toast notification system
  function showToast(message, isError = false) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    const iconSvg = isError
      ? `<svg width="16" height="16" fill="none" stroke="#d32f2f" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
      : `<svg width="16" height="16" fill="none" stroke="#2e7d32" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;

    toast.innerHTML = `${iconSvg} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, 3000);
  }

  // Get clean 2-letter initials for channel logo fallbacks
  function getChannelInitials(name) {
    if (!name) return 'TV';
    const clean = name.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const words = clean.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return clean.substring(0, 2).toUpperCase() || 'TV';
  }

  // Generate deterministic retro gradient background based on channel name
  function getChannelGradient(name) {
    const gradients = [
      'linear-gradient(135deg, #0055ea 0%, #0037a4 100%)',
      'linear-gradient(135deg, #d32f2f 0%, #9a0007 100%)',
      'linear-gradient(135deg, #2e7d32 0%, #005005 100%)',
      'linear-gradient(135deg, #6a1b9a 0%, #38006b 100%)',
      'linear-gradient(135deg, #e65100 0%, #ac1900 100%)',
      'linear-gradient(135deg, #00838f 0%, #005662 100%)',
      'linear-gradient(135deg, #283593 0%, #001064 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  }

  // Determine channel country origin
  function getChannelCountry(ch) {
    if (ch.country) return ch.country;
    if (ch.genre === 'Indian') return 'India';
    const g = (ch.genre || '').toLowerCase();
    const name = (ch.name || '').toLowerCase();
    if (name.includes('india') || g.includes('indian') || g.includes('hindi') || g.includes('telugu') || g.includes('tamil') || g.includes('bengali') || g.includes('malayalam') || g.includes('kannada') || g.includes('marathi') || g.includes('punjabi') || g.includes('gujarati')) {
      return 'India';
    }
    return 'International';
  }

  // Parse raw M3U text into channel objects
  function parseM3uToChannels(text, defaultCategory = 'General') {
    const lines = text.split('\n');
    let currentExt = null;
    const result = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        currentExt = line;
      } else if (!line.startsWith('#') && currentExt) {
        const streamUrl = line.trim();
        if (streamUrl) {
          const logoMatch = currentExt.match(/tvg-logo="([^"]+)"/);
          const logo = logoMatch ? logoMatch[1] : '';

          const groupMatch = currentExt.match(/group-title="([^"]+)"/);
          let genre = groupMatch ? groupMatch[1].trim() : defaultCategory;
          if (!genre || genre.toLowerCase() === 'undefined' || genre === ';') {
            genre = defaultCategory;
          }

          const titleIdx = currentExt.lastIndexOf(',');
          let rawName = titleIdx !== -1 ? currentExt.substring(titleIdx + 1).trim() : 'Live Channel';
          if (!rawName) rawName = 'Live Channel';

          result.push({
            id: 'iptv-org-' + (result.length + 1) + '-' + Math.random().toString(36).substr(2, 4),
            name: rawName,
            genre: genre,
            country: defaultCategory === 'Indian' ? 'India' : 'International',
            stream_url: streamUrl,
            stream_from: streamUrl.includes('youtube.com') || streamUrl.includes('youtu.be') ? 'youtube' : 'hls',
            thumbnail: logo || '',
            poster: ''
          });
        }
        currentExt = null;
      }
    }
    return result;
  }

  // Populate Filter Select Dropdowns dynamically
  function populateFilterSelects() {
    if (countrySelect) {
      countrySelect.innerHTML = `<option value="All">🌐 All Countries (${allChannels.length.toLocaleString()})</option>`;
      const countryCounts = new Map();
      allChannels.forEach(ch => {
        const c = getChannelCountry(ch);
        countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
      });
      const sorted = Array.from(countryCounts.keys()).sort((a, b) => {
        if (a === 'India') return -1;
        if (b === 'India') return 1;
        return (countryCounts.get(b) || 0) - (countryCounts.get(a) || 0);
      });
      sorted.forEach(c => {
        const count = countryCounts.get(c);
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = `${c} (${count.toLocaleString()})`;
        if (c === currentCountryFilter && currentGenreFilter === 'All') {
          opt.selected = true;
        }
        countrySelect.appendChild(opt);
      });
    }

    if (genreSelect) {
      genreSelect.innerHTML = `<option value="All">🎭 All Genres (${allChannels.length.toLocaleString()})</option>`;
      const genreCounts = new Map();
      allChannels.forEach(ch => {
        const g = ch.genre || 'General';
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      });
      const sorted = Array.from(genreCounts.keys()).sort((a, b) => (genreCounts.get(b) || 0) - (genreCounts.get(a) || 0));
      sorted.forEach(g => {
        const count = genreCounts.get(g);
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = `${g} (${count.toLocaleString()})`;
        if (g === currentGenreFilter && currentCountryFilter === 'All') {
          opt.selected = true;
        }
        genreSelect.appendChild(opt);
      });
    }
  }

  // Country Select Dropdown Event Listener
  if (countrySelect) {
    countrySelect.addEventListener('change', (e) => {
      const val = e.target.value;
      clearAllSidebarActiveStates();
      currentCountryFilter = val;
      currentGenreFilter = 'All';
      currentQuickFilter = 'All';
      searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');
      if (genreSelect) genreSelect.value = 'All';
      syncMobilePillsActiveState();
      filterAndRender();
    });
  }

  // Genre Select Dropdown Event Listener
  if (genreSelect) {
    genreSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      clearAllSidebarActiveStates();
      currentGenreFilter = val;
      currentCountryFilter = 'All';
      currentQuickFilter = 'All';
      searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');
      if (countrySelect) countrySelect.value = 'All';
      syncMobilePillsActiveState();
      filterAndRender();
    });
  }

  // Load Master Database from Firebase Firestore / Server
  const PRIMARY_DB_URL = `https://raw.githubusercontent.com/joelgomes001/IPTV-Player/main/website/channels.json?_t=${Date.now()}`;

  async function loadLiveChannels() {
    statusBadge.innerHTML = `<span style="color:#fef08a;">● Syncing with Server...</span>`;

    try {
      if (window.firebaseDb && window.firestoreTools) {
        const db = window.firebaseDb;
        const { doc, getDoc } = window.firestoreTools;
        const docRef = doc(db, "metadata", "channels");
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().channels) {
          allChannels = snap.data().channels;
          statusBadge.innerHTML = `<span style="color:#ffffff;">● Synced (${allChannels.length.toLocaleString()} Channels)</span>`;
          populateFilterSelects();
          renderSidebarCountries();
          renderSidebarGenres();
          filterAndRender();
          showToast(`Sync complete! Loaded ${allChannels.length.toLocaleString()} channels from live database.`);
          return;
        }
      }
    } catch(e) {}

    fetch(PRIMARY_DB_URL, { cache: 'no-cache' })
      .then(r => r.json())
      .catch(() => fetch(`channels.json?_t=${Date.now()}`, { cache: 'no-cache' }).then(r => r.json()))
      .then(baseChannels => {
        allChannels = baseChannels;
        statusBadge.innerHTML = `<span style="color:#ffffff;">● Synced (${allChannels.length.toLocaleString()} Channels)</span>`;
        populateFilterSelects();
        renderSidebarCountries();
        renderSidebarGenres();
        filterAndRender();

        showToast(`Sync complete! Loaded ${allChannels.length.toLocaleString()} channels from server.`);
      })
      .catch(e => {
        console.error('Failed to load channels:', e);
        channelsGrid.innerHTML = `<div style="text-align:center; grid-column: 1/-1; padding: 2rem; color: #d32f2f;">Failed to load channel data.</div>`;
      });
  }

  // Initial Load
  loadLiveChannels();

  // Refresh Button Click
  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadLiveChannels);
  }

  // Clear all sidebar active states across Quick, Country, and Genre sections
  function clearAllSidebarActiveStates() {
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.remove('active'));
  }

  // Sync Mobile Filter Pills & Dropdowns Active State
  function syncMobilePillsActiveState() {
    document.querySelectorAll('.mobile-pill').forEach(pill => {
      const pType = pill.dataset.type;
      const pVal = pill.dataset.value;
      if (pType === 'country' && pVal === currentCountryFilter && currentGenreFilter === 'All' && currentQuickFilter === 'All') {
        pill.classList.add('active');
      } else if (pType === 'genre' && pVal === currentGenreFilter && currentCountryFilter === 'All' && currentQuickFilter === 'All') {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    if (countrySelect) countrySelect.value = currentCountryFilter;
    if (genreSelect) genreSelect.value = currentGenreFilter;
  }

  // Mobile Filter Pills Event Listeners
  document.querySelectorAll('.mobile-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const type = pill.dataset.type;
      const val = pill.dataset.value;
      
      clearAllSidebarActiveStates();
      currentQuickFilter = 'All';
      searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');

      if (type === 'country') {
        currentCountryFilter = val;
        currentGenreFilter = 'All';
      } else if (type === 'genre') {
        currentGenreFilter = val;
        currentCountryFilter = 'All';
      }

      syncMobilePillsActiveState();
      filterAndRender();
    });
  });

  // Quick Access Button Listeners
  document.querySelectorAll('.sidebar-nav-item[data-type="quick"]').forEach(btn => {
    btn.addEventListener('click', () => {
      clearAllSidebarActiveStates();
      btn.classList.add('active');
      
      currentQuickFilter = btn.dataset.value;
      currentCountryFilter = 'All';
      currentGenreFilter = 'All';
      searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');
      closeMobileSidebar();
      syncMobilePillsActiveState();
      filterAndRender();
    });
  });

  // Dynamic Country Filter Items Renderer
  function renderSidebarCountries() {
    const container = document.getElementById('sidebarCountriesContainer');
    if (!container) return;
    container.innerHTML = '';

    const countryCounts = new Map();
    allChannels.forEach(ch => {
      const c = getChannelCountry(ch);
      countryCounts.set(c, (countryCounts.get(c) || 0) + 1);
    });

    const sortedCountries = Array.from(countryCounts.keys()).sort((a, b) => {
      if (a === 'India') return -1;
      if (b === 'India') return 1;
      return (countryCounts.get(b) || 0) - (countryCounts.get(a) || 0);
    });

    // 1. "All Countries" button
    const allBtn = document.createElement('button');
    allBtn.className = `sidebar-nav-item ${currentCountryFilter === 'All' && currentGenreFilter === 'All' && currentQuickFilter === 'All' && !searchInput.value ? 'active' : ''}`;
    allBtn.dataset.type = 'country';
    allBtn.dataset.value = 'All';
    allBtn.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h1.5a2.5 2.5 0 002.5-2.5V7a2 2 0 00-2-2h-1c0-1.1.9-2 2-2h1.065M12 21a9 9 0 100-18 9 9 0 000 18z"/>
        </svg>
        <span>All Countries</span>
      </div>
      <span class="sidebar-count-pill">${allChannels.length.toLocaleString()}</span>
    `;
    allBtn.addEventListener('click', () => {
      clearAllSidebarActiveStates();
      allBtn.classList.add('active');
      currentCountryFilter = 'All';
      currentQuickFilter = 'All';
      currentGenreFilter = 'All';
      searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');
      closeMobileSidebar();
      syncMobilePillsActiveState();
      filterAndRender();
    });
    container.appendChild(allBtn);

    // 2. Individual country buttons
    sortedCountries.forEach(country => {
      const btn = document.createElement('button');
      btn.className = `sidebar-nav-item ${currentCountryFilter === country ? 'active' : ''}`;
      btn.dataset.type = 'country';
      btn.dataset.value = country;
      const count = countryCounts.get(country) || 0;

      btn.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; min-width:0;">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${country}</span>
        </div>
        <span class="sidebar-count-pill">${count.toLocaleString()}</span>
      `;

      btn.addEventListener('click', () => {
        clearAllSidebarActiveStates();
        btn.classList.add('active');
        currentCountryFilter = country;
        currentQuickFilter = 'All';
        currentGenreFilter = 'All';
        searchInput.value = '';
        if (searchDropdown) searchDropdown.classList.remove('active');
        closeMobileSidebar();
        syncMobilePillsActiveState();
        filterAndRender();
      });
      container.appendChild(btn);
    });
  }

  // SVG Icon for Genre
  function getGenreSvgIcon(genre) {
    const g = (genre || '').toLowerCase();
    if (g.includes('dd channels') || g.includes('doordarshan')) {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`;
    }
    if (g.includes('news')) {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6m-6 4h6"/></svg>`;
    }
    if (g.includes('movie') || g.includes('cinema')) {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/></svg>`;
    }
    if (g.includes('music')) {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12 0c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>`;
    }
    if (g.includes('sport')) {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }
    if (g.includes('kid') || g.includes('animation')) {
      return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }
    return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`;
  }

  // Render Genre Items in Sidebar
  function renderSidebarGenres() {
    if (!sidebarGenresContainer) return;
    sidebarGenresContainer.innerHTML = '';

    const genreCounts = new Map();
    allChannels.forEach(ch => {
      const g = ch.genre || 'General';
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    });

    const sortedGenres = Array.from(genreCounts.keys()).sort((a, b) => {
      return (genreCounts.get(b) || 0) - (genreCounts.get(a) || 0);
    });

    const allBtn = document.createElement('button');
    allBtn.className = `sidebar-nav-item ${currentGenreFilter === 'All' && currentCountryFilter === 'All' && currentQuickFilter === 'All' && !searchInput.value ? 'active' : ''}`;
    allBtn.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
        </svg>
        <span>All Genres</span>
      </div>
      <span class="sidebar-count-pill">${allChannels.length.toLocaleString()}</span>
    `;
    allBtn.addEventListener('click', () => {
      clearAllSidebarActiveStates();
      allBtn.classList.add('active');
      currentGenreFilter = 'All';
      currentQuickFilter = 'All';
      currentCountryFilter = 'All';
      searchInput.value = '';
      if (searchDropdown) searchDropdown.classList.remove('active');
      closeMobileSidebar();
      syncMobilePillsActiveState();
      filterAndRender();
    });
    sidebarGenresContainer.appendChild(allBtn);

    sortedGenres.slice(0, 30).forEach(genre => {
      const btn = document.createElement('button');
      btn.className = `sidebar-nav-item ${currentGenreFilter === genre ? 'active' : ''}`;
      const iconSvg = getGenreSvgIcon(genre);
      const count = genreCounts.get(genre) || 0;
      
      btn.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem; min-width:0;">
          ${iconSvg}
          <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${genre}</span>
        </div>
        <span class="sidebar-count-pill">${count.toLocaleString()}</span>
      `;

      btn.addEventListener('click', () => {
        clearAllSidebarActiveStates();
        btn.classList.add('active');
        currentGenreFilter = genre;
        currentQuickFilter = 'All';
        currentCountryFilter = 'All';
        searchInput.value = '';
        if (searchDropdown) searchDropdown.classList.remove('active');
        closeMobileSidebar();
        syncMobilePillsActiveState();
        filterAndRender();
      });
      sidebarGenresContainer.appendChild(btn);
    });
  }

  // Global Channel Search logic across ALL channels
  function getFilteredChannels() {
    const query = searchInput.value.toLowerCase().trim();
    
    // When a search query is entered, search across ALL CHANNELS ignoring category constraints
    if (query) {
      const terms = query.split(/\s+/).filter(t => t.length > 0);
      return allChannels.filter(ch => {
        const searchStr = `${ch.name || ''} ${ch.genre || ''} ${ch.country || ''}`.toLowerCase();
        return terms.every(term => searchStr.includes(term));
      });
    }

    // Otherwise apply active single category filter
    return allChannels.filter(ch => {
      if (searchInput && searchInput.value.trim()) {
        const query = searchInput.value.toLowerCase().trim();
        if (!ch.name || !ch.name.toLowerCase().includes(query)) return false;
      }

      if (currentQuickFilter === 'Favorites') {
        if (!favoriteIds.includes(String(ch.id))) return false;
      } else if (currentQuickFilter === 'Recent') {
        if (!recentList.some(r => String(r.id) === String(ch.id))) return false;
      }

      if (currentCountryFilter !== 'All') {
        const country = getChannelCountry(ch);
        if (country !== currentCountryFilter) return false;
      }

      if (currentGenreFilter !== 'All') {
        if (ch.genre !== currentGenreFilter) return false;
      }

      return true;
    });
  }

  // Update Active Filter Badge Display Text (Single Filter Display)
  function updateActiveFilterBadge() {
    if (!activeFilterText) return;
    const query = searchInput.value.trim();

    if (query) {
      activeFilterText.textContent = `Search Results for "${query}"`;
    } else if (currentQuickFilter === 'Favorites') {
      activeFilterText.textContent = 'Favorites';
    } else if (currentQuickFilter === 'Recent') {
      activeFilterText.textContent = 'Recent History';
    } else if (currentCountryFilter !== 'All') {
      activeFilterText.textContent = `${currentCountryFilter} Channels`;
    } else if (currentGenreFilter !== 'All') {
      activeFilterText.textContent = currentGenreFilter;
    } else {
      activeFilterText.textContent = 'All Channels';
    }
  }

  // Filter and Render Channels with Batch Infinite Scrolling
  function filterAndRender() {
    if (searchInput) searchInput.placeholder = 'Search channels by name...';
    updateActiveFilterBadge();
    currentFilteredChannels = getFilteredChannels();
    channelsGrid.innerHTML = '';
    currentlyRenderedCount = 0;
    channelCountSpan.textContent = `(${currentFilteredChannels.length.toLocaleString()} channels)`;

    if (currentFilteredChannels.length === 0) {
      const msg = searchInput.value.trim() 
        ? `No channels found matching "${searchInput.value.trim()}".`
        : currentQuickFilter === 'Favorites' 
        ? 'No favorite channels saved yet. Click the star ★ on any channel to save it!' 
        : currentQuickFilter === 'Recent'
        ? 'No recently watched channels yet.'
        : 'No channels found matching your active filter.';
      channelsGrid.innerHTML = `<div style="text-align:center; grid-column: 1/-1; padding: 3rem; color: #777;">${msg}</div>`;
      return;
    }

    renderNextBatch();
  }

  // Render Live Instant Search Dropdown
  function renderSearchDropdown(query) {
    if (!searchDropdown) return;
    if (!query || query.length < 2) {
      searchDropdown.classList.remove('active');
      searchDropdown.innerHTML = '';
      return;
    }

    const matches = allChannels.filter(ch => {
      return ch.name && ch.name.toLowerCase().includes(query);
    }).slice(0, 10);

    if (matches.length === 0) {
      searchDropdown.innerHTML = `<div style="padding: 0.75rem 1rem; color: #777; text-align: center; font-size: 0.85rem;">No matching channels</div>`;
      searchDropdown.classList.add('active');
      return;
    }

    searchDropdown.innerHTML = '';
    matches.forEach(ch => {
      const item = document.createElement('div');
      item.className = 'search-dropdown-item';

      const initials = getChannelInitials(ch.name);
      const gradient = getChannelGradient(ch.name);
      const hasLogo = ch.thumbnail && ch.thumbnail.trim().length > 0 && !ch.thumbnail.includes('tv_thumbnail.jpg') && !ch.thumbnail.includes('default_image');

      const logoImg = hasLogo 
        ? `<img src="${ch.thumbnail}" style="position: absolute; inset:0; width: 100%; height: 100%; object-fit: contain; background: #ffffff; z-index: 2;" onerror="this.remove();">` 
        : '';

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.6rem; min-width: 0;">
          <div style="width: 28px; height: 28px; border-radius: 3px; background:${gradient}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; position: relative; overflow: hidden; font-weight: 700; color: #ffffff; font-size: 0.65rem; border: 1px solid #ccc;">
            ${initials}
            ${logoImg}
          </div>
          <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">
            ${ch.name}
          </div>
        </div>
        <div style="font-size: 0.75rem; color: #666; font-weight: 500; margin-left: 0.5rem; white-space: nowrap;">
          ${ch.country || ch.genre}
        </div>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        searchDropdown.classList.remove('active');
        playChannel(ch);
      });

      searchDropdown.appendChild(item);
    });

    searchDropdown.classList.add('active');
  }

  // Trigger Full Search across all channels & Stop Last Playing Video
  function triggerFullSearch() {
    if (searchDropdown) searchDropdown.classList.remove('active');

    // Telemetry: Log search event to Firebase Analytics
    if (window.logFirebaseEvent && searchInput.value.trim()) {
      window.logFirebaseEvent('search', {
        search_term: searchInput.value.trim()
      });
    }

    // Stop currently playing video cleanly upon performing search
    if (playerWrapper.classList.contains('active')) {
      closePlayer(false);
    }

    // Reset sidebar filters to All Channels view
    clearAllSidebarActiveStates();
    currentQuickFilter = 'All';
    currentCountryFilter = 'All';
    currentGenreFilter = 'All';
    
    const allChannelsBtn = document.querySelector('.sidebar-nav-item[data-value="All"]');
    if (allChannelsBtn) allChannelsBtn.classList.add('active');

    syncMobilePillsActiveState();
    filterAndRender();
  }

  // Search Input & Search Button Event Listeners
  if (btnSearch) {
    btnSearch.addEventListener('click', triggerFullSearch);
  }

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerFullSearch();
    }
  });

  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    renderSearchDropdown(q);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterAndRender();
    }, 200);
  });

  // Hide Search Dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (searchDropdown && !e.target.closest('.search-box')) {
      searchDropdown.classList.remove('active');
    }
  });

  // Render a batch of channel cards to DOM
  function renderNextBatch() {
    if (currentlyRenderedCount >= currentFilteredChannels.length) return;

    const nextBatch = currentFilteredChannels.slice(currentlyRenderedCount, currentlyRenderedCount + BATCH_SIZE);
    const fragment = document.createDocumentFragment();

    nextBatch.forEach(ch => {
      const card = createChannelCard(ch);
      fragment.appendChild(card);
    });

    channelsGrid.appendChild(fragment);
    currentlyRenderedCount += nextBatch.length;
  }

  // Helper to create a single Retro XP Channel Card element with logo display & fallback text badge
  function createChannelCard(ch) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    
    const initials = getChannelInitials(ch.name);
    const gradient = getChannelGradient(ch.name);
    const hasLogo = ch.thumbnail && ch.thumbnail.trim().length > 0 && !ch.thumbnail.includes('tv_thumbnail.jpg') && !ch.thumbnail.includes('default_image');

    const logoHtml = `
      <div class="channel-logo-fallback" style="background:${gradient};">${initials}</div>
      ${hasLogo ? `<img class="channel-logo" src="${ch.thumbnail}" alt="${ch.name}" loading="lazy" onerror="this.remove();">` : ''}
    `;

    const isFav = favoriteIds.includes(String(ch.id));

    card.innerHTML = `
      <div class="card-header-row">
        <div class="channel-logo-wrapper">
          ${logoHtml}
        </div>
        <button class="fav-star ${isFav ? 'active' : ''}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
          <svg width="18" height="18" fill="${isFav ? '#eab308' : 'none'}" stroke="${isFav ? '#eab308' : 'currentColor'}" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
          </svg>
        </button>
      </div>
      <div class="channel-name">${ch.name}</div>
      <div class="channel-genre">${ch.country ? `${ch.country} • ${ch.genre}` : ch.genre}</div>
      <div class="card-actions">
        <button class="play-btn">
          <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          Watch Live
        </button>
      </div>
    `;

    // Favorite Star Click Handler
    const favBtn = card.querySelector('.fav-star');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chId = String(ch.id);
      if (favoriteIds.includes(chId)) {
        favoriteIds = favoriteIds.filter(id => id !== chId);
        favBtn.classList.remove('active');
        favBtn.querySelector('svg').setAttribute('fill', 'none');
        favBtn.querySelector('svg').setAttribute('stroke', 'currentColor');
        showToast(`Removed ${ch.name} from Favorites`);
      } else {
        favoriteIds.push(chId);
        favBtn.classList.add('active');
        favBtn.querySelector('svg').setAttribute('fill', '#eab308');
        favBtn.querySelector('svg').setAttribute('stroke', '#eab308');
        showToast(`Added ${ch.name} to Favorites!`);
      }
      localStorage.setItem('iptv_favorites', JSON.stringify(favoriteIds));
      if (currentQuickFilter === 'Favorites') {
        filterAndRender();
      }
    });

    const playBtn = card.querySelector('.play-btn');
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playChannel(ch);
    });

    card.addEventListener('click', () => playChannel(ch));
    return card;
  }

  // Infinite Scroll Listener
  window.addEventListener('scroll', () => {
    if (currentlyRenderedCount < currentFilteredChannels.length) {
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.body.offsetHeight - 800;
      if (scrollPosition >= threshold) {
        renderNextBatch();
      }
    }
  });

  // Add channel to Recent History list
  function addToRecent(ch) {
    recentList = recentList.filter(r => String(r.id) !== String(ch.id));
    recentList.unshift(ch);
    if (recentList.length > 20) recentList.pop();
    localStorage.setItem('iptv_recents', JSON.stringify(recentList));
  }

  // Close Player Handler (Supports Browser Back Button Popstate)
  function closePlayer(popHistory = true) {
    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }
    videoPlayer.pause();
    videoPlayer.src = '';
    playerWrapper.classList.remove('active');
    currentPlayingChannel = null;

    if (popHistory && window.location.hash === '#watch') {
      window.history.back();
    }
  }

  if (btnClosePlayer) {
    btnClosePlayer.addEventListener('click', () => closePlayer(true));
  }

  // Listen to Browser Back / Forward buttons
  window.addEventListener('popstate', () => {
    if (playerWrapper.classList.contains('active')) {
      closePlayer(false);
    }
  });

  // Play Channel Stream with Instant Autoplay & History Push State for Browser Back Button
  function playChannel(ch) {
    if (!ch.stream_url) return;

    currentPlayingChannel = ch;
    addToRecent(ch);

    // Telemetry: Log channel view event to Firebase Analytics
    if (window.logFirebaseEvent) {
      window.logFirebaseEvent('select_content', {
        content_type: 'channel',
        item_id: String(ch.id),
        channel_name: ch.name,
        genre: ch.genre || 'General'
      });
    }

    if (ch.stream_url.includes('youtube.com') || ch.stream_url.includes('youtu.be')) {
      showToast(`Opening YouTube live stream for ${ch.name}...`);
      window.open(ch.stream_url, '_blank');
      return;
    }

    // Push state for browser Back button support
    if (window.location.hash !== '#watch') {
      window.history.pushState({ playerOpen: true, channelId: ch.id }, '', '#watch');
    }

    playerWrapper.classList.add('active');
    currentChannelTitle.textContent = ch.name;
    
    playerWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Enable initial playback
    videoPlayer.muted = false;

    if (Hls.isSupported()) {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
      hlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsInstance.loadSource(ch.stream_url);
      hlsInstance.attachMedia(videoPlayer);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        const playPromise = videoPlayer.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              videoPlayer.muted = false;
            })
            .catch(e => {
              console.log('Autoplay unmuted blocked, falling back to muted autoplay:', e);
              videoPlayer.muted = true;
              videoPlayer.play();
            });
        }
      });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      videoPlayer.src = ch.stream_url;
      videoPlayer.play()
        .then(() => { videoPlayer.muted = false; })
        .catch(() => {
          videoPlayer.muted = true;
          videoPlayer.play();
        });
    } else {
      alert('HLS playback is not supported in this browser.');
    }
  }

  // Detect Android App Environment
  const isAndroidApp = window.isAndroidApp || (window.navigator && window.navigator.userAgent && window.navigator.userAgent.includes('JTBS_Android_App'));

  // Picture-in-Picture (PiP Mode) - Hidden in Android App, kept in Web Browser
  if (btnPip) {
    if (isAndroidApp) {
      btnPip.style.display = 'none';
    } else {
      btnPip.style.display = 'inline-flex';
      btnPip.addEventListener('click', async () => {
        if (!videoPlayer.src && !videoPlayer.srcObject && !hlsInstance) {
          showToast('No video is currently playing', true);
          return;
        }
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else if (videoPlayer.requestPictureInPicture) {
            await videoPlayer.requestPictureInPicture();
            showToast('Picture-in-Picture mode activated');
          }
        } catch (err) {
          console.error('PiP error:', err);
          showToast('Picture-in-Picture not supported or blocked', true);
        }
      });
    }
  }
});
