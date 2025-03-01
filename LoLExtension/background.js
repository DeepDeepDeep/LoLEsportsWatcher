const API_URL = 'https://leaguewatcher.onrender.com/schedule';
const LEAGUES_URL = 'https://leaguewatcher.onrender.com/leagues';
const STREAMS_URL = 'https://leaguewatcher.onrender.com/streams';
const FALLBACK_LEAGUE_URL = {"Americas Challengers":"https://lolesports.com/live/americas_challengers","Arabian League":"https://lolesports.com/live/arabian_league","CBLOL":"https://lolesports.com/live/cblol-brazil/cblolenglish","CBLOL Academy":"https://lolesports.com/live/cd","EMEA Masters":"https://lolesports.com/live/emea_masters/emeamasters","Esports Balkan League":"https://lolesports.com/live/esports_balkan_league","Hellenic Legends League":"https://lolesports.com/live/hellenic_legends_league/helleniclegends","Hitpoint Masters":"https://lolesports.com/live/hitpoint_masters/hitpointcz","LCK":"https://lolesports.com/live/lck/lck","LCK Challengers":"https://lolesports.com/live/lck_challengers_league/lckcl","LCL":"https://lolesports.com/live/lcl/lcl","LCO":"https://lolesports.com/live/lco/lco","LCP":"https://lolesports.com/live/lcp/lolpacificen","LCS":"https://lolesports.com/live/lcs/lcs","LEC":"https://lolesports.com/live/lec/lec","LJL":"https://lolesports.com/live/ljl-japan","LLA":"https://lolesports.com/live/lla/lla","LPL":"https://lolesports.com/live/lpl/lpl","LTA Cross-Conference":"https://lolesports.com/live/lta_cross","LTA North":"https://lolesports.com/live/lta_n/","LTA South":"https://lolesports.com/live/lta_s/ltaespanol","La Ligue Française":"https://lolesports.com/live/lfl/otplol_","Liga Portuguesa":"https://lolesports.com/live/liga_portuguesa/inygontv1","LoL Italian Tournament":"https://lolesports.com/live/lit/litofficial","MSI":"https://lolesports.com/live/msi/riotgames","NACL":"https://lolesports.com/live/nacl","NLC":"https://lolesports.com/live/nlc/nlclol","North Regional League":"https://lolesports.com/live/north_regional_league/lvpnorte","PCS":"https://lolesports.com/live/pcs/lolpacific","Prime League":"https://lolesports.com/live/primeleague","Rift Legends":"https://lolesports.com/live/rift_legends/nervarien","Road of Legends":"https://lolesports.com/live/roadoflegends/road_of_legends","South Regional League":"https://lolesports.com/live/south_regional_league/lvpsur","SuperLiga":"https://lolesports.com/live/superliga/lvpes","TCL":"https://lolesports.com/live/turkiye-sampiyonluk-ligi/riotgamesturkish","TFT Magic n' Mayhem":"https://lolesports.com/live/tft_esports/teamfighttactics","Ultraliga":"https://lolesports.com/live/ultraliga/polsatgames2","VCS":"https://lolesports.com/live/vcs/vcs","Worlds":"https://lolesports.com/live/worlds","TFT Esports":"https://lolesports.com/live/tft_esports/teamfighttactics"};

const MATCH_WINDOW = 900 * 1000; // 15 minutes
const SCHEDULE_POLL_INTERVAL = 3; // 3 minutes

const PROVIDER_TWITCH = 'twitch';
const PROVIDER_YOUTUBE = 'youtube';

let leagueList = null;

async function getLeagueWindowMap() {
    return await getFromLocalStorage('leagueWindowMap', {});
}

async function setLeagueWindowMap(map) {
    await chrome.storage.local.set({ leagueWindowMap: map });
}


async function getFromLocalStorage(key, defaultValue) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key] ?? defaultValue);
        });
    });
}

const isLeagueExcluded = async (leagueName) => {
	const excludedLeagues = (await getFromLocalStorage('excludedLeagues')) || [];
	return excludedLeagues.includes(leagueName);
};

const fetchJson = async (url) => {
	try {
		const response = await fetch(url);
		return await response.json();
	} catch (error) {
		console.error(error);
	}
};

