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

	const removePlayerButton = document.getElementById('removePlayerButton');

	// Load the Remove Player toggle state from storage
	chrome.storage.local.get('removePlayerEnabled', (result) => {
	    const isEnabled = result.removePlayerEnabled || false;
	    updateRemovePlayerButton(isEnabled);
	});

	// Add event listener for the Remove Player button
	removePlayerButton.addEventListener('click', () => {
	    chrome.storage.local.get('removePlayerEnabled', (result) => {
	        const isEnabled = !(result.removePlayerEnabled || false); // Toggle state
	        chrome.storage.local.set({ removePlayerEnabled: isEnabled });
	        updateRemovePlayerButton(isEnabled);

	        // Send a unified message
	        chrome.runtime.sendMessage({ action: "togglePlayerRemoval", enabled: isEnabled });
	    });
	});

	function updateRemovePlayerButton(isEnabled) {
	    removePlayerButton.textContent = isEnabled ? "ON" : "OFF";
	    removePlayerButton.classList.toggle("on", isEnabled);
	    removePlayerButton.classList.toggle("off", !isEnabled);
	}


	const leagueNames = [
	    "LTA North",
	    "LTA South",
	    "LEC",
	    "LCK",
	    "LPL",
	    "Americas Challengers",
	    "NACL",
	    "EMEA Masters",
	    "LCP",
	    "LJL",
	    "TCL",
	    "NLC",
	    "La Ligue Française",
	    "Road of Legends",
	    "Liga Portuguesa",
	    "LoL Italian Tournament",
	    "Rift Legends",
	    "SuperLiga",
	    "Prime League",
	    "Hitpoint Masters",
	    "Esports Balkan League",
	    "Hellenic Legends League",
	    "Arabian League",
	    "LCK Challengers",
	    "Circuito Desafiante",
	    "North Regional League",
	    "South Regional League",
	    "Worlds",
	    "MSI",
	    "TFT Magic n' Mayhem",
	    "LLA",
	    "PCS",
	    "LCO",
	    "VCS",
	    "Ultraliga",
	    "King's Duel",
	    "LCS",
	    "CBLOL",
	    "LCL",
	    "First Stand",
	    "LTA Cross-Conference",
	    "TFT"
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
