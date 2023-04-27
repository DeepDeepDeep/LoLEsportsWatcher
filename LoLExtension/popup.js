const API_URL = 'https://leaguedrops.onrender.com/schedule';

async function fetchSchedule() {
  try {
    const response = await fetch(API_URL);
    const data = await response.json();
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





fetchSchedule();