async function restoreMissingWindows() {
    let leagueWindowMap = await getLeagueWindowMap();
    const updatedMap = {...leagueWindowMap};
    let needsUpdate = false;

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
            // Check if window exists
            await chrome.windows.get(windowID);
        } catch (error) {
            console.warn(`Window for ${leagueName} is missing. Reopening...`);
            const newWindow = await reopenLeagueWindow(leagueName, matchIDs);
            if (newWindow) {
				leagueWindowMap[leagueName] = { 
					matchIDs: matchID ? [matchID] : [], 
					windowID: newWindow.id 
				};
				console.log(`Opened new window ${newWindow.id} for ${leagueName}`);
			}
        }
    }

    // Only update storage if changes were made
    if (needsUpdate) {
        await setLeagueWindowMap(updatedMap);
    }
}

// Function to reopen a window and update leagueWindowMap
async function reopenLeagueWindow(leagueName, matchIDs) {
    let matchLeagueURL = leagueList?.[leagueName] || FALLBACK_LEAGUE_URL[leagueName.trim()];
    if (!matchLeagueURL) {
        console.warn(`No valid URL found for league: ${leagueName}`);
        return null;
    }

    const url = await streamURL(matchLeagueURL, leagueName);
    const windowState = await getFromLocalStorage('windowState', 'normal');
    
    try {
        const newWindow = await createWindow(url, windowState);
        console.log(`Reopened window for ${leagueName} with new ID: ${newWindow.id}`);
        
        // Update map immediately
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
    const data = await fetchJson(API_URL);
    await checkSchedule(data);
    
    // avoid race condition
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now check for missing windows
    await restoreMissingWindows();
};

const fetchLeagues = async () => {
	return await fetchJson(LEAGUES_URL);
};

const fetchStreams = async (leagueName) => {
	const data = await fetchJson(STREAMS_URL);
	let streams = [];

	if (!data?.data?.schedule?.events) {
		console.log('No events found in data');
		return { streams, hasStreams: false };
	}

	const events = data.data.schedule.events;
	for (const event of events) {
		if (event.league.name === leagueName) {
			try {
				for (const stream of event.streams) {
					streams.push(stream);
				}
			} catch (error) {
				console.error(error);
			}
		}
	}
	return { streams, hasStreams: streams.length > 0 };
};

async function checkSchedule(data) {
    if (!data?.data?.schedule?.events) {
        return;
    }

    console.log('Checking schedule...');
    const events = data.data.schedule.events;
    const date = new Date();
    const timeNow = new Date().toLocaleString();
    leagueList = await fetchLeagues();
    let leagueWindowMap = await getLeagueWindowMap(); // Get the latest leagueWindowMap

    for (const event of events) {
        const leagueName = event.league.name;
        const matchID = event?.match?.id;
        const timeUntilMatch = new Date(event.startTime) - date;

        if (await isLeagueExcluded(leagueName)) {
            console.log(`League ${leagueName} is excluded. Skipping...`);
            continue;
        }

		//console.log(`Processing ${leagueName} - Match ID: ${matchID} - State: ${event.state}`);

        if (event?.state === 'unstarted' || (event?.state === 'inProgress' && (event?.type === 'match'))) {
            if (
                timeUntilMatch <= MATCH_WINDOW ||
                (event?.state === 'inProgress' && leagueWindowMap[leagueName]) || 
                (event?.state === 'inProgress' && !leagueWindowMap[leagueName])
            ) {
                if (leagueWindowMap[leagueName] && !leagueWindowMap[leagueName].matchIDs.includes(matchID)) {
                    leagueWindowMap[leagueName].matchIDs.push(matchID);
                    console.log(`Added match ${matchID} to existing window for ${leagueName}`);
                } else if (!leagueWindowMap[leagueName]) {
                    const { hasStreams } = await fetchStreams(leagueName);
                    if (hasStreams) {
                        const matchLeagueURL = leagueList[leagueName] || FALLBACK_LEAGUE_URL[leagueName.trim()];
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
							console.log(`Opened a New Window with ID: ${newWindow.id} for ${leagueName.trim()} - MatchID: ${matchID}`);
						}
                    }
                }
            }
        } else if (event?.state === 'completed') {
            if (leagueWindowMap[leagueName] && leagueWindowMap[leagueName].matchIDs.includes(matchID)) {
                leagueWindowMap[leagueName].matchIDs = leagueWindowMap[leagueName].matchIDs.filter(id => id !== matchID);
                console.log(`Match ${matchID} completed in ${leagueName} at ${timeNow}`);
            }

            if (leagueWindowMap[leagueName] && leagueWindowMap[leagueName].matchIDs.length === 0) {
                console.log(`Closing window for ${leagueName} at ${timeNow}`);
                try {
                    await chrome.windows.remove(leagueWindowMap[leagueName].windowID);
                    console.log(`Successfully closed window ${leagueWindowMap[leagueName].windowID}`);
                } catch (error) {
                    console.warn(`Failed to close window ${leagueWindowMap[leagueName].windowID}, it may have been already closed.`);
                }
                delete leagueWindowMap[leagueName];
            }
        }
    }

    await setLeagueWindowMap(leagueWindowMap); // Store the updated map
    await checkURL();
}

