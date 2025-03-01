console.log("League Watcher Content Script Loaded!");

chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "togglePlayerRemoval") {
        if (message.enabled) {
            console.log("Player Removal ENABLED.");
            enablePlayerRemoval();
        } else {
            console.log("Player Removal DISABLED.");
            disablePlayerRemoval();
        }
    }
});

// Selectors
const HOMEPAGE_PLAYER = "#video-player-placeholder";
const LIVE_PLAYER = "#video-player";
const REWARDS_BUTTON = '.status-summary[role="button"]';

function removeElement(selector, logMessage) {
    const element = document.querySelector(selector);
    if (element) {
        element.remove();
        console.log(logMessage);
    }
}

function observeAndRemove(selector, logMessage) {
    const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
            removeElement(selector, logMessage);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    removeElement(selector, logMessage); // Remove immediately if present
}

function waitForElement(selector, callback) {
    if (document.querySelector(selector)){
        callback();
    }
    const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector(selector)) {
            callback();
            obs.disconnect(); // Stop observing once found
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// Enable player removal when toggled on
function enablePlayerRemoval() {
    if (window.location.href.startsWith("https://lolesports.com/live/")) {
        console.log("On live match page, waiting for Rewards button...");
        waitForElement(REWARDS_BUTTON, () => {
            console.log("Rewards button detected, removing live video player...");
            removeElement(LIVE_PLAYER, "Removed live video player");
        });
    } else {
        console.log("On homepage, removing homepage video player...");
        observeAndRemove(HOMEPAGE_PLAYER, "Removed homepage video player");
    }
}

// Disable player removal when toggled off (nothing to restore, just stop observers)
function disablePlayerRemoval() {
    console.log("Player removal disabled, but elements won't be restored.");
}

// Apply settings on load
chrome.storage.local.get("removePlayerEnabled", (data) => {
    if (data.removePlayerEnabled) {
        enablePlayerRemoval();
    }
});
