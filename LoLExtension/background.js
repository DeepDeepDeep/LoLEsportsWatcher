importScripts('helpers.js');
importScripts('providers/official.js');
importScripts('providers/thirdparty.js');
importScripts('leagues/tiers.js');

const MATCH_WINDOW = 900 * 1000;
const PROVIDER_TWITCH = 'twitch';
const PROVIDER_YOUTUBE = 'youtube';

let leagueList = null;
let lastScheduleData = null;

initStats();
initDebugMode();

async function getLeagueWindowMap() {
    return await getFromLocalStorage('leagueWindowMap', {});
}

async function setLeagueWindowMap(map) {
    await chrome.storage.local.set({ leagueWindowMap: map });
}

const isLeagueExcluded = async (leagueName) => {
    const excludedLeagues = (await getFromLocalStorage('excludedLeagues')) || [];
    return excludedLeagues.includes(leagueName) || excludedLeagues.includes(resolveLeagueName(leagueName));
};

async function restoreMissingWindows() {
    let leagueWindowMap = await getLeagueWindowMap();
    const updatedMap = { ...leagueWindowMap };
    let needsUpdate = false;
    debugLog(`restoreMissingWindows: ${Object.keys(leagueWindowMap).length} tracked windows`);

    for (const [leagueName, leagueWindow] of Object.entries(leagueWindowMap)) {
        const { windowID, matchIDs } = leagueWindow;

        if (!windowID || typeof windowID !== "number") {
            console.warn(`Invalid windowID for ${leagueName}, reopening...`);
            const newWindow = await reopenLeagueWindow(leagueName, matchIDs);
            if (newWindow) {
                updatedMap[leagueName].windowID = newWindow.id;
                needsUpdate = true;
            }
            continue;
        }

        try {
            await chrome.windows.get(windowID);
        } catch (error) {
            console.warn(`Window for ${leagueName} is missing. Reopening...`);
            const newWindow = await reopenLeagueWindow(leagueName, matchIDs);
            if (newWindow) {
                leagueWindowMap[leagueName] = {
                    matchIDs: matchIDs,
                    windowID: newWindow.id
                };
                debugLog(`Reopened window ${newWindow.id} for ${leagueName}`);
            }
        }
    }

    if (needsUpdate) {
        await setLeagueWindowMap(updatedMap);
    }
}

async function reopenLeagueWindow(leagueName, matchIDs) {
    const provider = await getCurrentProvider();
    let matchLeagueURL = leagueList?.[leagueName];
    if (!matchLeagueURL) {
        const leagues = await provider.getLeagues();
        matchLeagueURL = leagues[leagueName];
    }

    if (!matchLeagueURL) {
        console.warn(`No valid URL found for league: ${leagueName}`);
        return null;
    }

    const url = await streamURL(matchLeagueURL, leagueName);
    const windowState = await getFromLocalStorage('windowState', 'normal');

    try {
        const newWindow = await createWindow(url, windowState);
        debugLog(`Reopened window for ${leagueName} with new ID: ${newWindow.id}`);

        let leagueWindowMap = await getLeagueWindowMap();
        leagueWindowMap[leagueName] = { matchIDs, windowID: newWindow.id };
        await setLeagueWindowMap(leagueWindowMap);

        return newWindow;
    } catch (error) {
        console.error(`Failed to reopen window for ${leagueName}:`, error);
        return null;
    }
}

const fetchSchedule = async () => {
    const provider = await getCurrentProvider();
    debugLog(`fetchSchedule: provider=${provider.id}`);
    const data = await provider.getSchedule();
    stats.lastPollTime = new Date().toISOString();
    chrome.storage.session.set({ requestStats: stats }).catch(() => {});
    lastScheduleData = data;

    if (data?.data?.schedule?.events) {
        debugLog(`fetchSchedule: ${data.data.schedule.events.length} events received`);
    } else {
        debugLog('fetchSchedule: no events in response');
    }

    await checkSchedule(data);
    await new Promise(resolve => setTimeout(resolve, 500));
    await restoreMissingWindows();
};

const fetchLeagues = async () => {
    const provider = await getCurrentProvider();
    const data = await provider.getLeagues();
    if (data) {
        debugLog(`fetchLeagues: ${Object.keys(data).length} leagues mapped`);
    }
    return data;
};

const fetchStreams = async (leagueName) => {
    const provider = await getCurrentProvider();
    const result = await provider.getStreams(leagueName);
    debugLog(`fetchStreams(${leagueName}): ${result.streams.length} streams, hasStreams=${result.hasStreams}`);
    return result;
};

