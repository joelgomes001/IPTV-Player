// Firebase Authenticated Admin Dashboard JavaScript Logic for JTBS IPTV
(function() {
  let allChannels = [];
  let filteredChannels = [];
  let currentPage = 1;
  const pageSize = 50;

  let adminHlsInstance = null;

  // DOM Elements
  const loginOverlay = document.getElementById('loginOverlay');
  const adminEmailInput = document.getElementById('adminEmailInput');
  const adminPasswordInput = document.getElementById('adminPasswordInput');
  const btnLogin = document.getElementById('btnLogin');
  const loginError = document.getElementById('loginError');
  const btnLogout = document.getElementById('btnLogout');

  const statChannelCount = document.getElementById('statChannelCount');
  const adminSearchInput = document.getElementById('adminSearchInput');
  const adminGenreSelect = document.getElementById('adminGenreSelect');
  const adminCountrySelect = document.getElementById('adminCountrySelect');
  const btnAddNewChannel = document.getElementById('btnAddNewChannel');
  const btnSaveGithub = document.getElementById('btnSaveGithub');

  const adminTableBody = document.getElementById('adminTableBody');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  const pageIndicator = document.getElementById('pageIndicator');

  // Player Elements
  const adminPlayerWrapper = document.getElementById('adminPlayerWrapper');
  const adminPlayingChannelTitle = document.getElementById('adminPlayingChannelTitle');
  const adminStreamStatusBadge = document.getElementById('adminStreamStatusBadge');
  const adminVideoPlayer = document.getElementById('adminVideoPlayer');
  const btnCloseAdminPlayer = document.getElementById('btnCloseAdminPlayer');

  // Modal Elements
  const editModal = document.getElementById('editModal');
  const modalTitle = document.getElementById('modalTitle');
  const editChannelId = document.getElementById('editChannelId');
  const editName = document.getElementById('editName');
  const editGenre = document.getElementById('editGenre');
  const editCountry = document.getElementById('editCountry');
  const editStreamUrl = document.getElementById('editStreamUrl');
  const editThumbnail = document.getElementById('editThumbnail');
  const previewLogo = document.getElementById('previewLogo');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const btnCloseModalX = document.getElementById('btnCloseModalX');
  const btnSaveChannel = document.getElementById('btnSaveChannel');

  // Listen to Firebase Auth state
  function initFirebaseAuth() {
    if (!window.firebaseAuth) {
      setTimeout(initFirebaseAuth, 100);
      return;
    }

    const { auth, onAuthStateChanged } = window.firebaseAuth;

    onAuthStateChanged(auth, (user) => {
      if (user) {
        loginOverlay.style.display = 'none';
        loginError.style.display = 'none';
        loadMasterDatabase();
      } else {
        loginOverlay.style.display = 'flex';
      }
    });
  }

  // Handle Firebase Email/Password Login
  btnLogin.addEventListener('click', () => {
    const email = adminEmailInput.value.trim();
    const password = adminPasswordInput.value.trim();

    if (!email || !password) {
      loginError.textContent = "Please enter both admin email and password.";
      loginError.style.display = 'block';
      return;
    }

    if (!window.firebaseAuth) return;
    const { auth, signInWithEmailAndPassword } = window.firebaseAuth;

    btnLogin.disabled = true;
    btnLogin.textContent = "Authenticating with Firebase...";

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        loginOverlay.style.display = 'none';
        loginError.style.display = 'none';
        loadMasterDatabase();
      })
      .catch((error) => {
        loginError.textContent = `Auth error: ${error.message}`;
        loginError.style.display = 'block';
      })
      .finally(() => {
        btnLogin.disabled = false;
        btnLogin.textContent = "Login";
      });
  });

  adminPasswordInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') btnLogin.click();
  });

  btnLogout.addEventListener('click', () => {
    if (!window.firebaseAuth) return;
    const { auth, signOut } = window.firebaseAuth;
    signOut(auth).then(() => {
      location.reload();
    });
  });

  // Load Master Database from Firestore or JSON fallback
  async function loadMasterDatabase() {
    try {
      if (window.firebaseDb) {
        const { db, doc, getDoc } = window.firebaseDb;
        const docRef = doc(db, "metadata", "channels");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().channels) {
          allChannels = docSnap.data().channels;
          statChannelCount.textContent = `● ${allChannels.length.toLocaleString()} Channels`;
          populateFilterDropdowns();
          filterAndRenderTable();
          return;
        }
      }
    } catch(e) {
      console.log("Firestore load notice, falling back to channels.json:", e);
    }

    fetch(`channels.json?_t=${Date.now()}`, { cache: 'no-cache' })
      .then(r => r.json())
      .then(data => {
        allChannels = data;
        statChannelCount.textContent = `● ${allChannels.length.toLocaleString()} Channels`;
        populateFilterDropdowns();
        filterAndRenderTable();
      })
      .catch(e => {
        adminTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #ef4444;">Failed to load master database: ${e.message}</td></tr>`;
      });
  }

  function populateFilterDropdowns() {
    const genres = new Set();
    const countries = new Set();

    allChannels.forEach(c => {
      if (c.genre) genres.add(c.genre);
      if (c.country) countries.add(c.country);
    });

    const currGenre = adminGenreSelect.value;
    adminGenreSelect.innerHTML = '<option value="All">All Genres</option>';
    Array.from(genres).sort().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      adminGenreSelect.appendChild(opt);
    });
    if (currGenre) adminGenreSelect.value = currGenre;

    const currCountry = adminCountrySelect.value;
    adminCountrySelect.innerHTML = '<option value="All">All Countries</option>';
    Array.from(countries).sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      adminCountrySelect.appendChild(opt);
    });
    if (currCountry) adminCountrySelect.value = currCountry;
  }

  function filterAndRenderTable() {
    const query = adminSearchInput.value.toLowerCase().trim();
    const selGenre = adminGenreSelect.value;
    const selCountry = adminCountrySelect.value;

    filteredChannels = allChannels.filter(c => {
      const matchQuery = !query || (c.name && c.name.toLowerCase().includes(query)) || (c.stream_url && c.stream_url.toLowerCase().includes(query));
      const matchGenre = selGenre === 'All' || c.genre === selGenre;
      const matchCountry = selCountry === 'All' || c.country === selCountry;
      return matchQuery && matchGenre && matchCountry;
    });

    renderTablePage();
  }

  function renderTablePage() {
    const totalPages = Math.ceil(filteredChannels.length / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    pageIndicator.textContent = `Page ${currentPage} of ${totalPages} (${filteredChannels.length.toLocaleString()} matching)`;
    btnPrevPage.disabled = currentPage === 1;
    btnNextPage.disabled = currentPage === totalPages;

    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filteredChannels.slice(startIdx, startIdx + pageSize);

    if (pageItems.length === 0) {
      adminTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #666666;">No channels match the search filter.</td></tr>`;
      return;
    }

    let html = '';
    pageItems.forEach((ch) => {
      const thumb = ch.thumbnail || 'logo.png';
      const safeId = encodeURIComponent(String(ch.id));
      html += `
        <tr>
          <td><img src="${thumb}" style="width: 40px; height: 40px; object-fit: contain; background: #000; border-radius: 4px;" onerror="this.src='logo.png'"></td>
          <td style="font-weight: 700; color: #111111;">${escapeHtml(ch.name)}</td>
          <td><span class="badge-genre">${escapeHtml(ch.genre || 'General')}</span></td>
          <td><span class="badge-country">${escapeHtml(ch.country || 'International')}</span></td>
          <td style="font-family: monospace; font-size: 0.82rem; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <a href="${escapeHtml(ch.stream_url)}" target="_blank" style="color: #0284c7; text-decoration: none;">${escapeHtml(ch.stream_url)}</a>
          </td>
          <td style="text-align: center;">
            <button class="xp-button btn-play-ch" data-safe-id="${safeId}" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; margin-right: 0.3rem; background: linear-gradient(to bottom, #2563eb 0%, #1d4ed8 100%); color: #fff;">▶️ Play</button>
            <button class="xp-button btn-edit-ch" data-safe-id="${safeId}" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; margin-right: 0.3rem;">✏️ Edit</button>
            <button class="xp-button btn-del-ch" data-safe-id="${safeId}" style="padding: 0.25rem 0.6rem; font-size: 0.8rem; background: linear-gradient(to bottom, #ef4444 0%, #dc2626 100%); color: #fff;">🗑️</button>
          </td>
        </tr>
      `;
    });

    adminTableBody.innerHTML = html;

    // Row Event Listeners
    document.querySelectorAll('.btn-play-ch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rawId = decodeURIComponent(btn.getAttribute('data-safe-id'));
        playAdminStream(rawId);
      });
    });

    document.querySelectorAll('.btn-edit-ch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rawId = decodeURIComponent(btn.getAttribute('data-safe-id'));
        openEditModal(rawId);
      });
    });

    document.querySelectorAll('.btn-del-ch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const rawId = decodeURIComponent(btn.getAttribute('data-safe-id'));
        deleteChannel(rawId);
      });
    });
  }

  // Play Stream in Admin Player
  function playAdminStream(channelId) {
    const ch = allChannels.find(c => String(c.id) === String(channelId));
    if (!ch || !ch.stream_url) {
      alert("Channel has no stream URL!");
      return;
    }

    if (ch.stream_url.includes('youtube.com') || ch.stream_url.includes('youtu.be')) {
      window.open(ch.stream_url, '_blank');
      return;
    }

    adminPlayerWrapper.style.display = 'block';
    adminPlayingChannelTitle.textContent = ch.name;
    adminStreamStatusBadge.innerHTML = '● Connecting Stream...';
    adminStreamStatusBadge.style.background = 'rgba(255,255,255,0.25)';

    adminPlayerWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      if (adminHlsInstance) {
        adminHlsInstance.destroy();
      }
      adminHlsInstance = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      adminHlsInstance.loadSource(ch.stream_url);
      adminHlsInstance.attachMedia(adminVideoPlayer);
      
      adminHlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        adminVideoPlayer.play().then(() => {
          adminStreamStatusBadge.innerHTML = '● Live Playing';
          adminStreamStatusBadge.style.background = '#15803d';
        }).catch(e => {
          adminVideoPlayer.muted = true;
          adminVideoPlayer.play();
          adminStreamStatusBadge.innerHTML = '● Muted Autoplay';
        });
      });

      adminHlsInstance.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          adminStreamStatusBadge.innerHTML = '⚠️ Stream Error / Offline';
          adminStreamStatusBadge.style.background = '#b91c1c';
        }
      });
    } else if (adminVideoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
      adminVideoPlayer.src = ch.stream_url;
      adminVideoPlayer.play().then(() => {
        adminStreamStatusBadge.innerHTML = '● Live Playing';
        adminStreamStatusBadge.style.background = '#15803d';
      }).catch(() => {
        adminStreamStatusBadge.innerHTML = '⚠️ Stream Error / Offline';
        adminStreamStatusBadge.style.background = '#b91c1c';
      });
    } else {
      alert("HLS playback is not supported in this browser.");
    }
  }

  // Close Admin Player
  if (btnCloseAdminPlayer) {
    btnCloseAdminPlayer.addEventListener('click', () => {
      if (adminHlsInstance) {
        adminHlsInstance.destroy();
        adminHlsInstance = null;
      }
      adminVideoPlayer.pause();
      adminVideoPlayer.src = '';
      adminPlayerWrapper.style.display = 'none';
    });
  }

  // Filter Listeners
  adminSearchInput.addEventListener('input', () => {
    currentPage = 1;
    filterAndRenderTable();
  });
  adminGenreSelect.addEventListener('change', () => {
    currentPage = 1;
    filterAndRenderTable();
  });
  adminCountrySelect.addEventListener('change', () => {
    currentPage = 1;
    filterAndRenderTable();
  });

  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderTablePage();
    }
  });

  btnNextPage.addEventListener('click', () => {
    const totalPages = Math.ceil(filteredChannels.length / pageSize);
    if (currentPage < totalPages) {
      currentPage++;
      renderTablePage();
    }
  });

  // Copy M3U Link
  const btnCopyM3uLink = document.getElementById('btnCopyM3uLink');
  if (btnCopyM3uLink) {
    btnCopyM3uLink.addEventListener('click', () => {
      const playlistUrl = `${location.origin}/playlist.m3u`;
      navigator.clipboard.writeText(playlistUrl).then(() => {
        alert(`📋 M3U Playlist Link copied to clipboard:\n\n${playlistUrl}\n\nYou can paste this link into VLC Media Player, TiviMate, IPTV Smarters, OTT Navigator, or any M3U player!`);
      }).catch(() => {
        prompt("Copy your live M3U playlist link:", playlistUrl);
      });
    });
  }

  // Modal Handling
  function openEditModal(channelId) {
    const ch = allChannels.find(c => String(c.id) === String(channelId));
    if (!ch) {
      alert("Could not locate channel record for ID: " + channelId);
      return;
    }

    modalTitle.textContent = `Edit Channel: ${ch.name}`;
    editChannelId.value = String(ch.id);
    editName.value = ch.name || "";
    
    let genreFound = false;
    for (let opt of editGenre.options) {
      if (opt.value === ch.genre) {
        genreFound = true;
        break;
      }
    }
    if (!genreFound && ch.genre) {
      const newOpt = document.createElement('option');
      newOpt.value = ch.genre;
      newOpt.textContent = ch.genre;
      editGenre.appendChild(newOpt);
    }
    editGenre.value = ch.genre || "Entertainment";

    editCountry.value = ch.country || "India";
    editStreamUrl.value = ch.stream_url || "";
    editThumbnail.value = ch.thumbnail || "";

    if (ch.thumbnail) {
      previewLogo.src = ch.thumbnail;
      previewLogo.style.display = "block";
    } else {
      previewLogo.style.display = "none";
    }

    editModal.style.display = 'flex';
  }

  btnAddNewChannel.addEventListener('click', () => {
    modalTitle.textContent = "Add New Channel";
    editChannelId.value = "new_" + Date.now();
    editName.value = "";
    editGenre.value = "Entertainment";
    editCountry.value = "India";
    editStreamUrl.value = "";
    editThumbnail.value = "";
    previewLogo.style.display = "none";
    editModal.style.display = 'flex';
  });

  function closeModal() {
    editModal.style.display = 'none';
  }

  if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeModal);
  if (btnCloseModalX) btnCloseModalX.addEventListener('click', closeModal);

  editThumbnail.addEventListener('input', () => {
    if (editThumbnail.value.trim()) {
      previewLogo.src = editThumbnail.value.trim();
      previewLogo.style.display = "block";
    } else {
      previewLogo.style.display = "none";
    }
  });

  btnSaveChannel.addEventListener('click', () => {
    const id = editChannelId.value;
    const name = editName.value.trim();
    const genre = editGenre.value.trim();
    const country = editCountry.value.trim();
    const stream_url = editStreamUrl.value.trim();
    const thumbnail = editThumbnail.value.trim();

    if (!name || !stream_url) {
      alert("Channel Name and Stream URL are required!");
      return;
    }

    let existing = allChannels.find(c => String(c.id) === String(id));
    if (existing) {
      existing.name = name;
      existing.genre = genre;
      existing.country = country;
      existing.stream_url = stream_url;
      existing.thumbnail = thumbnail;
    } else {
      const newCh = {
        id: id,
        name: name,
        genre: genre,
        country: country,
        stream_url: stream_url,
        stream_from: stream_url.includes('youtube') ? 'youtube' : 'hls',
        thumbnail: thumbnail,
        poster: ''
      };
      allChannels.unshift(newCh);
    }

    closeModal();
    statChannelCount.textContent = `● ${allChannels.length.toLocaleString()} Channels (unsaved edits)`;
    populateFilterDropdowns();
    filterAndRenderTable();
  });

  function deleteChannel(channelId) {
    const ch = allChannels.find(c => String(c.id) === String(channelId));
    if (!ch) return;

    if (confirm(`Are you sure you want to delete channel "${ch.name}"?`)) {
      allChannels = allChannels.filter(c => String(c.id) !== String(channelId));
      statChannelCount.textContent = `● ${allChannels.length.toLocaleString()} Channels (unsaved edits)`;
      populateFilterDropdowns();
      filterAndRenderTable();
    }
  }

  // Save & Publish Database to Firebase Firestore (Protected by Firebase Auth)
  btnSaveGithub.addEventListener('click', async () => {
    if (!window.firebaseAuth || !window.firebaseAuth.auth.currentUser) {
      alert("Please login via Firebase Admin Authentication first.");
      return;
    }

    btnSaveGithub.disabled = true;
    btnSaveGithub.textContent = "Publishing to Firebase...";

    try {
      if (window.firebaseDb) {
        const { db, doc, setDoc } = window.firebaseDb;
        const docRef = doc(db, "metadata", "channels");
        await setDoc(docRef, {
          channels: allChannels,
          updated_at: new Date().toISOString()
        });
        statChannelCount.textContent = `● ${allChannels.length.toLocaleString()} Channels`;
        alert(`🎉 SUCCESS! ${allChannels.length.toLocaleString()} channels published live! All Web & App users will see your updates instantly.`);
      } else {
        throw new Error("Firebase Firestore SDK not loaded");
      }
    } catch (e) {
      alert(`Publish Error: ${e.message}`);
    } finally {
      btnSaveGithub.disabled = false;
      btnSaveGithub.textContent = "💾 Save & Publish Database";
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  initFirebaseAuth();

})();
