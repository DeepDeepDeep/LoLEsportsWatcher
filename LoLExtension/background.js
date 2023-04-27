const API_URL = 'https://leaguedrops.onrender.com/schedule';
const LEAGUE_MAP = {
  'EMEA Masters': 'https://lolesports.com/live/emea_masters',
  'MSI' : 'https://lolesports.com/live/msi',
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
  'LPL': 'https://lolesports.com/live/lpl',
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
  'Ultraliga': '',
  'SuperLiga': '',
  'Prime League': '',
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
  'TFT Rising Legends': 'https://lolesports.com/live/tft_esports',
  'TAL': '',
  'Master Flow League': ''
}

async function fetchSchedule() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
    checkSchedule(data);
  } catch (error) {
    console.error(error);
  }
}

function checkSchedule(data) {
  if (!data?.data?.schedule?.events) {
    console.error('Schedule data is invalid:', data);
    return;
  }

  console.log('Checking schedule...');
  const events = data.data.schedule.events;
  const now = new Date();

  chrome.tabs.query({}, async function (queryResults) {
    const leagueTabs = {};

    for (const tab of queryResults) {
      const leagueUrl = LEAGUE_MAP[tab.url];
      if (leagueUrl) {
        leagueTabs[leagueUrl] = tab.id;
      }
    }

    for (const event of events) {
      if (event.state === "completed" && leagueTabs[event.league.url]) {
        console.log(`Closing ${event.league.name} tab`);
        await chrome.tabs.remove(leagueTabs[event.league.url]);
        delete leagueTabs[event.league.url];
      } else if (event.state !== "completed" && !leagueTabs[event.league.url]) {
        const start = new Date(event.startTime);
        const timeUntilStart = start - now;

        if (timeUntilStart <= 10 * 30 * 1000) {
          console.log(`Opening ${event.league.name} in a new tab`);
          const leagueUrl = LEAGUE_MAP[event.league.name];
          if (leagueUrl) {
            chrome.tabs.create({ url: leagueUrl }, function(tab) {
              leagueTabs[leagueUrl] = tab.id;
              chrome.tabs.update(tab.id, { muted: true });
            });
          } else {
            console.error(`No URL found for league ${event.league.name}`);
          }
        }
      }
    }
  });
}

chrome.runtime.onInstalled.addListener(function() {
  fetchSchedule();
});


setInterval(fetchSchedule, 180000);
