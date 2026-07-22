document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const leagueListEl = $('leagueList');
  const liveBadge = $('liveBadge');
  const refreshBtn = $('refreshBtn');
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    leagues: $('panelLeagues'),
    drops: $('panelDrops'),
    settings: $('panelSettings'),
    stats: $('panelStats'),
    about: $('panelAbout')
  };

  function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    Object.entries(panels).forEach(([k, p]) => p.classList.toggle('active', k === name));
    if (name === 'stats') refreshStats();
    if (name === 'drops') {
        refreshDrops();
        chrome.tabs.query({ url: 'https://lolesports.com/*' }, tabs => {
            if (tabs.length) chrome.tabs.sendMessage(tabs[0].id, { action: 'enrich-drops' });
        });
    }
  }
  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  const storage = await chrome.storage.local.get(['excludedLeagues','apiProvider','windowState','provider','removePlayerEnabled','forceFixEnabled','pollInterval','debugMode']);
  const excludedLeagues = new Set(storage.excludedLeagues || []);
  let apiProviderId = storage.apiProvider || 'official';
  let leagueStatus = {};
  let providerLeagueList = {};

  function relTime(iso) {
    if (!iso) return '';
    const diff = new Date(iso) - Date.now();
    if (diff < 0) return '';
    const m = Math.floor(diff/60000), h = Math.floor(m/60), d = Math.floor(h/24);
    if (d>0) return `in ${d}d ${h%24}h`;
    if (h>0) return `in ${h}h ${m%60}m`;
    return `in ${m}m`;
  }

  function getFromStorage(key, def) {
    return new Promise(r => chrome.storage.local.get([key], res => r(res[key]??def)));
  }

  async function openLeague(leagueName) {
    const resolved = resolveLeagueName(leagueName);
    const s = leagueStatus[resolved] || leagueStatus[leagueName];
    if (s?.url) {
      const state = await getFromStorage('windowState','normal');
      chrome.windows.create({ url: s.url, state });
    }
  }

  async function fetchPopupData() {
    return new Promise(r => chrome.runtime.sendMessage({action:'getPopupData',providerId:apiProviderId}, r));
  }

  async function fetchStats() {
    return new Promise(r => chrome.runtime.sendMessage({action:'getStats'}, r));
  }

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.style.opacity = '.5';
    chrome.runtime.sendMessage({ action:'forceRefresh' }, async () => {
      await refreshPopup();
      refreshBtn.style.opacity = '1';
    });
  });

  function createLeagueRow(leagueName) {
    const row = document.createElement('div');
    row.className = 'league';

    const info = document.createElement('div');
    info.className = 'league-l';
    const nameRow = document.createElement('div');
    nameRow.className = 'league-n';

    const resolved = resolveLeagueName(leagueName);
    const ls = leagueStatus[resolved] || leagueStatus[leagueName];
    if (ls?.state === 'live') {
      const dot = document.createElement('span');
      dot.className = 'dot live';
      nameRow.appendChild(dot);
      const lbl = document.createElement('span');
      lbl.style.cssText = 'color:#ef5350;font-weight:700;font-size:10px';
      lbl.textContent = 'LIVE';
      nameRow.appendChild(lbl);
      nameRow.append(leagueName);
    } else if (ls?.state === 'upcoming') {
      nameRow.textContent = leagueName;
      const t = relTime(ls.startTime);
      if (t) {
        const time = document.createElement('span');
        time.style.cssText = 'color:#888;font-size:11px;margin-left:auto';
        time.textContent = t;
        nameRow.appendChild(time);
      }
    } else {
      nameRow.textContent = leagueName;
    }

    info.appendChild(nameRow);

    const tog = document.createElement('button');
    tog.className = 'tgl';
    const excl = excludedLeagues.has(leagueName);
    tog.textContent = excl ? 'OFF' : 'ON';
    tog.classList.add(excl ? 'off' : 'on');
    tog.addEventListener('click', e => {
      e.stopPropagation();
      if (excludedLeagues.has(leagueName)) {
        excludedLeagues.delete(leagueName);
        tog.textContent = 'ON'; tog.className = 'tgl on';
      } else {
        excludedLeagues.add(leagueName);
        tog.textContent = 'OFF'; tog.className = 'tgl off';
      }
      chrome.storage.local.set({ excludedLeagues: [...excludedLeagues] });
    });

    row.addEventListener('click', () => openLeague(leagueName));
    row.appendChild(info);
    row.appendChild(tog);
    return row;
  }

  function renderLeagues() {
    leagueListEl.innerHTML = '';
    let totalLive = 0;

    for (const tier of LEAGUE_TIERS) {
      const group = document.createElement('div');
      group.className = 'tier';

      const hdr = document.createElement('div');
      hdr.className = 'tier-hdr';
      const liveInTier = tier.leagues.filter(l => leagueStatus[l]?.state === 'live').length;
      totalLive += liveInTier;
      const suffix = liveInTier ? ` (${tier.leagues.length}) \u25CF ${liveInTier} live` : ` (${tier.leagues.length})`;
      hdr.innerHTML = `<span>${tier.name}${suffix}</span><span class="arrow">\u25BC</span>`;

      const body = document.createElement('div');
      body.className = 'tier-body';

      for (const leagueName of tier.leagues) {
        body.appendChild(createLeagueRow(leagueName));
      }

      if (!tier.leagues.length) body.innerHTML = '<div style="padding:10px 24px;color:#888;font-size:11px">No leagues</div>';

      hdr.addEventListener('click', () => {
        hdr.classList.toggle('collapsed');
        body.classList.toggle('collapsed');
      });
      group.appendChild(hdr);
      group.appendChild(body);
      leagueListEl.appendChild(group);
    }

    // Dynamically add leagues from provider that aren't in any tier
    if (providerLeagueList && Object.keys(providerLeagueList).length) {
      const tieredNames = new Set();
      for (const tier of LEAGUE_TIERS) {
        for (const l of tier.leagues) tieredNames.add(l);
      }
      // Also add aliases: if a tier has "North Regional League", resolve "LRN" -> "North Regional League" so it's covered
      for (const [alias, canonical] of Object.entries(LEAGUE_ALIASES)) {
        if (tieredNames.has(canonical)) tieredNames.add(alias);
      }

      const unknown = Object.keys(providerLeagueList).filter(name => !tieredNames.has(name)).sort();
      if (unknown.length) {
        const group = document.createElement('div');
        group.className = 'tier';

        const hdr = document.createElement('div');
        hdr.className = 'tier-hdr';
        const liveInTier = unknown.filter(l => leagueStatus[l]?.state === 'live').length;
        totalLive += liveInTier;
        const suffix = liveInTier ? ` (${unknown.length}) \u25CF ${liveInTier} live` : ` (${unknown.length})`;
        hdr.innerHTML = `<span>Other${suffix}</span><span class="arrow">\u25BC</span>`;

        const body = document.createElement('div');
        body.className = 'tier-body';

        for (const leagueName of unknown) {
          body.appendChild(createLeagueRow(leagueName));
        }

        hdr.addEventListener('click', () => {
          hdr.classList.toggle('collapsed');
          body.classList.toggle('collapsed');
        });
        group.appendChild(hdr);
        group.appendChild(body);
        leagueListEl.appendChild(group);
      }
    }

    if (totalLive > 0) {
      liveBadge.style.display = 'inline';
      liveBadge.textContent = totalLive;
    } else {
      liveBadge.style.display = 'none';
    }
  }

  const dropsListEl = $('dropsList');
  const dropsBadge = $('dropsBadge');

  function getBrightColor(colors) {
    if (!colors || !colors.length) return '#c89b3c';
    for (const hex of colors) {
      if (!hex || hex.length < 7) continue;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (luma > 40) return hex; // sufficiently bright for dark mode
    }
    return '#c89b3c'; // fallback gold
  }

  function renderJsonTree(obj, key = null, depth = 0) {
    if (obj === null || obj === undefined) return `<span class="jv-null">null</span>`;
    if (typeof obj === 'boolean') return `<span class="jv-bool">${obj}</span>`;
    if (typeof obj === 'number') return `<span class="jv-num">${obj}</span>`;
    if (typeof obj === 'string') {
      try {
        const parsed = JSON.parse(obj);
        if (typeof parsed === 'object' && parsed !== null) {
          return renderJsonTree(parsed, key, depth);
        }
      } catch(e) {}
      const max = 80;
      const val = obj.length > max ? obj.slice(0, max) + '...' : obj;
      return `<span class="jv-str">"${escapeHtml(val)}"</span>`;
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) return `<span class="jv-bracket">[ ]</span>`;
      const id = `jv-${depth}-${Math.random().toString(36).slice(2, 6)}`;
      const items = obj.map((v, i) => {
        const rendered = renderJsonTree(v, null, depth + 1);
        return `<div class="jv-line" style="padding-left:${(depth + 1) * 8}px"><span class="jv-idx">${i}</span>: ${rendered}</div>`;
      }).join('');
      return `<span class="jv-toggle" data-target="${id}">▼</span><span class="jv-bracket">[</span><span class="jv-count">${obj.length}</span><span class="jv-bracket">]</span><div class="jv-children" id="${id}">${items}</div>`;
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return `<span class="jv-bracket">{ }</span>`;
      const id = `jv-${depth}-${Math.random().toString(36).slice(2, 6)}`;
      const items = keys.map(k => {
        const rendered = renderJsonTree(obj[k], k, depth + 1);
        return `<div class="jv-line" style="padding-left:${(depth + 1) * 8}px"><span class="jv-key">"${escapeHtml(k)}"</span>: ${rendered}</div>`;
      }).join('');
      return `<span class="jv-toggle" data-target="${id}">▼</span><span class="jv-bracket">{</span><span class="jv-count">${keys.length}</span><span class="jv-bracket">}</span><div class="jv-children" id="${id}">${items}</div>`;
    }
    return '';
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  document.addEventListener('click', e => {
    const toggle = e.target.closest('.jv-toggle');
    if (toggle) {
      const target = document.getElementById(toggle.dataset.target);
      if (target) {
        target.classList.toggle('jv-collapsed');
        toggle.textContent = target.classList.contains('jv-collapsed') ? '▶' : '▼';
      }
    }
  });

  async function refreshDrops() {
    const res = await getFromStorage('drops', []);
    if (res.length > 0) {
      dropsBadge.style.display = 'inline';
      dropsBadge.textContent = res.length;
    } else {
      dropsBadge.style.display = 'none';
    }

    if (!panels.drops.classList.contains('active')) return;

    if (res.length === 0) {
      dropsListEl.innerHTML = '<div style="text-align:center;color:#666;font-size:12px;padding:20px;">No drops caught yet. Watch some games!</div>';
      return;
    }

    dropsListEl.innerHTML = '';
    dropsListEl.style.padding = '12px 16px';

    const sorted = [...res].sort((a, b) => (b.payload.timestamp || b.ts * 1000) - (a.payload.timestamp || a.ts * 1000));

    const groups = {};
    for (const drop of sorted) {
      const d = new Date(drop.payload.timestamp || drop.ts * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(drop);
    }

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const dateKeys = Object.keys(groups).sort().reverse();

    const topBar = document.createElement('div');
    topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    topBar.innerHTML = '<span style="font-size:11px;color:#666;">Drops caught during your sessions will appear here.</span>';
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-drops-btn';
    clearBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" style="stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Clear all';
    clearBtn.addEventListener('click', () => chrome.storage.local.set({ drops: [] }));
    topBar.appendChild(clearBtn);
    dropsListEl.appendChild(topBar);

    for (const dateKey of dateKeys) {
      let label;
      if (dateKey === todayKey) label = 'Today';
      else if (dateKey === yesterdayKey) label = 'Yesterday';
      else {
        const d = new Date(dateKey + 'T12:00:00');
        label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      }

      const groupHdr = document.createElement('div');
      groupHdr.className = 'drop-date-hdr';
      groupHdr.innerHTML = `<span>${label}</span><span class="drop-date-count">${groups[dateKey].length}</span>`;
      dropsListEl.appendChild(groupHdr);

      for (const drop of groups[dateKey]) {
        let payloadObj = {};
        try { payloadObj = JSON.parse(drop.payload.payload); } catch(e){}

        const det = drop.details;
        const inv = det?.inventory?.[0];
        const item = inv?.localizedInventory?.inventory;
        const title = inv?.localizedInventory?.title?.en_US || item?.internalTitle || 'Esports Reward';
        const desc = inv?.localizedInventory?.description?.en_US || det?.dropsetDescription || '';
        const itemImg = item?.imageUrl || payloadObj.message?.p || '';
        const sponsorImg = det?.sponsorImages?.notificationUrl || payloadObj.message?.s || '';
        const rawColors = payloadObj.message?.c || [];
        const brightColor = getBrightColor(rawColors);
        const gradientStart = rawColors[0] || '#111111';
        const gradientEnd = rawColors[1] || gradientStart;
        
        const timeStr = new Date(drop.payload.timestamp || drop.ts * 1000).toLocaleString();
        const leagueName = (drop.league || drop.url?.split('/')[2] || 'Unknown').replace(/_/g, ' ');

        const card = document.createElement('div');
        card.className = 'drop-card';

        const hdr = document.createElement('div');
        hdr.className = 'drop-hdr';
        hdr.style.borderLeft = `4px solid ${brightColor}`;
        hdr.innerHTML = `
          <div class="drop-hdr-left">
            <div class="drop-title">
              ${sponsorImg ? `<img src="${sponsorImg}" class="sponsor-logo">` : ''}
              <span>${leagueName} Drop</span>
            </div>
            ${det?.sponsor && !sponsorImg ? `<span style="font-size:10px;color:#888;margin-top:2px;">${det.sponsor}</span>` : ''}
          </div>
          <div class="drop-time">${timeStr}</div>
        `;

        const body = document.createElement('div');
        body.className = 'drop-body';
        
        body.innerHTML = `
          <div class="drop-body-bg" style="background: linear-gradient(135deg, ${gradientStart}, ${gradientEnd});"></div>
          <div class="drop-content">
            ${itemImg ? `<img class="reward-img" src="${itemImg}">` : `<div class="reward-img" style="background:#222;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎁</div>`}
            <div class="reward-details">
              <div class="reward-name" style="color:${brightColor}; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">${title}</div>
              ${desc ? `<div style="font-size:10px;color:#999;margin-top:1px;">${desc}</div>` : ''}
              ${det?.dropsetTitle ? `<div style="font-size:11px;color:#aaa;margin-top:2px;">${det.dropsetTitle}</div>` : ''}
              <div class="reward-path">${drop.url || 'Unknown Path'}</div>
            </div>
          </div>
          <div class="raw-toggle"><span>View Technical Data</span> <span>▼</span></div>
          <div class="raw-container">
            <div class="drop-raw">${renderJsonTree(drop)}</div>
            <button class="copy-btn" title="Copy to clipboard">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        `;

        hdr.addEventListener('click', () => {
          body.classList.toggle('open');
        });

        const rawToggle = body.querySelector('.raw-toggle');
        const rawContainer = body.querySelector('.raw-container');
        const copyBtn = body.querySelector('.copy-btn');
        
        rawToggle.addEventListener('click', () => {
          const isOpen = rawContainer.classList.toggle('open');
          rawToggle.innerHTML = isOpen ? '<span>Hide Technical Data</span> <span>▲</span>' : '<span>View Technical Data</span> <span>▼</span>';
        });

        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(JSON.stringify(drop, null, 2));
          copyBtn.innerHTML = '<svg viewBox="0 0 24 24" style="stroke:#3fb950"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          setTimeout(() => {
            copyBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
          }, 1500);
        });

        card.appendChild(hdr);
        card.appendChild(body);
        dropsListEl.appendChild(card);
      }
    }
  }

  function renderStats(data) {
    const grid = $('statsGrid');
    if (!data || !data.requestStats) {
      grid.innerHTML = '<div class="st-c w"><h4>Status</h4><div style="font-size:13px;color:#999">No data yet &mdash; wait for next poll</div></div>';
      return;
    }

    const rs = data.requestStats;
    const lg = data.leagues;
    const prov = rs.providers;

    const unknownCount = lg.total - lg.tierCount;
    const cards = [
      { title:'Live Matches', val: lg.live, cls:'re', sub: `${lg.upcoming} upcoming` },
      { title:'Active Leagues', val: lg.active, cls:'gr', sub: `${lg.excluded} excluded of ${lg.total}` },
      { title:'Schedule Events', val: lg.scheduleEvents, cls:'bl', sub: 'In last poll' },
      { title:'Total Bandwidth', val: formatBytes(rs.total.bytes), cls:'', sub: `${rs.total.requests} requests` },
    ];
    if (unknownCount > 0) {
      cards.splice(2, 0, { title:'Leagues Mapped', val: lg.tierCount, cls:'', sub: `${unknownCount} unmapped from provider` });
    }

    grid.innerHTML = cards.map(c =>
      `<div class="st-c${c.wide?' w':''}"><h4>${c.title}</h4><div class="st-v${c.cls?' '+c.cls:''}">${c.val}</div><div class="st-s">${c.sub||''}</div></div>`
    ).join('') +
    `<div class="st-c w"><h4>Bandwidth by Provider</h4>
      ${Object.entries(prov).map(([id,p]) =>
        `<div class="st-p"><span class="pn">${p.label}</span><span class="pb">${formatBytes(p.bytes)} (${p.requests} req)</span></div>`
      ).join('')}
    </div>`;
  }

  async function refreshPopup() {
    const data = await fetchPopupData();
    if (data) {
      apiProviderId = data.providerId || 'official';
      leagueStatus = data.leagueStatus || {};
      providerLeagueList = data.leagueList || {};
    }
    renderLeagues();
    refreshDrops();
  }

  async function refreshStats() {
    const data = await fetchStats();
    renderStats(data);
  }

  await refreshPopup();

  // Settings
  const apiToggle = $('apiProviderToggle');
  const ws = $('windowState');
  const sp = $('streamProvider');
  const rpt = $('removePlayerToggle');
  const fft = $('forceFixToggle');
  const dt = $('debugToggle');
  const pi = $('pollInterval');
  const piv = $('pollIntervalVal');
  const ss = $('settingsStatus');

  chrome.runtime.sendMessage({ action:'getProviders' }, (res) => {
    if (res && res.providers) {
      for (const p of res.providers) {
        const btn = document.createElement('button');
        btn.className = 'to' + (p.id===apiProviderId?' active':'');
        btn.dataset.id = p.id;
        btn.textContent = p.name;
        btn.addEventListener('click', async () => {
          apiToggle.querySelectorAll('.to').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          apiProviderId = p.id;
          await chrome.storage.local.set({ apiProvider: p.id });
          chrome.runtime.sendMessage({ action:'switchProvider', providerId: p.id });
          showStatus('Switching \u2014 refreshing...');
          chrome.runtime.sendMessage({ action:'forceRefresh' }, async () => {
            await refreshPopup();
            showStatus('Switched to ' + p.name);
          });
        });
        apiToggle.appendChild(btn);
      }
    }
  });

  ws.value = storage.windowState || 'normal';
  ws.addEventListener('change', () => {
    chrome.storage.local.set({ windowState: ws.value });
    showStatus('Saved');
  });

  sp.value = storage.provider || 'twitch';
  sp.addEventListener('change', () => {
    chrome.storage.local.set({ provider: sp.value });
    showStatus('Saved');
  });

  rpt.checked = storage.removePlayerEnabled || false;
  rpt.addEventListener('change', () => {
    const en = rpt.checked;
    chrome.storage.local.set({ removePlayerEnabled: en });
    chrome.runtime.sendMessage({ action:'togglePlayerRemoval', enabled: en });
    showStatus(en ? 'Player removal on' : 'Player removal off');
  });

  if (fft) {
    fft.checked = storage.forceFixEnabled ?? true;
    fft.addEventListener('change', () => {
      const en = fft.checked;
      chrome.storage.local.set({ forceFixEnabled: en });
      showStatus(en ? 'Drops fix enabled' : 'Drops fix disabled');
    });
  }

  dt.checked = storage.debugMode || false;
  dt.addEventListener('change', () => {
    const en = dt.checked;
    chrome.runtime.sendMessage({ action:'setDebugMode', enabled: en }, (r) => {
      showStatus(en ? 'Debug logging on' : 'Debug logging off');
    });
  });

  const pollVal = storage.pollInterval || 3;
  pi.value = pollVal;
  piv.textContent = pollVal + 'm';
  pi.addEventListener('input', () => { piv.textContent = pi.value + 'm'; });
  pi.addEventListener('change', () => {
    const v = parseInt(pi.value);
    chrome.runtime.sendMessage({ action:'updatePollInterval', interval: v }, () => {
      showStatus(`Polling every ${v}m`);
    });
  });

  function showStatus(msg) {
    ss.textContent = msg;
    ss.classList.add('ok');
    setTimeout(() => { ss.textContent = ''; ss.classList.remove('ok'); }, 2000);
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.drops) refreshDrops();
      if (changes.windowState) ws.value = changes.windowState.newValue;
      if (changes.provider) sp.value = changes.provider.newValue;
      if (changes.removePlayerEnabled) rpt.checked = changes.removePlayerEnabled.newValue;
      if (changes.forceFixEnabled && fft) fft.checked = changes.forceFixEnabled.newValue;
      if (changes.debugMode) dt.checked = changes.debugMode.newValue;
      if (changes.pollInterval) {
        pi.value = changes.pollInterval.newValue;
        piv.textContent = changes.pollInterval.newValue + 'm';
      }
      if (changes.apiProvider) {
        apiProviderId = changes.apiProvider.newValue;
        apiToggle.querySelectorAll('.to').forEach(b => {
          b.classList.toggle('active', b.dataset.id === apiProviderId);
        });
      }
    }
  });

  setInterval(async () => {
    if (panels.stats.classList.contains('active')) await refreshStats();
  }, 5000);
});

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}
