# First-person time trial

Open `racing/` from a static server rooted at this repository. No build step, paid API call, server secret or CDN is needed for this mode. It loads the existing `../sonoma-raceway-web.glb` and one selected existing car export: the Porsche 911 GT3 RS Manthey or blue roadster.

```sh
python3 -m http.server 8882 --bind 127.0.0.1
# http://127.0.0.1:8882/racing/
```

- W / Up accelerates; S / Down / Space brakes.
- A / D or Left / Right steers. Brake before sharp bends.
- R returns to the last safe position and adds five seconds to the current lap.
- C switches between the driver's seat and chase view.
- Escape pauses; the pause screen can resume or start a fresh lap.
- Touch buttons provide steering and pedals on phones. Landscape gives a wider driving view.
- Guide toggles the route arrows. Sound starts/stops a local synthesized engine.

Choose a car in the start/pause menu. A new device defaults to the Porsche; your last selection is remembered. Open `?car=porsche` or `?car=roadster` to select directly. Switching cars starts a fresh lap. Best times are saved separately for each car.

The lap clock starts with throttle. Complete 24 ordered progress gates and cross the finish forward to record a lap. Cutting to the finish or driving backwards does not record a lap. Best time is saved locally when storage is available. There are no opponents in this time-trial mode.

## Implementation

`simulation.js` owns a fixed 120 Hz arcade bicycle model. It allows independent steering, acceleration and braking rather than moving the car on rails. Speed is limited by cornering grip; grass/runoff slows the car. `route.json` contains 2,068 cross sections taken directly from `road_main`, with road elevation and crossfall, sampled runoff heights, and barrier clearances. Mesh path length is about 4.10 km; this is the generated circuit's measured geometry, not a survey-grade track model.

The shared surface sampler provides car placement, camera orientation, road status and lap progress. Swept sub-metre simulation steps and a bounded runoff corridor prevent tunneling out of the playable route. Barrier distances were sampled offline against the model's walls and guardrails, with a 1.2 m vehicle clearance. The corridor is an arcade collision approximation: no rigid-body impacts, suspension, jumping, reversing, driving on alternate layouts or unrestricted paddock exploration. Existing track-model defects remain.

`race.js` projects the state into Three.js, animates the imported wheel pivots, handles keyboard/touch/lifecycle input, and updates HUD and audio. Repeated static meshes are batched by geometry/material and 250 m spatial cell. Desktop static shadows render once; phones omit shadows and cap pixel ratio. No source track geometry is modified.

Both original car exports are unchanged. `cars.js` holds their orientation, driver-eye, wheel and best-record settings. The Porsche uses a first-person visibility adapter for its obstructing interior-shell panel and windscreen opacity; chase view restores the full model. See [Porsche verification](../reference/porsche-review/README.md). Its fingerprint and source are in `assets/provenance.json`. Local +Z is forward and +X is the driver's left. Three.js 0.186.1 and the required loaders/utilities are vendored under `vendor/`, with its MIT license retained.

## Checks

```sh
node tests/racing-simulation.mjs
node --check racing/race.js
node --check racing/simulation.js
```

The simulation test drives an entire valid lap, checks an out-of-order finish is rejected, tests recovery/restart, and drives into the runoff boundary at speed. Browser checks use real keyboard/pointer input for acceleration, steering, braking, camera switch, pause and recovery; mobile checks cover pointer release, portrait/landscape bounds and sound toggle. See `reference/racing-review/README.md` for evidence and limits.

Use `?debug` to expose `window.__THREE_GAME_DIAGNOSTICS__()` and deterministic test hooks. No debug UI appears in the normal route. There is no build toolchain to typecheck; static JavaScript syntax and runtime checks are the release checks.

To rebuild the route after editing the main road, install numpy, scipy, trimesh and rtree in a Python environment and run `python tools/build_driving_route.py`. The extractor is specific to the road mesh's existing atlas and topology. Do not use it blindly on a remeshed track; verify continuity and rerun the full-lap check first.
