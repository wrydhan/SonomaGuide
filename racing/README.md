# First-person time trial

Open `racing/` from a static server rooted at this repository. No build step, paid API call, server secret or CDN is needed for this mode. It loads the existing `../sonoma-raceway-web.glb` and one selected existing car export: the Bugatti Tourbillon, Porsche 911 GT3 RS Manthey or blue roadster.

```sh
python3 -m http.server 8882 --bind 127.0.0.1
# http://127.0.0.1:8882/racing/
```

- W / Up accelerates; S / Down / Space brakes.
- A / D or Left / Right progressively steers. Brake before sharp bends and unwind the wheel on exit.
- R returns to the last safe position and adds five seconds to the current lap.
- C switches between the driver's seat and chase view.
- Escape pauses; the pause screen can resume or start a fresh lap.
- Touch: drag the steering pad left/right; use the separate pedals. Landscape gives a wider driving view.
- Gamepad: left stick steers, RT gas, LT brake, Y camera, B recover, Menu pause. Standard browser mapping required.
- Guide toggles the route arrows. Sound starts/stops a local synthesized engine.

Choose a car in the start/pause menu. A new device defaults to the Bugatti Tourbillon; your last selection is remembered. Open `?car=bugatti`, `?car=porsche` or `?car=roadster` to select directly. Switching cars starts a fresh lap. Best times are saved separately for each car.

The lap clock starts with throttle. Complete 24 ordered progress gates and cross the finish forward to record a lap. Cutting to the finish or driving backwards does not record a lap. Best time is saved locally when storage is available. There are no opponents in this time-trial mode.

## Implementation

`simulation.js` owns a fixed 120 Hz dynamic single-track chassis with tyre forces, lateral velocity, yaw inertia and separate car performance profiles. It allows independent steering, acceleration and braking rather than moving the car on rails. Tyre forces saturate at the grip limit; extra lock produces understeer. Estimated load transfer, combined braking/cornering grip and stability control affect balance. Grass/runoff progressively reduces grip and slows the car. `route-smooth.json` is the smoothed playable surface derived from `route.json`, which contains 2,068 cross sections taken directly from `road_main`, with road elevation and crossfall, sampled runoff heights, and barrier clearances. Mesh path length is about 4.10 km; this is the generated circuit's measured geometry, not a survey-grade track model.

The shared surface sampler provides car placement, camera orientation, road status and lap progress. Swept sub-metre simulation steps and a bounded runoff corridor prevent tunneling out of the playable route. Barrier distances were sampled offline against the model's walls and guardrails, with a 1.2 m vehicle clearance. The corridor is an arcade collision approximation: no full rigid-body impacts, independently simulated suspension, jumping, reversing, driving on alternate layouts or unrestricted paddock exploration. Existing track-model defects remain.

`race.js` projects the state into Three.js, animates the imported wheel pivots, handles keyboard/touch/lifecycle input, and updates HUD and audio. Repeated static meshes are batched by geometry/material and 250 m spatial cell. Desktop static shadows render once; phones omit shadows and cap pixel ratio. The game smooths rendered road and nearby terrain heights at load time; the source GLBs and inspection viewer stay intact. Continuous surface gradients and filtered car attitude reduce jolts.

All three original car exports are unchanged. `cars.js` holds their orientation, driver-eye, wheel and best-record settings. The Porsche uses a first-person visibility adapter for its obstructing interior-shell panel and windscreen opacity; chase view restores the full model. See [Porsche verification](../reference/porsche-review/README.md). Its fingerprint and source are in `assets/provenance.json`. Local +Z is forward and +X is the driver's left. Three.js 0.186.1 and the required loaders/utilities are vendored under `vendor/`, with its MIT license retained.

## Checks

```sh
node tests/handling-dynamics.mjs
node tests/all-cars-lap.mjs
node tests/test-performance.mjs
node tests/test-surface.mjs
node tests/racing-simulation.mjs
node --check racing/race.js
node --check racing/simulation.js
```

The simulation test drives an entire valid lap, checks an out-of-order finish is rejected, tests recovery/restart, and drives into the runoff boundary at speed. Browser checks use real keyboard/pointer input for acceleration, steering, braking, camera switch, pause and recovery; mobile checks cover pointer release, portrait/landscape bounds and sound toggle. See `reference/racing-review/README.md` for evidence and limits.

Use `?debug` to expose `window.__THREE_GAME_DIAGNOSTICS__()` and deterministic test hooks. No debug UI appears in the normal route. There is no build toolchain to typecheck; static JavaScript syntax and runtime checks are the release checks.

To rebuild the route after editing the main road, install numpy, scipy, trimesh and rtree in a Python environment and run `python tools/build_driving_route.py`. The extractor is specific to the road mesh's existing atlas and topology. Do not use it blindly on a remeshed track; verify continuity and rerun the full-lap check first.

## Performance and surface update

The Tourbillon and Porsche acceleration envelopes match manufacturer figures on flat dry asphalt. Porsche braking is fitted to an instrumented GT3 RS test; Tourbillon braking and the concept roadster performance are estimates. Coasting, pedal response, aerodynamic resistance, grade and shared cornering/braking grip are modeled. This remains a simplified game without suspension or full tyre dynamics. Best records now use a separate v3 key for each car because handling changed.

See [current calibration, sources, road measurements and captures](../reference/tourbillon-review/README.md). Rebuild the smooth profile with `python tools/build_smoothed_route.py` after rebuilding the raw route (numpy/scipy required).

## Steering and feedback

The current target is approachable Gran Turismo / Forza Motorsport-style circuit driving. Keyboard rack rate, analog gamepad/touch controls, handwheel and tyre animation, load-related chassis/camera motion, grip/G-force/pedal indicators, tyre scrub audio and optional supported gamepad rumble are included. Steering never writes yaw directly. Disable speed-sensitive steering for direct full-lock input, or camera motion for a steadier view. Sound is opt-in. These are estimated lateral dynamics, not a certified real-car or AAA simulation. See the [steering tests, gameplay run and limitations](../reference/steering-review/README.md).

The Bugatti's rim rig uses the measured shaft and centre; its instruments stay fixed while the rim and paddles turn. See the [rig repair and full-lock checks](../reference/bugatti-wheel-review/README.md). Run `node tests/bugatti-steering-rig.mjs` after changing that adapter or car export.
