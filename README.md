# LoL Esports Watcher Chrome Extension
The extension will automatically open a new window when a match is about to begin, and then close the window when the match has ended. It also tracks the drops you earn while watching.

# Installation

1. Clone or download the repository
2. Open Google Chrome and go to `chrome://extensions/`
3. Turn on Developer mode
4. Click on "Load unpacked" and select the `LoLExtension` folder inside the repository

# Popup

The popup is organized into tabs: **Leagues**, **Drops**, **Settings**, **Stats**, and **About**. The refresh button in the header forces an immediate schedule update.

### Leagues
- Every supported league, grouped by tier. Leagues with a match in progress show a red LIVE indicator, upcoming matches show their start time.
- Toggle a league OFF to exclude it from being opened.
- Click a league to open its lolesports.com page in a new window.

<img width="542" alt="Leagues tab" src="https://github.com/user-attachments/assets/9173521c-c520-4edc-8740-f55648cf358a">

### Drops
- Tracks the drops you earn while watching games on lolesports.com and shows the reward, its description, and which league it dropped from.
- Expand a drop to view its raw technical data or copy it to the clipboard.

<img width="543" alt="Drops tab" src="https://github.com/user-attachments/assets/c0dce356-c13d-42e1-ab36-6ec1d9ff747a">

### Settings

- **API Data Source** - choose between the Official LoL Esports API (default, fetched directly from Riot) and the Third-Party API.
- **Check interval** - how often the schedule is polled (1-15 minutes).
- **Window State** - customize the state of windows opened by the extension. Choose between "normal", "minimized", or "maximized".
- **Streaming** - prefer Twitch or YouTube. If a stream is unavailable on the preferred platform, it automatically falls back to the other one.
- **Fix Drops Notification** - bypasses Riot's WebSocket bugs so drop notifications keep working (enabled by default).
- **Debug logging** - detailed logging in the service worker console.

The same options are also available on the extension's options page (`chrome://extensions/` → extension details → Extension options).

#### `--autoplay-policy=no-user-gesture-required` flag is required for Youtube streams to automatically play.

### Stats
- Live and upcoming match counts, active vs excluded leagues, schedule events in the last poll, and bandwidth/request usage per API provider.

# Thanks
Big thanks to [ReformedDoge](https://github.com/ReformedDoge) for maintaining the repository and for his major contributions to the extension.

# Disclaimer
This extension is not affiliated with Riot Games or any of its partners. Use it at your own risk.