// Player Option Listner
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "togglePlayerRemoval") {
        console.log(`Player Removal ${message.enabled ? "ENABLED" : "DISABLED"}`);
        chrome.storage.local.set({ removePlayerEnabled: message.enabled });

        // Forward the message to content.js
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "togglePlayerRemoval", enabled: message.enabled });
            }
        });
    }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    let leagueWindowMap = await getLeagueWindowMap(); // Get the latest leagueWindowMap

    for (const leagueName in leagueWindowMap) {
        if (leagueWindowMap[leagueName].windowID === windowId) {
            delete leagueWindowMap[leagueName];
            console.log(`Window with ID: ${windowId} closed by user for ${leagueName.trim()} at ${new Date().toLocaleString()}`);
            await setLeagueWindowMap(leagueWindowMap); // Save updated map
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

    // Find the index of '/live/' to determine relevant paths
    let liveIndex = pathnames.indexOf("live");

    if (liveIndex !== -1) {
        let afterLive = pathnames.slice(liveIndex + 1); // Paths after "live"

        if (afterLive.length === 1) {
            // If only one path after "/live/", append the parameter
            pathnames.push(parameter);
        } else {
            // Otherwise, replace the last segment
            pathnames[pathnames.length - 1] = parameter;
        }

        urlObj.pathname = "/" + pathnames.join('/');
    }

    return urlObj.toString();
}

const streamURL = async (matchURL, leagueName) => {
    const provider = await getFromLocalStorage('provider', PROVIDER_TWITCH);
    const { streams } = await fetchStreams(leagueName);
    
    const youtubeStream = streams.find((stream) => stream.provider === PROVIDER_YOUTUBE);
    const twitchStream = streams.find((stream) => stream.provider === PROVIDER_TWITCH);
    
    let streamId;
    
    if (provider === PROVIDER_YOUTUBE) {
        streamId = youtubeStream?.parameter || twitchStream?.parameter; // Prefer YouTube, fallback to Twitch
    } else {
        streamId = twitchStream?.parameter || youtubeStream?.parameter; // Prefer Twitch, fallback to YouTube
    }

    if (!streamId) {
        console.warn(`No valid stream found for ${leagueName}, using given matchURL.`);
        return matchURL;
    }

    return replaceURL(matchURL, streamId);
};

async function openWindowForLeague(matchURL, leagueName, matchID, timeNow) {
    const windowState = await getFromLocalStorage('windowState', 'normal');
    const url = await streamURL(matchURL, leagueName);

    const window = await createWindow(url, windowState);
    
    console.log(`Opened window for ${leagueName.trim()}'s matches - ${timeNow}`);
    return window; // Return the window object
}

async function checkURL() {
    let leagueWindowMap = await getLeagueWindowMap(); // Get the latest leagueWindowMap

    for (const [leagueName, leagueWindow] of Object.entries(leagueWindowMap)) {
        const { windowID } = leagueWindow;

        // First, try to get the URL from leagueList
        let matchLeagueURL = leagueList[leagueName];

        // If undefined, check fallback lookup
        if (!matchLeagueURL) {
            matchLeagueURL = FALLBACK_LEAGUE_URL[leagueName.trim()] || null;
        }

        // If still null, log an error and skip this iteration
        if (!matchLeagueURL) {
            console.warn(`No valid URL found for league: ${leagueName}`);
            continue;
        }

        // Get the correct stream URL
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
			console.log(`Updated tab ${tab.id} to ${matchURL} at ${new Date().toLocaleString()}`);
		});
	}
	return tab;
}

chrome.runtime.onInstalled.addListener(async () => {
    try {
        await fetchSchedule();
    } catch (error) {
        console.error("Failed to fetch schedule on install:", error);
    }
});

chrome.alarms.clearAll(() => {
    chrome.alarms.create("fetchSchedule", { periodInMinutes: SCHEDULE_POLL_INTERVAL });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "fetchSchedule") {
        await fetchSchedule();
    }
});