const API_URL = 'https://leaguewatcher.onrender.com/schedule';
const LEAGUE_MAP = {
	'EMEA Masters': 'https://lolesports.com/live/emea_masters/emeamasters',
	'MSI': 'https://lolesports.com/live/msi/riotgames',
	'LCS': 'https://lolesports.com/live/lcs',
	'LCS Challengers': 'https://lolesports.com/live/north_american_challenger_league',
	'LCS Challengers Qualifiers': 'https://lolesports.com/live/lcs_challengers_qualifiers',
	'College Championship': '',
	'CBLOL': 'https://lolesports.com/live/cblol',
	'LCK': 'https://lolesports.com/live/lck',
	'LCL': 'https://lolesports.com/live/lcl',
	'LCO': 'https://lolesports.com/live/lco',
	'LEC': 'https://lolesports.com/live/lec',
	'LJL': 'https://lolesports.com/live/ljl-japan/ljl',
	'LLA': 'https://lolesports.com/live/lla',
	'LPL': 'https://lolesports.com/live/lpl/lpl',
	'PCS': 'https://lolesports.com/live/pcs/lolpacific',
	'TCL': '',
	'VCS': '',
	'Worlds': 'https://lolesports.com/live/worlds',
	'All-Star Event': '',
	'La Ligue Française': '',
	'NLC': '',
	'Elite Series': '',
	'Liga Portuguesa': '',
	'PG Nationals': '',
	'Ultraliga': 'https://lolesports.com/live/ultraliga/polsatgames2',
	'SuperLiga': 'https://lolesports.com/live/superliga/lvpes',
	'Prime League': 'https://lolesports.com/live/primeleague',
	'Hitpoint Masters': '',
	'Esports Balkan League': '',
	'Greek Legends League': '',
	'Arabian League': 'https://lolesports.com/live/arabian_league',
	'LCK Academy': '',
	'LJL Academy': 'https://lolesports.com/live/ljl_academy',
	'LCK Challengers': 'https://lolesports.com/live/lck_challengers_league',
	'CBLOL Academy': 'https://lolesports.com/live/cblol_academy',
	'Liga Master': '',
	'Golden League': '',
	'Elements League': '',
	'Stars League': '',
	'Honor Division': '',
	'Volcano League': '',
	'Honor League': '',
	'TFT Rising Legends': 'https://lolesports.com/live/tft_esports/teamfighttactics',
	'TAL': '',
	'Master Flow League': '',
	'TFT Western LCQ': 'https://lolesports.com/live/tft_esports/teamfighttactics',
	'North Regional League': 'https://lolesports.com/live/north_regional_league/lvpnorte',
	'South Regional League': 'https://lolesports.com/live/south_regional_league',
	'TFT Monsters Attack!': 'https://lolesports.com/live/tft_esports/teamfighttactics',
};

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

let leagueWindowMap = new Map();

async function checkSchedule(data) {
	if (!data?.data?.schedule?.events) {
		console.error('Schedule data is invalid:', data);
		return;
	}

	console.log('Checking schedule...');
	const events = data.data.schedule.events;
	const date = new Date();
	const timeNow = new Date().toLocaleString();

	for (const event of events) {
		const matchLeagueURL = LEAGUE_MAP[event.league.name];
		const timeUntilMatch = new Date(event.startTime) - date;
		const leagueName = event.league.name;
		const matchID = event?.match?.id;

		if (event?.state === 'unstarted' || (event?.state === 'inProgress' && event?.type === 'match')) {
			if (timeUntilMatch <= MATCH_WINDOW) {
				if (leagueWindowMap.has(leagueName) && !leagueWindowMap.get(leagueName).matchIDs.includes(matchID)) {
					leagueWindowMap.get(leagueName).matchIDs.push(matchID);
				} else if (!leagueWindowMap.has(leagueName)) {
					console.log('Opening window for matches in', leagueName);
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

chrome.runtime.onInstalled.addListener(function () {
	fetchSchedule();
});

setInterval(fetchSchedule, SCHEDULE_POLL_INTERVAL);
