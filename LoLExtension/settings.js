document.addEventListener('DOMContentLoaded', async () => {
    const $ = id => document.getElementById(id);
    const apiToggle = $('apiProviderToggle');
    const ws = $('windowState');
    const sp = $('streamProvider');
    const rpt = $('removePlayerToggle');
    const fft = $('forceFixToggle');
    const dt = $('debugToggle');
    const pi = $('pollInterval');
    const piv = $('pollIntervalVal');
    const statusMsg = $('statusMsg');

    $('closeLink').addEventListener('click', () => window.close());

    const storage = await chrome.storage.local.get(['apiProvider', 'windowState', 'provider', 'removePlayerEnabled', 'forceFixEnabled', 'pollInterval', 'debugMode']);

    for (const p of getAllProviders()) {
        const btn = document.createElement('button');
        btn.className = 'tog-opt' + (p.id === (storage.apiProvider || 'official') ? ' active' : '');
        btn.dataset.providerId = p.id;
        btn.textContent = p.name;
        btn.addEventListener('click', async () => {
            apiToggle.querySelectorAll('.tog-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            await chrome.storage.local.set({ apiProvider: p.id });
            chrome.runtime.sendMessage({ action: 'switchProvider', providerId: p.id }, (r) => {
                showStatus(r?.success ? `Switched to ${r.provider}` : `Error: ${r?.error}`, r?.success);
            });
        });
        apiToggle.appendChild(btn);
    }

    ws.value = storage.windowState || 'normal';
    ws.addEventListener('change', () => {
        chrome.storage.local.set({ windowState: ws.value });
        showStatus('Saved', true);
    });

    sp.value = storage.provider || 'twitch';
    sp.addEventListener('change', () => {
        chrome.storage.local.set({ provider: sp.value });
        showStatus('Saved', true);
    });

    rpt.checked = storage.removePlayerEnabled || false;
    rpt.addEventListener('change', () => {
        const en = rpt.checked;
        chrome.storage.local.set({ removePlayerEnabled: en });
        chrome.runtime.sendMessage({ action: 'togglePlayerRemoval', enabled: en });
        showStatus(en ? 'Player removal on' : 'Player removal off', true);
    });

    if (fft) {
        fft.checked = storage.forceFixEnabled ?? true;
        fft.addEventListener('change', () => {
            const en = fft.checked;
            chrome.storage.local.set({ forceFixEnabled: en });
            showStatus(en ? 'Drops fix enabled' : 'Drops fix disabled', true);
        });
    }

    dt.checked = storage.debugMode || false;
    dt.addEventListener('change', () => {
        const en = dt.checked;
        chrome.runtime.sendMessage({ action: 'setDebugMode', enabled: en }, (r) => {
            showStatus(en ? 'Debug logging on' : 'Debug logging off', true);
        });
    });

    const pollVal = storage.pollInterval || 3;
    pi.value = pollVal;
    piv.textContent = pollVal + 'm';
    pi.addEventListener('input', () => { piv.textContent = pi.value + 'm'; });
    pi.addEventListener('change', () => {
        const v = parseInt(pi.value);
        chrome.runtime.sendMessage({ action: 'updatePollInterval', interval: v }, () => {
            showStatus(`Polling every ${v}m`, true);
        });
    });

    function showStatus(msg, ok) {
        statusMsg.textContent = msg;
        statusMsg.className = 'status' + (ok ? ' ok' : '');
        setTimeout(() => { statusMsg.textContent = ''; statusMsg.className = 'status'; }, 2500);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
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
                apiToggle.querySelectorAll('.tog-opt').forEach(b => {
                    b.classList.toggle('active', b.dataset.providerId === changes.apiProvider.newValue);
                });
            }
        }
    });
});
