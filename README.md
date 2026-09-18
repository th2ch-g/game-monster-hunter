# HUNTER'S GUILD

A playable 3D Monster Hunter fan game for desktop and mobile browsers. Solo hunts with an AI Palico, or cooperative hunts with up to four players, run entirely on a static GitHub Pages site.

This is a browser adaptation with custom procedural models, original code, and independent combat tuning. It does not reproduce a commercial Monster Hunter game's entire combat system, environments, or assets. Monster Hunter names and characters belong to CAPCOM. The title illustration is generated fan art; gameplay uses real-time Three.js graphics.

## Play

Select a quest, choose a weapon, and depart. A hunt ends when the target is defeated, the shared party reaches three faints, or the 15-minute timer expires. Training quests disable incoming damage, have a one-hour limit, and award no progression. Veteran quests increase monster health, damage, and rewards.

- **Six targets:** Rathalos, Rathian, Zinogre, Tigrex, Nargacuga, and Rajang, with distinct move sequences, terrain themes, telegraphs, and rage behavior.
- **Fourteen weapons:** Great Sword, Long Sword, Sword & Shield, Dual Blades, Hammer, Hunting Horn, Lance, Gunlance, Switch Axe, Charge Blade, Insect Glaive, Light Bowgun, Heavy Bowgun, and Bow.
- **Combat:** directional hits, head weak points, head breaks, tail severing, staggers, stamina, invulnerable dodge frames, shields, weapon gauges, charging, transformations, ranged distance modifiers, ammunition and reloading, poison, and sharpness.
- **Support:** potions, antidotes, shock traps, barrel bombs, whetstones, Hunting Horn recovery and attack buffs, and faster recovery near a fallen teammate.
- **Progression:** persistent currency, materials, equipment upgrades, hunt statistics, and personal bests. Rewards are claimed once per hunt. Save export is available in settings.
- **Mobile:** portrait and landscape layouts, movement stick, camera dragging, attack and special buttons, dodge, guard, target lock, and item access.
- **Presentation:** animated 3D monsters and hunters, biome lighting, shadows, particles, damage numbers, attack telegraphs, a minimap, procedural sound effects, and adjustable rendering quality.

## Controls

| Input             | Action                                                |
| ----------------- | ----------------------------------------------------- |
| WASD / arrow keys | Move relative to the camera                           |
| J / left mouse    | Attack / combo                                        |
| K                 | Weapon special; hold for Great Sword, Hammer, and Bow |
| Space             | Dodge                                                 |
| L / Shift         | Guard with a compatible weapon                        |
| Q                 | Potion                                                |
| 1 / 2 / 3 / R     | Antidote / trap / bomb / whetstone                    |
| Tab               | Target lock                                           |
| Right mouse drag  | Orbit camera                                          |
| Mouse wheel       | Camera distance                                       |
| Escape            | Hunt menu; pauses solo play                           |

Standard gamepads also support movement, camera yaw, X attack, Y special, A dodge, LB guard, and RB potion. Mobile buttons use the same authoritative combat actions.

## Cooperative play

Open the gathering hub, create a room, and share its eight-character code or invite link. Every connected guest must mark ready before the host can depart. The quest and difficulty are selected by the host before room creation; each hunter selects their own equipment beforehand.

The host simulates combat at 30 steps per second and sends snapshots approximately ten times per second. Simulation and input run independently of animation-frame delivery. Guests send validated input, not damage or positions. The renderer smooths incoming positions. A room accepts four human hunters, with no Palico in cooperative play. Late entry during a hunt is limited to reconnecting members.

Guest identity survives refresh in session storage. Disconnected hunters stop acting and taking damage; stale movement input is cleared. The host checkpoints its room and hunt in session storage. Use **前の集会所に復帰する** after refreshing. The host must keep its tab visible and device awake. There is no host migration; if the host leaves permanently, the party cannot continue that hunt.

The default connection uses PeerJS public signaling and STUN, with browser-to-browser WebRTC data channels. Some corporate, mobile, or restrictive NAT networks require a TURN relay. An optional TURN URL, username, and password can be entered under connection settings; credentials remain in memory and are not saved. A public signaling outage affects online play but not solo hunts. No account, analytics, voice service, or chat service is included.

## Development

Node.js 22.12 or newer is required.

```sh
npm ci
npm run dev
```

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
PLAYWRIGHT_BROWSER=webkit npm run test:e2e -- tests/game.spec.ts
npm run format:check
```

When using an installed Chrome browser:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser caches can be placed inside the repository with `PLAYWRIGHT_BROWSERS_PATH=.cache/playwright`. If the default npm cache is not writable, use `npm ci --cache .cache/npm`.

`npm run build` checks TypeScript and writes the static site to `dist/`. `npm run preview` serves that build. Dependency versions are recorded in `package-lock.json`.

## Architecture

| Module               | Responsibility                                                 |
| -------------------- | -------------------------------------------------------------- |
| `src/game/data.ts`   | Weapon and monster catalog                                     |
| `src/game/engine.ts` | Authoritative simulation, actions, damage, AI, quest lifecycle |
| `src/game/models.ts` | Procedural models, articulated rigs, weapons                   |
| `src/game/scene.ts`  | Environment, rendering, animation, camera, effects             |
| `src/game/input.ts`  | Keyboard, pointer, gamepad, and touch input                    |
| `src/lib/network.ts` | Rooms, readiness, validated input, snapshots, reconnection     |
| `src/lib/storage.ts` | Validated saves, rewards, equipment upgrades                   |
| `src/App.tsx`        | Camp, hunt HUD, results, and menu flows                        |

The simulation is independent of the renderer. The read-only `window.__HUNT_STATE__()` diagnostic returns a cloned snapshot for browser tests; changing its return value cannot mutate a hunt. No test-only combat shortcuts are included in the production game.

## Deployment and verification

Enable GitHub Pages with **GitHub Actions** as the source. Pushing `main` runs unit tests, TypeScript compilation, the production build, and Chromium end-to-end tests before deploying. The relative Vite base supports repository subpaths and custom hostnames without hardcoded repository URLs.

The browser suite exercises the quest board, all weapon choices, forging and save persistence, real 3D movement and damage, retreat, portrait and landscape controls, invalid saves, accessibility, and real four-player WebRTC connections, full-room rejection, guest refresh, host recovery, and shared results. CI uses software WebGL and the supported low-quality preset; local Chrome and WebKit checks also cover automatic quality. Tests require internet access for the public signaling service. Screenshots and traces are written to ignored artifact directories.

To run against a deployed site, set `PLAYWRIGHT_BASE_URL` to its URL, including the repository path and trailing slash. Mobile viewport and WebKit tests do not constitute physical iOS or Android device certification. Relay-only TURN connectivity requires an independently provided and tested relay.

WebKit solo-play checks pass. Cooperative WebKit testing could not establish a data channel in the available automation environment; a separate native WebRTC loopback check also failed there. Safari cooperative play remains unverified. Chromium cooperative checks use real WebRTC connections.

See [artwork provenance](docs/artwork.md) for the title image generation prompts.
