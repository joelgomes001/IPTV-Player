// Admin Dashboard JavaScript Logic for JTBS IPTV
(function() {
  const ADMIN_PASS = "jtbs2026"; // Admin Password
  
  let allChannels = [];
  let filteredChannels = [];
  let currentPage = 1;
  const pageSize = 50;

  // DOM Elements
  const loginOverlay = document.getElementById('loginOverlay');
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
  const btnSaveChannel = document.getElementById('btnSaveChannel');

  // Check Login Session
  function checkSession() {
    const auth = sessionStorage.getItem('jtbs_admin_auth');
    if (auth === 'true') {
      loginOverlay.style.display = 'none';
      loadMasterDatabase();
    } else {
      loginOverlay.style.display = 'flex';
    }
  }

  // Handle Login
  btnLogin.addEventListener('click', () => {
    if (adminPasswordInput.value === ADMIN_PASS) {
      sessionStorage.setItem('jtbs_admin_auth', 'true');
      loginOverlay.style.display = 'none';
      loadMasterDatabase();
    } else {
      loginError.style.display = 'block';
    }
  });

  adminPasswordInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') btnLogin.click();
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('jtbs_admin_auth');
    location.reload();
  });

  // Load Database
  function loadMasterDatabase() {
    fetch(`channels.json?_t=${Date.now()}`, { cache: 'no-cache' })
      .then(r => r.json())
      .then(data => {
        allChannels = data;
        statChannelCount.textContent = `${allChannels.length.toLocaleString()} Channels`;
        populateFilterDropdowns();
        filterAndRenderTable();
      })
      .catch(e => {
        adminTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #ef4444;">Failed to load channels.json: ${e.message}</td></tr>`;
      });
  }

  function populateFilterDropdowns() {
    const genres = new Set();
    const countries = new Set();

    allChannels.forEach(c => {
      if (c.genre) genres.add(c.genre);
      if (c.country) countries.add(c.country);
    });

    // Populate Genre Filter
    adminGenreSelect.innerHTML = '<option value="All">All Genres</option>';
    Array.from(genres).sort().forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = g;
      adminGenreSelect.appendChild(opt);
    });

    // Populate Country Filter
    adminCountrySelect.innerHTML = '<option value="All">All Countries</option>';
    Array.from(countries).sort().forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      adminCountrySelect.appendChild(opt);
    });
  }

  function filterAndRenderTable() {
    const query = adminSearchInput.value.toLowerCase().trim();
    const selGenre = adminGenreSelect.value;
    const selCountry = adminCountrySelect.value;

    filteredChannels = allChannels.filter(c => {
      const matchQuery = !query || c.name.toLowerCase().includes(query) || (c.stream_url && c.stream_url.toLowerCase().includes(query));
      const matchGenre = selGenre === 'All' || c.genre === selGenre;
      const matchCountry = selCountry === 'All' || c.country === selCountry;
      return matchQuery && matchGenre && matchCountry;
    });

    currentPage = 1;
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
      adminTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #94a3b8;">No channels match the search filter.</td></tr>`;
      return;
    }

    let html = '';
    pageItems.forEach(ch => {
      const thumb = ch.thumbnail || 'logo.png';
      html += `
        <tr>
          <td><img src="${thumb}" class="channel-logo-img" onerror="this.src='logo.png'"></td>
          <td style="font-weight: 600;">${escapeHtml(ch.name)}</td>
          <td><span class="badge-genre">${escapeHtml(ch.genre || 'General')}</span></td>
          <td><span class="badge-country">${escapeHtml(ch.country || 'International')}</span></td>
          <td style="font-family: monospace; font-size: 0.85rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <a href="${escapeHtml(ch.stream_url)}" target="_blank" style="color: #38bdf8; text-decoration: none;">${escapeHtml(ch.stream_url)}</a>
          </td>
          <td style="text-align: center;">
            <button class="admin-btn btn-edit-ch" data-id="${ch.id}" style="width: auto; padding: 0.35rem 0.75rem; font-size: 0.85rem; margin-right: 0.4rem;">✏️ Edit</button>
            <button class="admin-btn admin-btn-danger btn-del-ch" data-id="${ch.id}" style="width: auto; padding: 0.35rem 0.75rem; font-size: 0.85rem;">🗑️</button>
          </td>
        </tr>
      `;
    });

    adminTableBody.innerHTML = html;

    // Attach row event listeners
    document.querySelectorAll('.btn-edit-ch').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    document.querySelectorAll('.btn-del-ch').forEach(btn => {
      btn.addEventListener('click', () => deleteChannel(btn.dataset.id));
    });
  }

  // Filter Listeners
  adminSearchInput.addEventListener('input', filterAndRenderTable);
  adminGenreSelect.addEventListener('change', filterAndRenderTable);
  adminCountrySelect.addEventListener('change', filterAndRenderTable);

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

  // Modal Handling
  function openEditModal(channelId) {
    const ch = allChannels.find(c => String(c.id) === String(channelId));
    if (!ch) return;

    modalTitle.textContent = "Edit Channel";
    editChannelId.value = ch.id;
    editName.value = ch.name || "";
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

    editModal.classList.add('active');
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
    editModal.classList.add('active');
  });

  btnCancelEdit.addEventListener('click', () => {
    editModal.classList.remove('active');
  });

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

    editModal.classList.remove('active');
    statChannelCount.textContent = `${allChannels.length.toLocaleString()} Channels`;
    filterAndRenderTable();
    alert("Channel saved locally in admin session! Click 'Save & Publish Database' to publish changes live.");
  });

  function deleteChannel(channelId) {
    const ch = allChannels.find(c => String(c.id) === String(channelId));
    if (!ch) return;

    if (confirm(`Are you sure you want to delete channel "${ch.name}"?`)) {
      allChannels = allChannels.filter(c => String(c.id) !== String(channelId));
      statChannelCount.textContent = `${allChannels.length.toLocaleString()} Channels`;
      filterAndRenderTable();
    }
  }

  // Copy M3U Playlist URL Listener
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

  // Helper to generate M3U content string
  function generateM3uContent(channelsList) {
    const lines = ["#EXTM3U"];
    channelsList.forEach((ch, idx) => {
      const name = ch.name || 'Live Channel';
      const genre = ch.genre || 'General';
      const country = ch.country || 'International';
      const logo = ch.thumbnail || '';
      const url = ch.stream_url || '';
      if (url) {
        const group = country !== 'International' ? `${country} - ${genre}` : genre;
        lines.push(`#EXTINF:-1 tvg-id="${ch.id || idx}" tvg-name="${name}" tvg-logo="${logo}" group-title="${group}",${name}`);
        lines.push(url);
      }
    });
    return lines.join('\n');
  }

  // Save & Publish Database Directly via GitHub API
  btnSaveGithub.addEventListener('click', async () => {
    const pat = prompt("Enter your GitHub Admin Access Token to publish live database changes instantly:");
    if (!pat) return;

    btnSaveGithub.disabled = true;
    btnSaveGithub.textContent = "Publishing Changes...";

    try {
      const repoPath = "joelgomes001/IPTV-Player";
      
      // Function to commit a file to GitHub
      async function commitFileToGithub(filePath, contentString, commitMessage) {
        const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${filePath}`;
        let sha = null;
        try {
          const getRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${pat}` } });
          if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
          }
        } catch(e) {}

        const bytes = new TextEncoder().encode(contentString);
        let binaryStr = '';
        for (let i = 0; i < bytes.length; i++) {
          binaryStr += String.fromCharCode(bytes[i]);
        }
        const base64Content = btoa(binaryStr);

        const payload = {
          message: commitMessage,
          content: base64Content
        };
        if (sha) payload.sha = sha;

        const putRes = await fetch(apiUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${pat}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!putRes.ok) {
          const errData = await putRes.json();
          throw new Error(errData.message || `Failed to commit ${filePath}`);
        }
      }

      // 1. Commit website/channels.json
      const jsonStr = JSON.stringify(allChannels, null, 2);
      await commitFileToGithub("website/channels.json", jsonStr, `Admin Portal: Update channels database (${allChannels.length} channels)`);

      // 2. Commit website/playlist.m3u
      const m3uStr = generateM3uContent(allChannels);
      await commitFileToGithub("website/playlist.m3u", m3uStr, `Admin Portal: Update playlist.m3u (${allChannels.length} channels)`);

      alert("🎉 SUCCESS! Master database and playlist.m3u published live to GitHub. Your live M3U playlist link & app have been updated!");
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
  checkSession();

})();
