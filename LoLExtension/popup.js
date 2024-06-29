document.addEventListener('DOMContentLoaded', () => {
	const select = document.getElementById('state');
	const providerSelect = document.getElementById('provider');
	const excludeLeaguesContainer = document.getElementById('excludeLeagues');

	chrome.storage.local.get('windowState', (result) => {
		select.value = result.windowState || 'normal';
	});

	chrome.storage.local.get('provider', (result) => {
		providerSelect.value = result.provider || 'twitch';
	});

	providerSelect.addEventListener('change', () => {
		const selectedProvider = providerSelect.value;
		chrome.storage.local.set({ provider: selectedProvider });
	});

	select.addEventListener('change', () => {
		const selectedState = select.value;
		chrome.storage.local.set({ windowState: selectedState });
	});

	const leagueNames = [
		'All-Star Event',
		'Arabian League',
		'CBLOL',
		'CBLOL Academy',
		'College Championship',
		'Elements League',
		'Elite Series',
		'EMEA Masters',
		'Esports Balkan League',
		'Golden League',
		'Greek Legends League',
		'Hitpoint Masters',
		'Honor Division',
		'Honor League',
		"King's Duel",
		'La Ligue Française',
		'LCK',
		'LCK Academy',
		'LCK Challengers',
		'LCL',
		'LEC',
		'LCS',
		'LPL',
		'LCS Challengers',
		'LCS Challengers Qualifiers',
		'Liga Master',
		'Liga Portuguesa',
		'LJL',
		'LJL Academy',
		'LLA',
		'LCO',
		'LoL Italian Tournament',
		'Master Flow League',
		'MSI',
		'NLC',
		'North Regional League',
		'NACL',
		'PCS',
		'PG Nationals',
		'Prime League',
		'South Regional League',
		'Stars League',
		'SuperLiga',
		'TAL',
		'TCL',
		'TFT',
		'TFT Remix Rumble',
		'Ultraliga',
		'VCS',
		'Volcano League',
		'Worlds',
		'Worlds Qualifying Series',
	];

	chrome.storage.local.get('excludedLeagues', (result) => {
		const excludedLeagues = new Set(result.excludedLeagues || []);

		leagueNames.forEach((leagueName) => {
			const leagueDiv = createLeagueDiv(leagueName, excludedLeagues);
			excludeLeaguesContainer.appendChild(leagueDiv);
		});
	});

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

	function toggleLeague(leagueName, excludedLeagues, isExcluded) {
		if (isExcluded) {
			excludedLeagues.delete(leagueName);
			console.log('Including league:', leagueName);
		} else {
			excludedLeagues.add(leagueName);
			console.log('Excluding league:', leagueName);
		}
		chrome.storage.local.set({ excludedLeagues: Array.from(excludedLeagues) });
	}
});
