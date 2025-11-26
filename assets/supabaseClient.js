// Supabase client initialization and helpers
(function(){
	const url = window.SUPABASE_URL;
	const anon = window.SUPABASE_ANON_KEY;
	if(!url || !anon){ console.warn('Supabase config missing'); return; }
	const { createClient } = window.supabase || {};
	if(!createClient){ console.warn('Supabase JS not loaded'); return; }
	const client = createClient(url, anon);

	const SB = window.SB || (window.SB = {});
	SB.client = client;

	// Data helpers
	SB.getRoutesWithDetails = async () => {
		const { data, error } = await client
			.from('routes')
			.select('id,name,code,stops(id,name,lat,lng,descr,passengers),buses(id,name,capacity,driver),congestion,alt_path');
		if(error) throw error; return data || [];
	};

	SB.subscribeBusPositions = (busId, onMessage, onStatus) => {
		const chan = client.channel(`positions:${busId}`)
			.on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `bus_id=eq.${busId}` }, payload => onMessage && onMessage(payload))
			.subscribe((status) => onStatus && onStatus(status));
		return chan;
	};

	SB.getAlerts = async (busId) => {
		const { data, error } = await client.from('alerts').select('*').eq('bus_id', busId).order('created_at', { ascending: false }).limit(50);
		if(error) throw error; return data || [];
	};
	SB.subscribeAlerts = (busId, onMessage) => {
		return client.channel(`alerts:${busId}`)
			.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts', filter: `bus_id=eq.${busId}` }, payload => onMessage && onMessage(payload))
			.subscribe();
	};

	SB.createAlert = async ({ busId, type, notes }) => {
		const { data, error } = await client.from('alerts').insert({ bus_id: busId, type, notes }).select('*').single();
		if(error) throw error; return data;
	};

	// Bulk upsert positions (for offline queue flush)
	SB.bulkUpsertPositions = async (rows) => {
		const { data, error } = await client.from('positions').upsert(rows, { onConflict: 'id' });
		if(error) throw error; return data;
	};

	// Presence example using Realtime channel
	SB.onPresence = (busId, onCount) => {
		const channel = client.channel(`presence:${busId}`, { config: { presence: { key: busId } } });
		channel.on('presence', { event: 'sync' }, () => {
			const state = channel.presenceState();
			const count = Object.keys(state).length;
			onCount && onCount(count);
		});
		channel.subscribe();
		return channel;
	};
	SB.joinPresence = (busId, payload) => {
		const ch = client.channel(`presence:${busId}`);
		ch.track(payload || { role: 'viewer' });
		return ch;
	};
})();

