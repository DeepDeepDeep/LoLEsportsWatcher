const API_URL = 'https://leaguewatcher.onrender.com/schedule';
const LEAGUES_LIST = 'http://leaguewatcher.onrender.com/leagues';

const MATCH_WINDOW = 900 * 1000; // 15 minutes
const SCHEDULE_POLL_INTERVAL = 300 * 1000; // 5 minutes

async function fetchSchedule() {
	try {
		const response = await fetch(API_URL);
		const data = await response.json();
		checkSchedule(data);
	} catch (error) {
		console.error(error);
	}
}

async function fetchLeagues() {
	try {
		const response = await fetch(LEAGUES_LIST);
		const data = await response.json();
		return data;
	} catch (error) {
		console.error(error);
	}
}

let leagueWindowMap = new Map();

async function checkSchedule(data) {
	if (!data?.data?.schedule?.events) {
		return;
	}

	console.log('Checking schedule...');
	const events = data.data.schedule.events;
	const date = new Date();
	const timeNow = new Date().toLocaleString();
	const leagueList = await fetchLeagues();

	for (const event of events) {
		const matchLeagueURL = leagueList[event.league.name];
		const timeUntilMatch = new Date(event.startTime) - date;
		const leagueName = event.league.name;
		const matchID = event?.match?.id;

		if (await isLeagueExcluded(leagueName)) {
			continue;
		}

		if (event?.state === 'unstarted' || (event?.state === 'inProgress' && event?.type === 'match')) {
			if (timeUntilMatch <= MATCH_WINDOW) {
				if (leagueWindowMap.has(leagueName) && !leagueWindowMap.get(leagueName).matchIDs.includes(matchID)) {
					leagueWindowMap.get(leagueName).matchIDs.push(matchID);
				} else if (!leagueWindowMap.has(leagueName)) {
					await openWindowForLeague(matchLeagueURL, leagueName, matchID, timeNow);
				}
			}
		} else if (event?.state === 'completed') {
			if (leagueWindowMap.has(leagueName) && leagueWindowMap.get(leagueName).matchIDs.includes(matchID)) {
				leagueWindowMap.get(leagueName).matchIDs.splice(leagueWindowMap.get(leagueName).matchIDs.indexOf(matchID), 1);
				console.log(`Match ${matchID} completed in ${leagueName} at ${timeNow}`);
			}

			if (leagueWindowMap.has(leagueName) && leagueWindowMap.get(leagueName).matchIDs.length === 0) {
				console.log(`Closed window for matches in ${leagueName} at ${timeNow}`);
				chrome.windows.remove(leagueWindowMap.get(leagueName).windowID);
				leagueWindowMap.delete(leagueName);
			}
		}
	}
	await checkURL();
}

chrome.windows.onRemoved.addListener((windowId) => {
	for (const [leagueName, leagueWindow] of leagueWindowMap.entries()) {
		if (leagueWindow.windowID === windowId) {
			leagueWindowMap.delete(leagueName);
			console.log(`Window ${windowId} closed by user for ${leagueName} at ${new Date().toLocaleString()}`);
			break;
		}
	}
});

function openWindowForLeague(url, leagueName, matchID, timeNow) {
	return new Promise(async (resolve) => {
		const windowStatePromise = new Promise((resolveState) => {
			chrome.storage.local.get('windowState', (result) => {
				const windowState = result.windowState || 'normal';
				resolveState(windowState);
			});
		});

		const windowState = await windowStatePromise;
		chrome.windows.create({ url, state: windowState }, (window) => {
			leagueWindowMap.set(leagueName, { matchIDs: [matchID], windowID: window.id });
			console.log(`Opened window for matches in ${leagueName} at ${timeNow}`);
			resolve();
		});
	});
}

async function checkURL() {
	for (const [leagueName, leagueWindow] of leagueWindowMap.entries()) {
		const { windowID } = leagueWindow;
		const matchLeagueURL = LEAGUE_MAP[leagueName];

		await updateTabURL(windowID, matchLeagueURL);
	}
}

function isLeagueExcluded(leagueName) {
	return new Promise((resolve) => {
		chrome.storage.local.get('excludedLeagues', (result) => {
			const excludedLeagues = result.excludedLeagues || [];
			resolve(excludedLeagues.includes(leagueName));
		});
	});
}

async function updateTabURL(windowId, matchURL) {
	return new Promise((resolve) => {
		chrome.tabs.query({ windowId }, (tabs) => {
			if (tabs && tabs.length > 0) {
				const tab = tabs[0];
				const tabId = tab.id;
				if (tab.status === 'complete') {
					const currentURL = tab.url;
					if (currentURL !== matchURL) {
						chrome.tabs.update(tabId, { url }, (updatedTab) => {
							resolve(updatedTab);
						});
					} else {
						resolve(tab);
					}
				} else {
					resolve(tab);
				}
			} else {
				resolve(null);
			}
		});
	});
}

chrome.runtime.onInstalled.addListener(function () {
	fetchSchedule();
});

setInterval(fetchSchedule, SCHEDULE_POLL_INTERVAL);
