const API_URL = 'https://leaguedrops.onrender.com/schedule';
const CACHE_KEY = 'schedule_cache';

async function fetchSchedule() {
  try {
    const cachedSchedule = await getCachedSchedule();
    if (cachedSchedule) {
      showUpcomingMatches(cachedSchedule);
    }
    const response = await fetch(API_URL);
    const data = await response.json();
    saveCachedSchedule(data);
    showUpcomingMatches(data);
  } catch (error) {
    console.error(error);
  }
}

function showUpcomingMatches(data) {
  const matches = data.data.schedule.events.filter(event => event.state === 'unstarted');
  const matchesList = document.getElementById('matches');
  matchesList.innerHTML = '';

  if (matches.length === 0) {
    matchesList.innerHTML = '<li>No upcoming matches</li>';
    return;
  }

  matches.forEach(match => {
    const start = new Date(match.startTime);
    const matchItem = document.createElement('li');
    matchItem.innerHTML = `<span class="league">${match.league.name}</span> - <span class="time">${start.toLocaleString()}</span>`;
    matchesList.appendChild(matchItem);
  });
}

async function getCachedSchedule() {
  return new Promise(resolve => {
    chrome.storage.local.get([CACHE_KEY], result => {
      const cachedData = result[CACHE_KEY];
      if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
        resolve(cachedData.data);
      } else {
        resolve(null);
      }
    });
  });
}

function saveCachedSchedule(data) {
  const cachedData = {
    data: data,
    timestamp: Date.now()
  };
  chrome.storage.local.set({[CACHE_KEY]: cachedData});
}

fetchSchedule();
