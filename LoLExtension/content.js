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
    const root = document.querySelector('#__next') || document.body;
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

chrome.storage.local.get("removePlayerEnabled", (data) => {
    if (data.removePlayerEnabled) enablePlayerRemoval();
});
