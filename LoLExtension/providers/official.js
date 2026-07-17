const officialProvider = {
    id: PROVIDER_OFFICIAL,
    name: 'Official LoL Esports API',
    _scheduleCache: null,
    _scheduleCacheTime: 0,
    _cacheTTL: 60000,
    _streamsCache: {},

    async _api(endpoint) {
        const separator = endpoint.includes('?') ? '&' : '?';
        const url = `${OFFICIAL_API_BASE}${endpoint}${separator}hl=en-US`;
        return await fetchJson(url, {
            headers: { 'x-api-key': OFFICIAL_API_KEY }
        });
    },

    async getSchedule() {
        const now = Date.now();
        if (this._scheduleCache && (now - this._scheduleCacheTime) < this._cacheTTL) {
            return this._scheduleCache;
        }
        this._streamsCache = {};
        this._eventDetailsCache = {};
        let allEvents = [];
        let pageToken = null;
        do {
            const endpoint = pageToken
                ? `/getSchedule?pageToken=${pageToken}`
                : '/getSchedule';
            const data = await this._api(endpoint);
            if (data?.data?.schedule?.events) {
                allEvents = allEvents.concat(data.data.schedule.events);
            }
            pageToken = data?.data?.schedule?.pageToken;
        } while (pageToken);

        this._scheduleCache = { data: { schedule: { events: allEvents } } };
        this._scheduleCacheTime = now;
        return this._scheduleCache;
    },

    async getLeagues() {
        const data = await this._api('/getLeagues');
        const leagueMap = {};
        if (data?.data?.leagues) {
            for (const league of data.data.leagues) {
                const slug = league.slug;
                leagueMap[league.name] = `https://lolesports.com/live/${slug}`;
            }
        }
        return { ...FALLBACK_LEAGUE_URL, ...leagueMap };
    },

    _eventDetailsCache: {},

    async _getEventDetails(eventId) {
        if (!this._eventDetailsCache[eventId]) {
            this._eventDetailsCache[eventId] = this._api(`/getEventDetails?id=${eventId}`);
        }
        return this._eventDetailsCache[eventId];
    },

    async getStreams(leagueName) {
        if (this._streamsCache[leagueName]) {
            return this._streamsCache[leagueName];
        }

        const schedule = await this.getSchedule();
        const events = schedule?.data?.schedule?.events || [];
        let streams = [];

        for (const event of events) {
            if (event.state === 'completed') continue;
            if (event.league.name.trim() === leagueName && event.match?.id) {
                try {
                    const details = await this._getEventDetails(event.match.id);
                    if (details?.data?.event?.streams) {
                        for (const stream of details.data.event.streams) {
                            streams.push(stream);
                        }
                    }
                } catch (error) {
                    console.error(`Failed to fetch streams for ${event.match.id}:`, error);
                }
            }
        }

        const result = { streams, hasStreams: streams.length > 0 };
        this._streamsCache[leagueName] = result;
        return result;
    },

    clearCache() {
        this._scheduleCache = null;
        this._eventDetailsCache = {};
        this._streamsCache = {};
    }
};

registerProvider(officialProvider);
