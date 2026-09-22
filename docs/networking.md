# Networking

The relay listens on `0.0.0.0:3001`. The client connects to `/ws` on the page host. Vite proxies that socket, plus `/api` and `/admin`, to the relay.

## Messages

Client to relay: `hello`, `ping`, `queue`, `join`, `input`, `leave`, `chat`, `report`.

Relay to client: `welcome`, `pong`, `start`, `snap`, `end`, `error`, `chat`.

`queue` carries mode, map, team, difficulty, a sanitized rule hint, loadout, name, and an optional room code. `start` returns `matchId`, `modeId`, `mapId`, `you`, `players`, `rules`, and `timeLeft`.

## Authority

The relay steps the shared simulation at 60 Hz and sends snapshots near 20 Hz. Client packets may set look and buttons. They may not set position, kills, XP, inventory, or rating. Input that arrives more than about 250 ms later than that player's best recent packet is replaced with an empty input.

Hitscan lag compensation calls `match.lagQuery`. Rewind is `min(0.15s, attackerPing)`. Bots do not rewind. Extreme latency is not an unlimited advantage.

Ranked circuits drop client rule overrides. Official rating is written only when at least two humans finished a ranked circuit that was not a drill and did not fault.

## Anti-cheat floor

- Packet size and rate caps. Repeated abuse flags the account and can lock the relay for ten minutes.
- Reports store a reason and match id. The desk at `/admin` can kick, mute, or ban. Actions land in the audit log.
- Casual abandon is not punished. Ranked abandon is counted on the server, not by the browser.
