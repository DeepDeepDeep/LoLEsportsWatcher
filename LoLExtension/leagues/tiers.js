const LEAGUE_TIERS = [
    {
        id: 'international',
        name: 'International Events',
        leagues: ['Worlds', 'MSI', 'First Stand', 'Esports World Cup', 'Worlds Qualifying Series', 'Americas Cup']
    },
    {
        id: 'tier1',
        name: 'Tier 1 | Major Regions',
        leagues: ['LEC', 'LCK', 'LPL', 'LCS', 'CBLOL', 'LCP']
    },
    {
        id: 'tier2',
        name: 'Tier 2 | Challengers & Regional',
        leagues: ['EMEA Masters', 'NACL', 'LCK Challengers', 'Circuito Desafiante', 'North Regional League', 'South Regional League', 'Americas Challengers', 'PCS', 'VCS', 'LJL', 'LCO', 'LLA']
    },
    {
        id: 'tier3',
        name: 'Tier 3 | EMEA Regional Leagues',
        leagues: ['TCL', 'NLC', 'La Ligue Fran\u00e7aise', 'Prime League', 'SuperLiga', 'Ultraliga', 'Rift Legends', 'Hitpoint Masters', 'Esports Balkan League', 'Hellenic Legends League', 'Arabian League', 'Liga Portuguesa', 'LoL Italian Tournament', 'Road of Legends', 'LES']
    },
    {
        id: 'special',
        name: 'Special / Other',
        leagues: ["King's Duel", 'LCL', 'KeSPA Cup', 'TFT Esports', 'TFT Magic n\' Mayhem', 'TFT']
    },
    {
        id: 'tier1_former',
        name: 'Former Tier 1 (2025)',
        leagues: ['LTA North', 'LTA South', 'LTA Cross-Conference']
    }
];

const LEAGUE_ALIASES = {
    'LRN': 'North Regional League',
    'LRS': 'South Regional League',
    'EWC': 'Esports World Cup',
    'TFT Esports ': 'TFT Esports'
};

function resolveLeagueName(apiName) {
    return LEAGUE_ALIASES[apiName] || apiName;
}

function getAllLeagueNames() {
    const names = [];
    for (const tier of LEAGUE_TIERS) {
        for (const league of tier.leagues) {
            names.push(league);
        }
    }
    return names;
}
