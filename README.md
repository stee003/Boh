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
