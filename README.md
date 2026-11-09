# TimingSlip

Static site for [games.timingslip.com](https://games.timingslip.com). Clocks, arcade games, and ambient instruments, opened from one hub.

There is no build step and no package manifest. The files in this folder are the site.

## Hub

`index.html` is the constellation. The center orb opens `living.html` (Enter). That page is the same scene turned inward, and its orb returns home.

Satellites open a destination. Four of them carry a second link:

| Satellite | Main | Branch |
| --- | --- | --- |
| Clock | World clock | Busy |
| Geochron | Phone world clock | Slip Core |
| Tetris | — | Game Boy and Modern |
| Warp | Quarters | Warp Core |

Hover or focus a satellite to read its title. With JavaScript off, the page falls back to a plain list of the same links.

## Pages

| Name | Path | What it is |
| --- | --- | --- |
| Hub | `index.html` | Constellation of every destination |
| Enter | `living.html` | Same scene, orb returns to the hub |
| Clock | `Clock.html` | Geochron-style world clock with a live day/night terminator. Cast-ready for a TV |
| Busy | `busy.html` | Desk of live slip instruments. Fills the screen and holds a PC awake |
| Geochron Mobile | `geochron-mobile.html` | The world clock laid out for a phone |
| Slip Core | `core.html` | Phone containment bay. Tap to fill the screen and hold it awake |
| Space Invaders | `Space Invaders.html` | 1978-style arcade recreation |
| Asteroids | `asteroids/` | 1979 vector arcade recreation |
| Tetris (Game Boy) | `tetris/` | 1989 Game Boy A-Type marathon, Nintendo scoring, Korobeiniki |
| Tetris | `nestetris/` | Color marathon for a PC or a phone. Hold, hard drop, ghost piece, next queue |
| Pac-Man | `pacman/` | 1980 maze recreation |
| DOOM | `doom/` | 1993 shareware episode in the browser. WebAssembly, no install |
| Warp | `warp/` | Starship quarters. Warp, drop out, and orbit the solar system |
| Warp Core | `warpcore.html` | Desk intermix board. Click to fill the screen and hold the machine awake |

Shared art sits at the repo root: `background.mp4` (hub video), `blue-marble.jpg`, `night-lights.jpg`, and the favicon set. Planet textures for Warp live in `warp/planets/`.

## Run locally

Serve this folder over HTTP. A `file://` open breaks DOOM, because the WebAssembly module and `doom.data` must load from a server.

```powershell
npx serve .
```

```powershell
python -m http.server 8080
```

Then open the URL the server prints. Start at `/`.

## Deploy

This folder is the publish directory. [Netlify](https://www.netlify.com/) reads `_headers` at the site root.

`_headers` does three jobs:

- Sends `X-Robots-Tag: noindex` on every response.
- Sets `Content-Type: application/wasm` for `*.wasm` so the DOOM engine loads.
- Sets `Content-Type: application/octet-stream` for `*.data` and `*.wad`.

`robots.txt` disallows every crawler. Each page also sends a `noindex, nofollow` robots meta tag. The GitHub repo is public; the live site asks not to be indexed.

## DOOM

`doom/` plays the shareware episode, Knee-Deep in the Dead. `doom1.wad` is the shareware IWAD. The browser engine is based on id Software DOOM / doomgeneric and is GPLv2+. The page footer states that.

Save games stay in IndexedDB in that browser. They are not uploaded.

## When the site changes

Update the Pages table in this file in the same change as the hub. A new destination needs a satellite (or a noscript link) in `index.html` and a row here.
