# Architecture

Vectorbreak is split so content can grow without rewriting the match loop.

## Client

`client/src/main.js` owns menus, the local loop, and the relay display. It never grants official rating. Local quick play calls `createMatch` in the browser. Relay play only sends input.

`render.js` turns simulation state into meshes. `audio.js` synthesizes footsteps and weapons. `ui.js` reads strings through `game.t`. `net.js` speaks JSON over `/ws`.

## Shared simulation

`shared/sim/match.js` is the match. Both the browser and the relay call `stepMatch` at 60 Hz. Weapons, movement, abilities, and modes live beside it. Nothing in that folder reads the DOM.

## Dedicated relay

`server/index.js` is the only process that may write official XP, credits, and ranked rating. It steps the same `stepMatch`, broadcasts snapshots at about 20 Hz, and ignores client position, kills, and rewards.

`server/guard.js` clamps packets. `server/store.js` persists accounts, reports, and the audit log as JSON.

## What not to trust

The browser may predict look direction so the camera stays responsive. Body position on a relay match comes from the snapshot. Hits are resolved on the relay, rewound at most 150 ms, and only for human attackers.
