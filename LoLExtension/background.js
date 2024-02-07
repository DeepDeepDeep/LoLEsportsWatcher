const API_URL = 'https://leaguewatcher.onrender.com/schedule';
const LEAGUES_URL = 'https://leaguewatcher.onrender.com/leagues';
const STREAMS_URL = 'https://leaguewatcher.onrender.com/streams';

const MATCH_WINDOW = 900 * 1000; // 15 minutes
const SCHEDULE_POLL_INTERVAL = 180 * 1000; // 3 minutes

const leagueWindowMap = new Map();
const PROVIDER_TWITCH = 'twitch';
const PROVIDER_YOUTUBE = 'youtube';

let leagueList = null;

async function getFromLocalStorage(key, defaultValue) {
	return new Promise((resolve) => {
		chrome.storage.local.get(key, (result) => {
			resolve(result[key] || defaultValue);
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

const fetchSchedule = async () => {
	const data = await fetchJson(API_URL);
	checkSchedule(data);
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

	for (const event of events) {
		const matchLeagueURL = leagueList[event.league.name];
		const timeUntilMatch = new Date(event.startTime) - date;
		const leagueName = event.league.name;
		const matchID = event?.match?.id;

		if (await isLeagueExcluded(leagueName)) {
			continue;
		}

		if (event?.state === 'unstarted' || (event?.state === 'inProgress' && event?.type === 'match')) {
			if (
				timeUntilMatch <= MATCH_WINDOW ||
				(event?.state === 'inProgress' && leagueWindowMap.has(leagueName)) || // Accounts for matches starting earlier
				(event?.state === 'inProgress' && !leagueWindowMap.has(leagueName))
			) {
				if (leagueWindowMap.has(leagueName) && !leagueWindowMap.get(leagueName).matchIDs.includes(matchID)) {
					leagueWindowMap.get(leagueName).matchIDs.push(matchID);
				} else if (!leagueWindowMap.has(leagueName)) {
					const { hasStreams } = await fetchStreams(leagueName);
					if (hasStreams) {
						await openWindowForLeague(matchLeagueURL, leagueName, matchID, timeNow);
					}
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

async function createWindow(url, state) {
	return new Promise((resolve) => {
		chrome.windows.create({ url, state }, resolve);
	});
}

function replaceURL(url, parameter) {
	let urlObj = new URL(url);
	let pathnames = urlObj.pathname.split('/').filter(Boolean);
	pathnames[pathnames.length - 1] = parameter;
	urlObj.pathname = pathnames.join('/');
	return urlObj.toString();
}

const streamURL = async (matchURL, leagueName) => {
	const provider = await getFromLocalStorage('provider', PROVIDER_TWITCH);
	const { streams } = await fetchStreams(leagueName);
	const youtubeStream = streams.find((stream) => stream.provider === PROVIDER_YOUTUBE);

	let url;
	if (provider === PROVIDER_YOUTUBE && youtubeStream) {
		let streamId = youtubeStream.parameter;
		url = replaceURL(matchURL, streamId);
	} else {
		url = matchURL;
	}

	return url;
};

async function openWindowForLeague(matchURL, leagueName, matchID, timeNow) {
	const windowState = await getFromLocalStorage('windowState', 'normal');
	const url = await streamURL(matchURL, leagueName);

	const window = await createWindow(url, windowState);
	leagueWindowMap.set(leagueName, { matchIDs: [matchID], windowID: window.id });
	console.log(`Opened window for matches in ${leagueName} at ${timeNow}`);
}

async function checkURL() {
	for (const [leagueName, leagueWindow] of leagueWindowMap.entries()) {
		const { windowID } = leagueWindow;
		const matchLeagueURL = leagueList[leagueName];
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

chrome.runtime.onInstalled.addListener(fetchSchedule);

setInterval(fetchSchedule, SCHEDULE_POLL_INTERVAL);
