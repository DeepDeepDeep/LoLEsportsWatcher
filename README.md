# LoL Esports Watcher Chrome Extension
The extension will automatically open a new window when a match is about to begin, and then close the window when the match has ended. 

# Installation

1. Clone or download the repository
2. Open Google Chrome and go to `chrome://extensions/`
3. Turn on Developer mode
4. Click on "Load unpacked" and select the folder where you cloned or downloaded the repository

# Usage
The extension periodically checks for new matches every five minutes and automatically opens a new window when a match is about to begin in less than 15 minutes. Once the match is over, the extension will close the window. 

# Popup Options

### Window State
- Customize the state of the popup window in the Chrome extension. Choose between "normal", "minimized", or "maximized".

<img width="269" alt="image" src="https://github.com/DeepDeepDeep/LoLEsportsWatcher/assets/54153890/e371d034-d406-4f90-9a86-93d7b67d419e">


### Exclude Leagues
- Exclude specific leagues from being opened.

<img width="250" alt="image" src="https://github.com/DeepDeepDeep/LoLEsportsWatcher/assets/54153890/e073b098-8e2d-44c2-9fad-2bb8f5174e07">

### Choose Provider
- Choose between Twitch and YouTube. If a YouTube stream is unavailable, it will automatically switch to Twitch.

<img width="271" alt="image" src="https://github.com/DeepDeepDeep/LoLEsportsWatcher/assets/54153890/b76cc6dd-9a10-4630-8b69-6dcecd87321f">


#### `--autoplay-policy=no-user-gesture-required` flag is required for Youtube streams to automatically play.

# Contributing 
Feel free to open a pull request if you can help, I have no clue about javascript or chrome extensions so I made this pretty fast so there might be some bugs and shitty code.


# Disclaimer
This extension is not affiliated with Riot Games or any of its partners. Use it at your own risk.