async function checkSchedule(data) {
    if (!data?.data?.schedule?.events) {
        debugLog('checkSchedule: no events, skipping');
        return;
    }

    debugLog('checkSchedule: processing events...');
    const events = data.data.schedule.events;
    const date = new Date();
    const timeNow = new Date().toLocaleString();
    leagueList = await fetchLeagues();
    let leagueWindowMap = await getLeagueWindowMap();
    let processed = 0, opened = 0, completed = 0;

    for (const event of events) {
        const leagueName = event.league.name.trim();
        const matchID = event?.match?.id;
        const timeUntilMatch = new Date(event.startTime) - date;

        debugLog(`  Event: ${leagueName} match=${matchID} state=${event.state} starts=${event.startTime} timeUntil=${Math.round(timeUntilMatch/1000)}s`);

        if (await isLeagueExcluded(leagueName)) {
            debugLog(`    -> excluded, skipping`);
            continue;
        }

        if (event?.state === 'unstarted' || (event?.state === 'inProgress' && (event?.type === 'match'))) {
            if (
                timeUntilMatch <= MATCH_WINDOW ||
                (event?.state === 'inProgress' && leagueWindowMap[leagueName]) ||
                (event?.state === 'inProgress' && !leagueWindowMap[leagueName])
            ) {
                if (leagueWindowMap[leagueName] && !leagueWindowMap[leagueName].matchIDs.includes(matchID)) {
                    leagueWindowMap[leagueName].matchIDs.push(matchID);
                    debugLog(`    -> added match to existing window for ${leagueName}`);
                } else if (!leagueWindowMap[leagueName]) {
                    const { hasStreams } = await fetchStreams(leagueName);
                    if (hasStreams) {
                        const matchLeagueURL = leagueList[leagueName];
                        if (!matchLeagueURL) {
                            console.warn(`No valid URL found for league: ${leagueName}`);
                            continue;
                        }
                        const newWindow = await openWindowForLeague(matchLeagueURL, leagueName, matchID, timeNow);
                        if (newWindow) {
                            leagueWindowMap[leagueName] = {
                                matchIDs: matchID ? [matchID] : [],
                                windowID: newWindow.id
                            };
                            opened++;
                            debugLog(`    -> opened new window ${newWindow.id} for ${leagueName}`);
                        }
                    } else {
                        debugLog(`    -> no streams available for ${leagueName}`);
                    }
                }
            } else {
                debugLog(`    -> outside match window (${Math.round(timeUntilMatch/1000)}s > ${MATCH_WINDOW/1000}s)`);
            }
            processed++;
        } else if (event?.state === 'completed') {
            if (leagueWindowMap[leagueName] && leagueWindowMap[leagueName].matchIDs.includes(matchID)) {
                leagueWindowMap[leagueName].matchIDs = leagueWindowMap[leagueName].matchIDs.filter(id => id !== matchID);
                debugLog(`    -> match ${matchID} completed, removed from ${leagueName}`);
            }

            if (leagueWindowMap[leagueName] && leagueWindowMap[leagueName].matchIDs.length === 0) {
                debugLog(`    -> closing window for ${leagueName} (no more matches)`);
                try {
                    await chrome.windows.remove(leagueWindowMap[leagueName].windowID);
                    completed++;
                } catch (error) {
                    console.warn(`Failed to close window ${leagueWindowMap[leagueName].windowID}, it may have been already closed.`);
                }
                delete leagueWindowMap[leagueName];
            }
        }
    }

    debugLog(`checkSchedule done: ${processed} processed, ${opened} opened, ${completed} closed`);

    await setLeagueWindowMap(leagueWindowMap);
    await checkURL();
}

function computeLeagueStatus() {
    const status = {};
    if (!lastScheduleData?.data?.schedule?.events) {
        debugLog('computeLeagueStatus: no schedule data');
        return status;
    }
    if (!leagueList) {
        debugLog('computeLeagueStatus: no leagueList');
        return status;
    }

    for (const event of lastScheduleData.data.schedule.events) {
        const rawName = event.league.name.trim();
        const leagueName = resolveLeagueName(rawName);
        if (!status[leagueName]) {
            status[leagueName] = { state: null, startTime: null, url: leagueList[rawName] || leagueList[leagueName] };
        }

        if (event.state === 'inProgress' && event.type === 'match') {
            status[leagueName].state = 'live';
            status[leagueName].startTime = event.startTime;
        } else if (event.state === 'unstarted' && !status[leagueName].state) {
            if (!status[leagueName].state || event.startTime < status[leagueName].startTime) {
                status[leagueName].state = 'upcoming';
                status[leagueName].startTime = event.startTime;
            }
        }
    }

    debugLog(`computeLeagueStatus: ${Object.keys(status).length} leagues, ${Object.values(status).filter(s=>s.state==='live').length} live`);
    return status;
}

