# Zombie High – Windows Steam candidate

## Scope

This is an additive desktop distribution of the existing Vue/Three.js client,
Express/WebSocket server and TypeScript game engine. No card definitions, AI,
board rules, Vue screens, API payloads or browser launch scripts are changed.
The existing browser deployment remains separate.

The desktop process starts an ephemeral IPv4 loopback HTTP listener, then opens
the compiled UI in a sandboxed Electron window. Existing API and WebSocket
paths are used verbatim. The existing lobby's player links open same-origin
windows. F11 toggles fullscreen in the initial window. Closing the last window
stops the local runtime. Current games are in-memory, as in the original server.

**Scope limitation:** copied player links work on this machine only. This is not
Steam online matchmaking, internet multiplayer, or Steam identity integration.
Keep using the existing hosted browser deployment for remote play until a
separate network pass is designed. Spectator links are passed through unchanged;
the current App.vue does not implement a distinct spectator rendering route.
This first candidate does not add a new spectator mode, saves, achievements,
cloud storage, controller support or Steam overlay support.

## Build on Windows x64

Install Node.js 24 and Git, then from the repository root:

    npm ci
    npm run desktop:build
    npm run desktop:smoke

Run build/steam/ZombieHigh-win32-x64/ZombieHigh.exe. Keep its entire directory.
The machine playing the build does not need Node.js or an internet connection
for local play. Electron 45.5.0 is pinned in the packaging script; revisit the
pin for security patches before release. The Electron download tooling itself
is installed at build time; its transitive lock is not checked in yet.

GitHub Actions: open the Steam desktop candidate workflow and download the
ZombieHigh-win64-Steam-candidate artifact from a successful desktop job. The
regression job runs the existing Mocha suite independently. Do not merge or
upload a candidate if either job fails without investigating the baseline.

## Regression gate

- Compare existing browser and desktop UI at 1280x720 and 1920x1080.
- Create a human-vs-CPU game; finish setup, placement, movement, card play,
  zombie phase, draft, scoring, and a full match. Exercise CPU difficulties.
- Create a two-human game, open both player links, test cross-window state,
  refresh, clipboard, return to lobby, and another game.
- Verify all card tiers, hero art, board overlay, WebGL, and keyboard/mouse.
- Launch from a directory with spaces, close all windows, relaunch, disconnect
  the internet and repeat. Compare against the master branch.
- Check the CI regression and desktop smoke results; run the Windows candidate
  on a clean machine before Steam upload.

## SteamPipe

Create an App ID and Windows depot in Steamworks. Download the official
Steamworks SDK and use its ContentBuilder tooling. Copy the contents of
build/steam/ZombieHigh-win32-x64/ (not the parent folder) into your Windows
depot content root. Set the Windows launch executable to ZombieHigh.exe,
with no arguments. Upload to a private beta/test branch before any release.
See https://partner.steamgames.com/doc/sdk/uploading for the current process.

Do not include development logs, tests, SDK secrets, source repository, or
steam_appid.txt in the depot. No Steam account credentials are needed by this
build workflow. Steamworks API features are not wired in. Before launch:
verify rights to the original board game, title and all assets; audit third
party licenses; review dependency security; replace the default executable
icon/version metadata; consider signing; create store assets and disclosures;
complete Steamworks app review and gameplay validation.


## Lobby beta (second pass)

Front Desk now uses room codes, public/private rooms, guest ready status, host
CPU settings, and automatic transition to the existing game route. The original
link-based lobby remains available for developer regression at /?legacy=1.
The lobby API uses private random membership tokens and sets a per-game HttpOnly
cookie to authorize existing game actions and WebSocket connections. A single
server owns the entire match; different machines must connect to the same HTTPS
host. Local mode does not expose a network listener. A shared browser profile
should use separate profiles for separate seats because match cookies are shared.

Deploy this branch's Dockerfile to a single persistent-running HTTPS service
with WebSocket upgrades (e.g. Railway). Set PORT to the hosting service's port.
Set ZOMBIEHIGH_SERVER_URL to its HTTPS origin when running npm run desktop:build
to bake the online endpoint into the desktop candidate; for a local developer
test, set the same environment variable before launching the executable. This
adds a Play menu to switch between online and offline. The build without this
setting remains local only. Do not ship an arbitrary or untrusted origin.

This is a lobby/network prototype, not release-ready online multiplayer.
Game payloads still include full state including potentially hidden cards.
Before public internet deployment, implement player-specific state filtering,
disable the legacy creation endpoint in production, add rate limiting and
session expiration/cleanup, reconnect and abandonment handling, and validate
with distinct machines. Rooms and matches are in memory and restart loses them.
Steam identity, friend invites, and Steam networking are not implemented.
