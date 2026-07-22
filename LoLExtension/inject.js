(function() {
    window._lolWatcher = { forceFixEnabled: true, debugMode: false };
    const debug = (...args) => window._lolWatcher.debugMode && console.log(...args);

    window.addEventListener('message', (e) => {
        if (e.data?.type === 'LOL_WATCHER_CONFIG') {
            window._lolWatcher.forceFixEnabled = e.data.config.forceFixEnabled;
            window._lolWatcher.debugMode = !!e.data.config.debugMode;
        }
        if (e.data?.type === 'LOL_WATCHER_FETCH_DETAILS' && e.data.dropId) {
            fetch("https://account.service.lolesports.com/fandom-account/v1/earnedDrops/" + e.data.dropId + "?locale=en_GB", {
                credentials: 'include',
                headers: { 'Authorization': 'Cookie __Secure-access_token', 'Content-Type': 'application/json' }
            }).then(function(r) { return r.ok ? r.json() : null; }).then(function(details) {
                if (details) window.postMessage({ type: 'LOL_DROP_DETAILS', dropId: e.data.dropId, details }, '*');
            }).catch(function(){});
        }
    });

    window.__LOL_WATCHER_EXTENSION_ACTIVE__ = true;
    if (typeof window.__disableUserscriptMaster === 'function') {
        window.__disableUserscriptMaster();
        console.log("[LoL Watcher] Forced previously running userscript to yield master duties.");
    } else {
        console.log("[LoL Watcher] Claimed master priority for RMS Fixes.");
    }

    const originalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        const ws = protocols ? new originalWebSocket(url, protocols) : new originalWebSocket(url);
        if (url.includes("rms.si.lolesports.com/rms/v1/session")) {
            debug("[LoL Watcher] Intercepted RMS WebSocket creation.");
            ws.addEventListener("message", async (event) => {
                try {
                    let dataText = event.data;
                    if (event.data instanceof Blob) {
                        dataText = await event.data.text();
                    }
                    const msg = JSON.parse(dataText);
                    if (msg.subject === "rms:message" && msg.payload?.resource === "esports/v1/drop_fulfilled") {
                        debug("[LoL Watcher] Drop fulfilled message intercepted:", msg);
                        const dropData = {
                            url: window.location.pathname,
                            league: window.location.pathname.split('/')[2] || 'Unknown',
                            timestamp: Date.now(),
                            ...msg
                        };
                        window.postMessage({ type: 'NEW_LOL_DROP', drop: dropData }, '*');
                        try {
                            const inner = JSON.parse(msg.payload.payload);
                            const dropId = inner.message?.i;
                            if (dropId) {
                                (function(id) {
                                    fetch("https://account.service.lolesports.com/fandom-account/v1/earnedDrops/" + id + "?locale=en_GB", {
                                        credentials: 'include',
                                        headers: { 'Authorization': 'Cookie __Secure-access_token', 'Content-Type': 'application/json' }
                                    }).then(r => r.ok ? r.json() : null).then(details => {
                                        if (details) window.postMessage({ type: 'LOL_DROP_DETAILS', dropId: id, details }, '*');
                                    }).catch(function(){});
                                })(dropId);
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            });
            ws.addEventListener("close", (event) => {
                if (window._lolWatcher.forceFixEnabled && !event.wasClean) {
                    debug("[LoL Watcher] RMS WebSocket unclean close detected. Delaying managed reconnect...");
                    setTimeout(() => {
                        const rmsManager = window._lolWatcher.rmsSocketManager;
                        if (rmsManager?.connect && rmsManager.rmsClientConfig) {
                            debug("[LoL Watcher] Forcing reconnect via captured RMS manager.");
                            rmsManager.connect(rmsManager.rmsClientConfig);
                        } else {
                            console.error("[LoL Watcher] No RMS manager captured to force reconnect.");
                        }
                    }, 5000);
                }
            });
        }
        return ws;
    };
    window.WebSocket.prototype = originalWebSocket.prototype;
    Object.assign(window.WebSocket, originalWebSocket);

    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        if (window._lolWatcher.forceFixEnabled && typeof url === 'string' && url.includes('/v1/session/clientconfig/rms')) {
            return originalFetch.apply(this, arguments).then(response => {
                if (!response.ok) throw new Error("RMS Config failed with status: " + response.status);
                return response;
            }).catch(error => {
                debug("[LoL Watcher] Original RMS config fetch failed! Injecting fallback config.", error.message);
                const fallbackConfig = {
                    "client_config_value": {
                        "rms.allow_bad_cert.enabled": false,
                        "rms.handshake_timeout_ms": 5000,
                        "rms.heartbeat_interval_seconds": 55,
                        "rms.host": "wss://eu.edge.rms.si.lolesports.com",
                        "rms.max_reconnect_delay_ms": 300000,
                        "rms.min_reconnect_delay_ms": 100,
                        "rms.port": 443,
                        "rms.protocol_preference": "ipv4",
                        "rms.socket_timeout_ms": 30000,
                        "rms.use_direct_connection": true
                    }
                };
                return new Response(JSON.stringify(fallbackConfig), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                });
            });
        }
        return originalFetch.apply(this, arguments);
    };

    const patchAllModules = (modules) => {
        for (const moduleId in modules) {
            if (Object.prototype.hasOwnProperty.call(modules, moduleId)) {
                const moduleString = modules[moduleId].toString();
                if (moduleString.includes('Connecting WebSocket at ')) {
                    const originalRmsModule = modules[moduleId];
                    modules[moduleId] = function(module, exports, require) {
                        originalRmsModule.apply(this, arguments);
                        window._lolWatcher.rmsSocketManager = module.exports.default;
                        debug('[LoL Watcher] RmsWebSocket manager instance captured for auto-reconnect.');
                    };
                }
            }
        }
    };

    const originalPush = window.webpackJsonp ? window.webpackJsonp.push : [].push;
    const patchedPush = function() { 
        const args = arguments; 
        if (window._lolWatcher.forceFixEnabled && args[0] && args[0][1]) { 
            patchAllModules(args[0][1]); 
        } 
        return originalPush.apply(window.webpackJsonp, args); 
    };
    
    if (window.webpackJsonp) { 
        window.webpackJsonp.push = patchedPush; 
    } else { 
        Object.defineProperty(window, 'webpackJsonp', { 
            configurable: true, 
            set(value) { 
                Object.defineProperty(window, 'webpackJsonp', { value: value, writable: true }); 
                value.push = patchedPush; 
            }, 
            get() { return undefined; } 
        }); 
    }

    window.postMessage({
        type: 'LOL_WATCHER_STATUS',
        status: {
            webSocketPatched: typeof window.WebSocket !== 'undefined' && window.WebSocket !== originalWebSocket,
            fetchPatched: typeof window.fetch !== 'undefined' && window.fetch !== originalFetch,
            webpackPatched: !!(window.webpackJsonp?.push === patchedPush || Object.getOwnPropertyDescriptor(window, 'webpackJsonp')?.set),
            userscriptKilled: typeof window.__disableUserscriptMaster === 'function'
        }
    }, '*');
})();
