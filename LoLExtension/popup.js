document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const leagueListEl = $('leagueList');
  const liveBadge = $('liveBadge');
  const refreshBtn = $('refreshBtn');
  const settingsBtn = $('settingsBtn');

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  const tabs = document.querySelectorAll('.tab');
  const panels = {
    leagues: $('panelLeagues'),
    settings: $('panelSettings'),
    stats: $('panelStats'),
    about: $('panelAbout')
  };

  function switchTab(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    Object.entries(panels).forEach(([k, p]) => p.classList.toggle('active', k === name));
    if (name === 'stats') refreshStats();
  }
  tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

  const storage = await chrome.storage.local.get(['excludedLeagues','apiProvider','windowState','provider','removePlayerEnabled','pollInterval','debugMode']);
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
      if (changes.windowState) ws.value = changes.windowState.newValue;
      if (changes.provider) sp.value = changes.provider.newValue;
      if (changes.removePlayerEnabled) rpt.checked = changes.removePlayerEnabled.newValue;
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
