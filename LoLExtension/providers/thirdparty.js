const thirdPartyProvider = {
    id: PROVIDER_THIRDPARTY,
    name: 'Third-Party API',

    async getSchedule() {
        return await fetchJson(`${RENDER_API_BASE}/schedule`);
    },

    async getLeagues() {
        const data = await fetchJson(`${RENDER_API_BASE}/leagues`);
        return { ...FALLBACK_LEAGUE_URL, ...data };
    },

    async getStreams(leagueName) {
        const data = await fetchJson(`${RENDER_API_BASE}/streams`);
        let streams = [];

        if (!data?.data?.schedule?.events) {
            console.log('No events found in data');
            return { streams, hasStreams: false };
        }

        const events = data.data.schedule.events;
        for (const event of events) {
            if (event.league.name.trim() === leagueName) {
                try {
                    for (const stream of event.streams) {
                        streams.push(stream);
                    }
                } catch (error) {
                    console.error(error);
                }
            }
        }
        return { streams, hasStreams: streams.length > 0 };
    }
};

registerProvider(thirdPartyProvider);
