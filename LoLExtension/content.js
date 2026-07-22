console.log("League Watcher Content Script Loaded!");

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "togglePlayerRemoval") {
        if (message.enabled) {
            console.log("Player Removal ENABLED.");
            enablePlayerRemoval();
        } else {
            console.log("Player Removal DISABLED.");
            removeListeners();
        }
    }
});

const HOMEPAGE_PLAYER_SECTION = 'section[data-tag="media"]';
const LIVE_PLAYER = "#video-player";
const REWARDS_BUTTON = '.status-summary[role="button"]';
const OBSERVER_TIMEOUT = 30000;

let currentObserver = null;
let currentObserverTimeout = null;
let urlCheckInterval = null;

function disconnectObserver() {
    if (currentObserverTimeout) {
        clearTimeout(currentObserverTimeout);
        currentObserverTimeout = null;
    }
    if (currentObserver) {
        currentObserver.disconnect();
        currentObserver = null;
    }
}

function waitForElement(selector, callback) {
    if (document.querySelector(selector)) { callback(); return; }
    disconnectObserver();
    const root = document.querySelector('#__next') || document.body || document.documentElement;
    currentObserver = new MutationObserver((mutations, obs) => {
        if (document.querySelector(selector)) {
            callback();
            disconnectObserver();
        }
    });
    currentObserver.observe(root, { childList: true, subtree: true });
    currentObserverTimeout = setTimeout(disconnectObserver, OBSERVER_TIMEOUT);
}

function removeHomepagePlayer() {
    const section = document.querySelector(HOMEPAGE_PLAYER_SECTION);
    if (section) { section.remove(); console.log("Removed homepage player section"); }
}

function removeLivePlayer() {
    const player = document.querySelector(LIVE_PLAYER);
    if (player) { player.remove(); console.log("Removed live video player"); }
}

function enablePlayerRemoval() {
    disconnectObserver();
    if (location.href.startsWith("https://lolesports.com/live/")) {
        waitForElement(REWARDS_BUTTON, removeLivePlayer);
    } else if (location.href.startsWith("https://lolesports.com")) {
        waitForElement(HOMEPAGE_PLAYER_SECTION, removeHomepagePlayer);
    }
    if (!urlCheckInterval) {
        let lastUrl = location.href;
        urlCheckInterval = setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(enablePlayerRemoval, 1500);
            }
        }, 2000);
    }
}

function removeListeners() {
    disconnectObserver();
    if (urlCheckInterval) { clearInterval(urlCheckInterval); urlCheckInterval = null; }
}

chrome.storage.local.get(["removePlayerEnabled", "forceFixEnabled", "debugMode"], (data) => {
    if (data.removePlayerEnabled) enablePlayerRemoval();
    
    window.postMessage({ 
        type: 'LOL_WATCHER_CONFIG', 
        config: { forceFixEnabled: data.forceFixEnabled ?? true, debugMode: !!data.debugMode } 
    }, '*');
});

// Drop Tracking & Webpack/Fetch Interceptors
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
document.documentElement.appendChild(script);
script.remove();

// Retroactively enrich drops missing details (triggered via message from popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enrich-drops') {
        chrome.storage.local.get({ drops: [] }, async (res) => {
            const drops = res.drops || [];
            let count = 0;
            for (let i = 0; i < drops.length; i++) {
                if (drops[i].details) continue;
                try {
                    const inner = JSON.parse(drops[i].payload.payload);
                    const dropId = inner.message?.i;
                    if (!dropId) continue;
                    window.postMessage({ type: 'LOL_WATCHER_FETCH_DETAILS', dropId }, '*');
                    count++;
                } catch (e) {}
            }
            console.log("[LoL Watcher] Requested enrichment for", count, "drops.");
            sendResponse({ requested: count });
        });
        return true;
    }
});

window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'LOL_WATCHER_STATUS') {
        chrome.storage.local.set({ injectStatus: event.data.status });
        console.log("[LoL Watcher] Inject status:", event.data.status);
        return;
    }

    if (event.data?.type === 'LOL_DROP_DETAILS') {
        chrome.storage.local.get({ drops: [] }, (res) => {
            const updated = (res.drops || []).map(d => {
                try {
                    const inner = JSON.parse(d.payload.payload);
                    if (inner.message?.i === event.data.dropId) return { ...d, details: event.data.details };
                } catch (e) {}
                return d;
            });
            chrome.storage.local.set({ drops: updated });
            console.log("[LoL Watcher] Drop enriched with details via page fetch.");
        });
        return;
    }

    if (event.data?.type === 'NEW_LOL_DROP') {
        chrome.storage.local.get({ drops: [] }, (res) => {
            const drops = res.drops || [];
            try {
                const innerPayload = JSON.parse(event.data.drop.payload.payload);
                const isDuplicate = drops.some(d => {
                    try {
                        const existingInner = JSON.parse(d.payload.payload);
                        return existingInner.id === innerPayload.id;
                    } catch (e) { return false; }
                });
                
                if (!isDuplicate) {
                    drops.unshift(event.data.drop);
                    chrome.storage.local.set({ drops });
                    console.log("[LoL Watcher] Saved new unique drop to storage.");
                }
            } catch (e) {
                console.error("[LoL Watcher] Failed to parse drop for deduplication:", e);
            }
        });
    }
});

