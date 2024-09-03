const API_URL = 'https://leaguewatcher.onrender.com/schedule';
const LEAGUES_URL = 'https://leaguewatcher.onrender.com/leagues';
const STREAMS_URL = 'https://leaguewatcher.onrender.com/streams';
const MATCH_WINDOW = 900 * 1000; // 15 minutes
const SCHEDULE_POLL_INTERVAL = 3; // 3 minutes
const PROVIDER_TWITCH = 'twitch';
const PROVIDER_YOUTUBE = 'youtube';

let leagueWindows = {};
let leagueList = null;

async function getFromStorage(key, defaultValue) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? defaultValue;
}

async function setInStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function fetchJson(url) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
  }
}

function setLeagueWindow(leagueName, windowInfo) {
  leagueWindows[leagueName] = windowInfo;
  setInStorage('leagueWindows', leagueWindows);
}

function getLeagueWindow(leagueName) {
  return leagueWindows[leagueName];
}

function hasLeagueWindow(leagueName) {
  return leagueName in leagueWindows;
}

function deleteLeagueWindow(leagueName) {
  delete leagueWindows[leagueName];
  setInStorage('leagueWindows', leagueWindows);
}

async function isLeagueExcluded(leagueName) {
  const excludedLeagues = await getFromStorage('excludedLeagues', []);
  return excludedLeagues.includes(leagueName);
}

async function getStreamsForLeague(leagueName, data) {
  if (!data?.data?.schedule?.events) {
    console.log('No events found in data');
    return { streams: [], hasStreams: false };
  }

  const streams = data.data.schedule.events
    .filter(event => event.league.name === leagueName)
    .flatMap(event => event.streams || []);

  return { streams, hasStreams: streams.length > 0 };
}

async function openWindowForLeague(matchURL, leagueName, matchID, timeNow) {
  const windowState = await getFromStorage('windowState', 'normal');
  const url = await getStreamURL(matchURL, leagueName);

  const window = await chrome.windows.create({ url, state: windowState });
  setLeagueWindow(leagueName, { matchIDs: [matchID], windowID: window.id });
  console.log(`Opened window for matches in ${leagueName} at ${timeNow}`);
}

function replaceURL(url, parameter) {
  const urlObj = new URL(url);
  const pathnames = urlObj.pathname.split('/').filter(Boolean);
  pathnames[pathnames.length - 1] = parameter;
  urlObj.pathname = pathnames.join('/');
  return urlObj.toString();
}

async function getStreamURL(matchURL, leagueName) {
  const provider = await getFromStorage('provider', PROVIDER_TWITCH);
  const { streams } = await getStreamsForLeague(leagueName, await fetchJson(STREAMS_URL));
  const youtubeStream = streams.find(stream => stream.provider === PROVIDER_YOUTUBE);

  if (provider === PROVIDER_YOUTUBE && youtubeStream) {
    return replaceURL(matchURL, youtubeStream.parameter);
  }
  return matchURL;
}

async function updateTabURL(windowId, matchURL) {
  const [tab] = await chrome.tabs.query({ windowId });
  if (tab && tab.status === 'complete' && tab.url !== matchURL) {
    await chrome.tabs.update(tab.id, { url: matchURL });
    console.log(`Updated tab ${tab.id} to ${matchURL} at ${new Date().toLocaleString()}`);
  }
}

async function checkURL() {
  for (const leagueName in leagueWindows) {
    const { windowID } = leagueWindows[leagueName];
    const matchLeagueURL = leagueList[leagueName];
    const url = await getStreamURL(matchLeagueURL, leagueName);
    await updateTabURL(windowID, url);
  }
}

async function processEvent(event, date, timeNow) {
  const matchLeagueURL = leagueList[event.league.name];
  const timeUntilMatch = new Date(event.startTime) - date;
  const leagueName = event.league.name;
  const matchID = event?.match?.id;

  if (await isLeagueExcluded(leagueName)) return;

  if (event?.state === 'unstarted' || (event?.state === 'inProgress' && event?.type === 'match')) {
    await handleMatch(event, leagueName, matchID, timeUntilMatch, matchLeagueURL, timeNow);
  } else if (event?.state === 'completed') {
    handleCompletedMatch(leagueName, matchID, timeNow);
  }
}

async function handleMatch(event, leagueName, matchID, timeUntilMatch, matchLeagueURL, timeNow) {
  const shouldOpenWindow = 
    timeUntilMatch <= MATCH_WINDOW ||
    (event?.state === 'inProgress' && !hasLeagueWindow(leagueName));

  if (shouldOpenWindow) {
    const leagueWindow = getLeagueWindow(leagueName);
    if (leagueWindow && !leagueWindow.matchIDs.includes(matchID)) {
      leagueWindow.matchIDs.push(matchID);
      setLeagueWindow(leagueName, leagueWindow);
    } else if (!leagueWindow) {
      const { hasStreams } = await getStreamsForLeague(leagueName, await fetchJson(STREAMS_URL));
      if (hasStreams) {
        await openWindowForLeague(matchLeagueURL, leagueName, matchID, timeNow);
      }
    }
  }
}

function handleCompletedMatch(leagueName, matchID, timeNow) {
  const leagueWindow = getLeagueWindow(leagueName);
  if (leagueWindow && leagueWindow.matchIDs.includes(matchID)) {
    leagueWindow.matchIDs = leagueWindow.matchIDs.filter(id => id !== matchID);
    console.log(`Match ${matchID} completed in ${leagueName} at ${timeNow}`);

    if (leagueWindow.matchIDs.length === 0) {
      console.log(`Closed window for matches in ${leagueName} at ${timeNow}`);
      chrome.windows.remove(leagueWindow.windowID);
      deleteLeagueWindow(leagueName);
    } else {
      setLeagueWindow(leagueName, leagueWindow);
    }
  }
}

async function checkSchedule(data) {
  if (!data?.data?.schedule?.events) return;

  console.log('Checking schedule...');
  const events = data.data.schedule.events;
  const date = new Date();
  const timeNow = date.toLocaleString();
  leagueList = await fetchJson(LEAGUES_URL);

  for (const event of events) {
    await processEvent(event, date, timeNow);
  }
  await checkURL();
}

function handleClosedWindow(windowId) {
  for (const leagueName in leagueWindows) {
    if (leagueWindows[leagueName].windowID === windowId) {
      deleteLeagueWindow(leagueName);
      console.log(`Window ${windowId} closed by user for ${leagueName} at ${new Date().toLocaleString()}`);
      break;
    }
  }
}

async function loadLeagueWindows() {
  leagueWindows = await getFromStorage('leagueWindows', {});
}

async function fetchAndCheckSchedule() {
  const scheduleData = await fetchJson(API_URL);
  await checkSchedule(scheduleData);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  loadLeagueWindows();
  fetchAndCheckSchedule();
  chrome.alarms.create('fetchSchedule', { periodInMinutes: SCHEDULE_POLL_INTERVAL });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchSchedule') {
    fetchAndCheckSchedule();
  }
});

chrome.windows.onRemoved.addListener(handleClosedWindow);