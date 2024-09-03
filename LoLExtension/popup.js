const LEAGUE_NAMES = [
	'All-Star Event', 'Arabian League', 'CBLOL', 'CBLOL Academy', 'College Championship',
	'Elements League', 'Elite Series', 'EMEA Masters', 'Esports Balkan League', 'Golden League',
	'Greek Legends League', 'Hitpoint Masters', 'Honor Division', 'Honor League', "King's Duel",
	'La Ligue Française', 'LCK', 'LCK Academy', 'LCK Challengers', 'LCL', 'LEC', 'LCS', 'LPL',
	'LCS Challengers', 'LCS Challengers Qualifiers', 'Liga Master', 'Liga Portuguesa', 'LJL',
	'LJL Academy', 'LLA', 'LCO', 'LoL Italian Tournament', 'Master Flow League', 'MSI', 'NLC',
	'North Regional League', 'PCS', 'PG Nationals', 'Prime League', 'South Regional League',
	'Stars League', 'SuperLiga', 'TAL', 'TCL', "TFT Magic n' Mayhem", 'Ultraliga', 'VCS', 'Volcano League', 'Worlds', 'Worlds Qualifying Series'
  ];
  
  async function getFromStorage(key, defaultValue) {
	const result = await chrome.storage.local.get(key);
	return result[key] ?? defaultValue;
  }
  
  async function setInStorage(key, value) {
	await chrome.storage.local.set({ [key]: value });
  }
  
  function createLeagueDiv(leagueName, excludedLeagues) {
	const leagueDiv = document.createElement('div');
	leagueDiv.classList.add('button-container');
  
	const leagueLabel = document.createElement('label');
	leagueLabel.classList.add('label');
	leagueLabel.textContent = leagueName;
  
	const leagueButton = document.createElement('button');
	leagueButton.classList.add('button');
	leagueButton.dataset.leagueName = leagueName;
	leagueButton.textContent = excludedLeagues.has(leagueName) ? 'OFF' : 'ON';
  
	leagueButton.addEventListener('click', () => {
	  const isExcluded = excludedLeagues.has(leagueName);
	  toggleLeague(leagueName, excludedLeagues, isExcluded);
	  leagueButton.textContent = isExcluded ? 'ON' : 'OFF';
	  leagueDiv.classList.toggle('excluded');
	  leagueDiv.classList.toggle('included');
	  leagueButton.classList.toggle('off');
	  leagueButton.classList.toggle('on');
	});
  
	if (excludedLeagues.has(leagueName)) {
	  leagueDiv.classList.add('excluded');
	  leagueButton.classList.add('off');
	} else {
	  leagueDiv.classList.add('included');
	  leagueButton.classList.add('on');
	}
  
	leagueDiv.appendChild(leagueLabel);
	leagueDiv.appendChild(leagueButton);
  
	return leagueDiv;
  }
  
  async function toggleLeague(leagueName, excludedLeagues, isExcluded) {
	if (isExcluded) {
	  excludedLeagues.delete(leagueName);
	  console.log('Including league:', leagueName);
	} else {
	  excludedLeagues.add(leagueName);
	  console.log('Excluding league:', leagueName);
	}
	await setInStorage('excludedLeagues', Array.from(excludedLeagues));
  }
  
  async function initPopup() {
	const select = document.getElementById('state');
	const providerSelect = document.getElementById('provider');
	const excludeLeaguesContainer = document.getElementById('excludeLeagues');
  
	select.value = await getFromStorage('windowState', 'normal');
	providerSelect.value = await getFromStorage('provider', 'twitch');

	providerSelect.addEventListener('change', async () => {
	  const selectedProvider = providerSelect.value;
	  await setInStorage('provider', selectedProvider);
	});
  
	select.addEventListener('change', async () => {
	  const selectedState = select.value;
	  await setInStorage('windowState', selectedState);
	});
  
	const excludedLeagues = new Set(await getFromStorage('excludedLeagues', []));
  
	LEAGUE_NAMES.forEach((leagueName) => {
	  const leagueDiv = createLeagueDiv(leagueName, excludedLeagues);
	  excludeLeaguesContainer.appendChild(leagueDiv);
	});
  }

  document.addEventListener('DOMContentLoaded', initPopup);