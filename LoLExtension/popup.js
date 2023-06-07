document.addEventListener('DOMContentLoaded', () => {
	const select = document.getElementById('state');
	const excludeLeaguesContainer = document.getElementById('excludeLeagues');

	chrome.storage.local.get('windowState', (result) => {
		if (result.windowState) {
			select.value = result.windowState;
		}
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
		'La Ligue Française',
		'LCK',
		'LCK Academy',
		'LCK Challengers',
		'LCL',
		'LEC',
		'LCS',
		'LCS Challengers',
		'LCS Challengers Qualifiers',
		'Liga Master',
		'Liga Portuguesa',
		'LJL',
		'LJL Academy',
		'LLA',
		'LCO',
		'LCS',
		'Master Flow League',
		'MSI',
		'NLC',
		'North Regional League',
		'PCS',
		'PG Nationals',
		'Prime League',
		'South Regional League',
		'Stars League',
		'SuperLiga',
		'TAL',
		'TCL',
		'TFT Monsters Attack!',
		'TFT Rising Legends',
		'TFT Western LCQ',
		'Ultraliga',
		'VCS',
		'Volcano League',
		'Worlds',
	];

	chrome.storage.local.get('excludedLeagues', (result) => {
		const excludedLeagues = new Set(result.excludedLeagues || []);

		leagueNames.forEach((leagueName) => {
			const leagueDiv = document.createElement('div');
			leagueDiv.classList.add('button-container');

			const leagueLabel = document.createElement('label');
			leagueLabel.classList.add('label');
			leagueLabel.textContent = leagueName;

			const leagueButton = document.createElement('button');
			leagueButton.classList.add('button');
			leagueButton.dataset.leagueName = leagueName;
			leagueButton.textContent = excludedLeagues.has(leagueName) ? 'OFF' : 'ON';

			if (excludedLeagues.has(leagueName)) {
				leagueDiv.classList.add('excluded');
			}

			leagueButton.addEventListener('click', () => {
				const isExcluded = excludedLeagues.has(leagueName);
				if (isExcluded) {
					leagueButton.textContent = 'ON';
					leagueDiv.classList.remove('excluded');
					includeLeague(leagueName);
				} else {
					leagueButton.textContent = 'OFF';
					leagueDiv.classList.add('excluded');
					excludeLeague(leagueName);
				}
				chrome.storage.local.set({ excludedLeagues: Array.from(excludedLeagues) });
			});

			leagueDiv.appendChild(leagueLabel);
			leagueDiv.appendChild(leagueButton);

			excludeLeaguesContainer.appendChild(leagueDiv);
		});
	});
});

function excludeLeague(leagueName) {
	chrome.storage.local.get('excludedLeagues', (result) => {
		const excludedLeagues = new Set(result.excludedLeagues || []);
		excludedLeagues.add(leagueName);
		chrome.storage.local.set({ excludedLeagues: Array.from(excludedLeagues) });
		console.log('Excluding league:', leagueName);
	});
}

function includeLeague(leagueName) {
	chrome.storage.local.get('excludedLeagues', (result) => {
		const excludedLeagues = new Set(result.excludedLeagues || []);
		excludedLeagues.delete(leagueName);
		chrome.storage.local.set({ excludedLeagues: Array.from(excludedLeagues) });
		console.log('Including league:', leagueName);
	});
}
