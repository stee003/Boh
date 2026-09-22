# VECTORBREAK

Original fast third-person arena shooter. Near-future urban fights on the Lattice. Matches are short. You can be shooting in under half a minute.

This is not a port of any existing shooter. Maps, operators, weapons, UI, audio, and mode names are original. Genre ideas only: quick matches, readable fights, low requirements.

## Play

```bash
npm install
npm test
npm run server
npm run dev
```

Open the Vite URL (port 5173). The dedicated relay listens on `0.0.0.0:3001`. Vite proxies `/ws`, `/api`, and `/admin` to it.

- **Deploy** starts a local simulation immediately, with drills filling empty seats.
- **Dedicated relay** on the Play screen queues a server match. The relay owns hits, score, XP, and ranked rating.
- **Ranked** uses the relay when it is up. A local ranked click is only a calibration and does not move official rating.
- **Practice** has a tutorial under ten minutes, a calibration bay, and five drill difficulties: Beginner, Easy, Normal, Hard, Expert.
- Settings → Language switches English and Italiano immediately and saves the choice.

## Relay desk

`/admin` lists reports. The local desk key is `VECTORBREAK_ADMIN_KEY` or `lattice-desk`. Kick, mute, and ban are recorded under `server/data` (gitignored).

## Layout

- `client/` presentation, input, audio, prediction display
- `shared/` simulation, weapons, maps, modes, strings
- `server/` authoritative relay, matchmaking, accounts, moderation
- `docs/` how to add content and how networking is bounded
- `tests/` simulation, locale, and packet guards

Accounts and match results for relay circuits live in `server/data`. The browser profile is a local cache. Relay rewards overwrite local XP for that match; the server file is the official record.

## License

Original work. All rights reserved. Do not copy another game's maps, characters, weapons, UI, audio, or code into this project.

## Controls & settings

The game keeps its third-person shoulder view, with standard FPS-style mouse input:

- Deploy captures the cursor. Move the mouse freely to look; **no button needs to be held**.
- **Left click** fires (or swings an equipped melee weapon); **right click** aims; **R** reloads.
- **WASD** moves, **Shift** sprints, **Space** jumps, **Ctrl** crouches/slides, **1–3** or the wheel changes weapons.
- **Esc** releases the mouse and opens the pause menu. Click **Resume** to recapture it. Losing focus also pauses local play and clears held inputs. Online matches continue while paused, but your controls are neutralized.
- If the browser blocks cursor capture after loading/matchmaking, click **Resume**. Embedded hosts must permit pointer lock; otherwise open the preview directly in a tab.

**Settings** is available in the lobby header and pause menu. Controls, Gameplay, Video, Audio, and Key bindings are separate tabs. Sensitivity, ADS multiplier, invert Y, controller tuning, aim/crouch behavior, auto sprint, FOV, effects, volume, and bindings save automatically in this browser and take effect immediately. In-match settings return to the same match via **Resume**.

Characters use articulated, blended procedural animation for movement, crouch, slide, jump/landing, dodge, vault, reload, melee and death. Every shot event drives its own muzzle flash/recoil, including automatic fire. Reduced motion disables decorative UI/lobby motion and camera shake/kick; essential character action cues remain visible.

## Model preview (headless)

`node tools/preview-model.mjs` builds the real operator/weapon meshes from the shipped
render code and rasterises three-view turnaround sheets into `.preview/` (gitignored).
Useful for reviewing character and weapon geometry without a browser.

## Regression checks

```bash
npm test
npm run build
# With the relay and Vite running in other terminals:
npx playwright install --with-deps chromium
npm run test:browser
```

The browser smoke test checks local and dedicated-relay firing, free mouse look, HUD click-through, slider continuity/persistence, in-match settings, pause/resume, focus cleanup, narrow layout and runtime errors. `GAME_URL` overrides the Vite URL; `CHROME_PATH` optionally supplies an existing Chromium executable. Unit tests also cover finite weapon audio, sprint-to-fire, empty reloads, short input pulses and animation transitions.
