const RENDER_API_BASE = 'https://leaguewatcher.onrender.com';
const OFFICIAL_API_BASE = 'https://esports-api.lolesports.com/persisted/gw';
const OFFICIAL_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';

const FALLBACK_LEAGUE_URL = {"Americas Challengers":"https://lolesports.com/live/americas_challengers","Arabian League":"https://lolesports.com/live/arabian_league","CBLOL":"https://lolesports.com/live/cblol-brazil/cblolenglish","EMEA Masters":"https://lolesports.com/live/emea_masters/emeamasters","Esports Balkan League":"https://lolesports.com/live/esports_balkan_league","Hellenic Legends League":"https://lolesports.com/live/hellenic_legends_league/helleniclegends","Hitpoint Masters":"https://lolesports.com/live/hitpoint_masters/hitpointcz","LCK":"https://lolesports.com/live/lck/lck","LCK Challengers":"https://lolesports.com/live/lck_challengers_league/lckcl","LCL":"https://lolesports.com/live/lcl/lcl","LCO":"https://lolesports.com/live/lco/lco","LCP":"https://lolesports.com/live/lcp/lolpacificen","LCS":"https://lolesports.com/live/lcs/lcs","LEC":"https://lolesports.com/live/lec/lec","LJL":"https://lolesports.com/live/ljl-japan","LLA":"https://lolesports.com/live/lla/lla","LPL":"https://lolesports.com/live/lpl/lpl","LTA Cross-Conference":"https://lolesports.com/live/lta_cross","LTA North":"https://lolesports.com/live/lta_n/","LTA South":"https://lolesports.com/live/lta_s/ltaespanol","La Ligue Française":"https://lolesports.com/live/lfl/otplol_","Liga Portuguesa":"https://lolesports.com/live/liga_portuguesa/inygontv1","LoL Italian Tournament":"https://lolesports.com/live/lit/litofficial","MSI":"https://lolesports.com/live/msi/riotgames","NACL":"https://lolesports.com/live/nacl","NLC":"https://lolesports.com/live/nlc/nlclol","North Regional League":"https://lolesports.com/live/north_regional_league/lvpnorte","PCS":"https://lolesports.com/live/pcs/lolpacific","Prime League":"https://lolesports.com/live/primeleague","Rift Legends":"https://lolesports.com/live/rift_legends/nervarien","Road of Legends":"https://lolesports.com/live/roadoflegends/road_of_legends","South Regional League":"https://lolesports.com/live/south_regional_league/lvpsur","SuperLiga":"https://lolesports.com/live/superliga/lvpsuperliga_ow","TCL":"https://lolesports.com/live/tcl/tcl","Ultraliga":"https://lolesports.com/live/ultraliga/ultraliga","VCS":"https://lolesports.com/live/vcs/vcs","Worlds":"https://lolesports.com/live/worlds/riotgames","King's Duel":"https://lolesports.com/live/kings_duel","First Stand":"https://lolesports.com/live/first_stand","TFT":"https://lolesports.com/live/tft","TFT Magic n' Mayhem":"https://lolesports.com/live/tft"};

let stats = null;
let _debugMode = false;

async function initStats() {
    try {
        const s = await chrome.storage.session.get('requestStats');
        stats = s.requestStats || null;
    } catch(e) {}
    if (!stats) {
        stats = {
            providers: {
                thirdparty: { bytes: 0, requests: 0, label: 'Third-Party API' },
                official: { bytes: 0, requests: 0, label: 'Official LoL API' }
            },
            lastPollTime: null
        };
    }
}

async function initDebugMode() {
    _debugMode = !!(await getFromLocalStorage('debugMode', false));
}

function debugLog(...args) {
    if (_debugMode) {
        console.log('[DEBUG]', ...args);
    }
}

function getRequestStats() {
    if (!stats) return { providers: {}, total: { bytes: 0, requests: 0 }, lastPollTime: null };
    const total = Object.values(stats.providers).reduce((s, p) => ({ bytes: s.bytes + p.bytes, requests: s.requests + p.requests }), { bytes: 0, requests: 0 });
    return { providers: stats.providers, total, lastPollTime: stats.lastPollTime };
}

async function fetchJson(url, options = {}) {
    if (!stats) await initStats();
    const providerId = url.startsWith(RENDER_API_BASE) ? 'thirdparty' : (url.startsWith(OFFICIAL_API_BASE) ? 'official' : null);
    debugLog(`Fetch: ${url} [${providerId || 'unknown'}]`);
    try {
        const response = await fetch(url, options);
        const text = await response.text();
        debugLog(`Response: ${url.slice(0,60)}... ${text.length} bytes, status ${response.status}`);
        if (providerId && stats && stats.providers[providerId]) {
            stats.providers[providerId].requests++;
            stats.providers[providerId].bytes += text.length;
            chrome.storage.session.set({ requestStats: stats }).catch(() => {});
        }
        return JSON.parse(text);
    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        debugLog(`Fetch FAILED: ${url} - ${error.message}`);
        return null;
    }
}

async function getFromLocalStorage(key, defaultValue) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key] ?? defaultValue);
        });
    });
}

const PROVIDER_THIRDPARTY = 'thirdparty';
const PROVIDER_OFFICIAL = 'official';

const _providers = {};

function registerProvider(provider) {
    if (!provider.id || !provider.name) {
        console.error('Provider must have id and name');
        return;
    }
    _providers[provider.id] = provider;
}

function getProvider(id) {
    return _providers[id];
}

function getAllProviders() {
    return Object.values(_providers);
}

async function getCurrentProvider() {
    const id = await getFromLocalStorage('apiProvider', 'official');
    return getProvider(id) || getProvider('official');
}
