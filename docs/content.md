# Adding content

New weapons, maps, operators, modes, and languages are data. The match loop does not need a rewrite.

## Language

Add a key to `shared/strings.js` with both `en` and `it`. The menu reads `game.t(key)`. Missing keys render as the key, which `tests/locale.test.js` treats as a failure for content names. Settings → Language calls `setLang` and refreshes immediately. The choice is stored in `vectorbreak.settings.v1`.

## Weapon

Add an object to the list in `shared/weapons.js`. Required: unique `id`, `nameKey`, `descKey`, `category`, `slot`, damage, recoil pattern, and a `visual` color. Do not add a damage field on attachments. `tests/sim.test.js` checks the arsenal size and that attachments leave damage alone.

## Operator

Add an entry in `shared/characters.js` with role, passive, tactical, and ultimate keys, plus string rows. Ability behavior, if it is new, goes in `shared/sim/abilities.js` as a named effect with a short duration. It should not delete a full-health opponent by itself.

## Map

Add a map in `shared/maps.js` with spawns for both teams, at least one objective, and a theme. `validateMap` must return no errors. Combat maps are picked up by quick play automatically.

## Mode

Add a mode object in `shared/modes.js`. `resolveRules` copies its limits. Ranked stays a flag on the mode, not a client override.

## Cosmetic

Add a row to the cosmetic lists in `shared/progression.js` and a `cos.<id>` string. Emotes, banners, and kill effects need `kind` so the shop can find a bag. Purchases spend credits only. They do not change combat numbers.