async function reconfigureAlarm() {
    const interval = await getFromLocalStorage('pollInterval', 3);
    chrome.alarms.clear('fetchSchedule', () => {
        chrome.alarms.create('fetchSchedule', { periodInMinutes: interval });
        debugLog(`Alarm reconfigured to ${interval} minutes`);
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debugLog(`onMessage: ${message.action}`, message);

    if (message.action === "togglePlayerRemoval") {
        debugLog(`Player Removal ${message.enabled ? "ENABLED" : "DISABLED"}`);
        chrome.storage.local.set({ removePlayerEnabled: message.enabled });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "togglePlayerRemoval", enabled: message.enabled });
            }
        });
    }

    if (message.action === "switchProvider") {
        const provider = getProvider(message.providerId);
        if (provider) {
            if (provider.id === PROVIDER_OFFICIAL) {
                provider.clearCache();
                debugLog('Cleared official provider cache');
            }
            debugLog(`Switched provider to ${provider.name}`);
            sendResponse({ success: true, provider: provider.name });
        } else {
            sendResponse({ success: false, error: 'Provider not found' });
        }
        return true;
    }

    if (message.action === "getProviders") {
        const safeProviders = getAllProviders().map(p => ({ id: p.id, name: p.name }));
        sendResponse({ providers: safeProviders });
        return true;
    }

    if (message.action === "getPopupData") {
        const providerId = message.providerId || 'official';
        const provider = getProvider(providerId);
        const leagueStatus = computeLeagueStatus();
        sendResponse({
            providerName: provider ? provider.name : 'Unknown',
            providerId: providerId,
            leagueStatus: leagueStatus,
            leagueList: leagueList || {},
            pollInterval: message.pollInterval || 3,
            debugMode: _debugMode
        });
        return true;
    }

    if (message.action === "forceRefresh") {
        debugLog('forceRefresh requested');
        fetchSchedule().then(() => {
            debugLog('forceRefresh completed');
            sendResponse({ success: true });
        }).catch((err) => {
            console.error('forceRefresh failed:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.action === "getStats") {
        (async () => {
        if (!stats) await initStats();
        const allLeagueNames = getAllLeagueNames();
        const providerLeagues = leagueList ? Object.keys(leagueList) : [];
        const mergedSet = new Set([...allLeagueNames, ...providerLeagues]);
        const mergedNames = [...mergedSet];
        chrome.storage.local.get('excludedLeagues', (res) => {
            const rawExcluded = res.excludedLeagues || [];
            const excluded = rawExcluded.filter(name => mergedSet.has(name));
            const leagueStatus = computeLeagueStatus();
            const liveCount = Object.values(leagueStatus).filter(s => s.state === 'live').length;
            const upcomingCount = Object.values(leagueStatus).filter(s => s.state === 'upcoming').length;
            const scheduleEvents = lastScheduleData?.data?.schedule?.events?.length || 0;
            const total = mergedSet.size;

            debugLog(`getStats: total=${total} (tiers=${allLeagueNames.length} provider=${providerLeagues.length}) excluded=${excluded.length} live=${liveCount} upcoming=${upcomingCount} scheduleEvents=${scheduleEvents}`);

            sendResponse({
                requestStats: getRequestStats(),
                leagues: {
                    total: total,
                    tierCount: allLeagueNames.length,
                    excluded: excluded.length,
                    active: total - excluded.length,
                    live: liveCount,
                    upcoming: upcomingCount,
                    scheduleEvents
                },
                allLeagueNames: mergedNames
            });
        });
        })();
        return true;
    }

    if (message.action === "updatePollInterval") {
        chrome.storage.local.set({ pollInterval: message.interval }, () => {
            reconfigureAlarm();
            debugLog(`Poll interval updated to ${message.interval}m`);
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.action === "setDebugMode") {
        _debugMode = !!message.enabled;
        chrome.storage.local.set({ debugMode: _debugMode }, () => {
            debugLog(`Debug mode ${_debugMode ? 'ENABLED' : 'DISABLED'}`);
            sendResponse({ success: true, debugMode: _debugMode });
        });
        return true;
    }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    let leagueWindowMap = await getLeagueWindowMap();

    for (const leagueName in leagueWindowMap) {
        if (leagueWindowMap[leagueName].windowID === windowId) {
            delete leagueWindowMap[leagueName];
            debugLog(`Window ${windowId} closed by user for ${leagueName}`);
            await setLeagueWindowMap(leagueWindowMap);
            break;
        }
    }
});

async function createWindow(url, state) {
    try {
        return await new Promise((resolve, reject) => {
            chrome.windows.create({ url, state }, (window) => {
                if (chrome.runtime.lastError || !window) {
                    reject(`Failed to create window: ${chrome.runtime.lastError?.message}`);
                } else {
                    resolve(window);
                }
            });
        });
    } catch (error) {
        console.error("Error creating window:", error);
    }
}

function replaceURL(url, parameter) {
    let urlObj = new URL(url);
    let pathnames = urlObj.pathname.split('/').filter(Boolean);
    let liveIndex = pathnames.indexOf("live");

    if (liveIndex !== -1) {
        let afterLive = pathnames.slice(liveIndex + 1);
        if (afterLive.length === 1) {
            pathnames.push(parameter);
        } else {
            pathnames[pathnames.length - 1] = parameter;
        }
        urlObj.pathname = "/" + pathnames.join('/');
    }

    debugLog(`replaceURL: ${url} -> ${urlObj.toString()}`);
    return urlObj.toString();
}

const streamURL = async (matchURL, leagueName) => {
    const provider = await getFromLocalStorage('provider', PROVIDER_TWITCH);
    const { streams } = await fetchStreams(leagueName);

    const youtubeStream = streams.find((stream) => stream.provider === PROVIDER_YOUTUBE);
    const twitchStream = streams.find((stream) => stream.provider === PROVIDER_TWITCH);

    let streamId;

    if (provider === PROVIDER_YOUTUBE) {
        streamId = youtubeStream?.parameter || twitchStream?.parameter;
    } else {
        streamId = twitchStream?.parameter || youtubeStream?.parameter;
    }

    if (!streamId) {
        console.warn(`No valid stream found for ${leagueName}, using given matchURL.`);
        debugLog(`streamURL(${leagueName}): no stream found, using raw URL`);
        return matchURL;
    }

    debugLog(`streamURL(${leagueName}): using ${provider} stream ${streamId}`);
    return replaceURL(matchURL, streamId);
};

async function openWindowForLeague(matchURL, leagueName, matchID, timeNow) {
    const windowState = await getFromLocalStorage('windowState', 'normal');
    const url = await streamURL(matchURL, leagueName);
    const window = await createWindow(url, windowState);
    debugLog(`Opened window ${window.id} for ${leagueName} match ${matchID}`);
    return window;
}

async function checkURL() {
    let leagueWindowMap = await getLeagueWindowMap();
    debugLog(`checkURL: ${Object.keys(leagueWindowMap).length} windows to check`);

    for (const [leagueName, leagueWindow] of Object.entries(leagueWindowMap)) {
        const { windowID } = leagueWindow;
        let matchLeagueURL = leagueList[leagueName];

        if (!matchLeagueURL) {
            console.warn(`No valid URL found for league: ${leagueName}`);
            continue;
        }

        const url = await streamURL(matchLeagueURL, leagueName);
        await updateTabURL(windowID, url);
    }
}

async function getTab(windowId) {
    return new Promise((resolve) => {
        chrome.tabs.query({ windowId }, (tabs) => {
            resolve(tabs && tabs.length > 0 ? tabs[0] : null);
        });
    });
}

async function updateTabURL(windowId, matchURL) {
    const tab = await getTab(windowId);
    if (tab && tab.status === 'complete' && tab.url !== matchURL) {
        return new Promise((resolve) => {
            chrome.tabs.update(tab.id, { url: matchURL }, resolve);
            debugLog(`Updated tab ${tab.id} to ${matchURL}`);
        });
    }
    return tab;
}

chrome.runtime.onInstalled.addListener(async () => {
    debugLog('Extension installed/updated');
    try {
        await reconfigureAlarm();
        await fetchSchedule();
    } catch (error) {
        console.error("Failed to fetch schedule on install:", error);
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "fetchSchedule") {
        debugLog('Scheduled poll triggered');
        await fetchSchedule();
    }
});
