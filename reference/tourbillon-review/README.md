# Tourbillon and smoother driving — October 28, 2026

The existing [Mint Tourbillon export](https://mint.gg/share/ks77gk02c20cmjb9gdyc2vvc398h49jj) is selectable alongside the Porsche and roadster. No new generation was requested. Original export, source and SHA-256 are recorded in `racing/assets/bugatti-provenance.json`. Cockpit visibility, wheel animation, car switching and responsive layouts were inspected in Chrome.

## Handling calibration

Flat dry asphalt, full pedal, 120 Hz; times include pedal response. These are calibrated envelopes, not independent validation of a full vehicle dynamics model. Steering consumes longitudinal tyre grip, gradients affect acceleration, lifting the throttle coasts, and braking overrides acceleration. Standard Tourbillon limiter is 380 km/h; the 445 km/h override exists only in the benchmark test.

| Benchmark | Game | Reference |
| --- | --- | --- |
| Tourbillon 0–100 km/h | 2.00 s | 2.0 s |
| Tourbillon 0–200 km/h | 4.85 s | <5 s |
| Tourbillon 0–300 km/h | 9.64 s | <10 s |
| Tourbillon 0–400, test-only limiter override | 24.39 s | <25 s |
| Porsche 0–100 / 160 / 200 km/h | 3.20 / 6.90 / 10.59 s | 3.2 / 6.9 / 10.6 s |
| Porsche 70–0 / 100–0 mph | 40.54 / 76.50 m | 133 / 251 feet |

Sources: [Bugatti technical specifications](https://bugatti-newsroom.imgix.net/6675179393f6515cdb966608/technical-specifications-bugatti-TB-en.pdf), [Porsche factory specification](https://newsroom.porsche.com/dam/jcr:1d390f77-93c3-49c0-89c7-634f5f02b26a/S22_3515_en.pdf), [Car and Driver instrumented GT3 RS test](https://www.caranddriver.com/reviews/a44903120/2023-porsche-911-gt3-rs-test/). Porsche calibration uses the base GT3 RS, with the braking test's PCCB/Cup 2 R equipment; it is not a Manthey-specific test.

Bugatti braking (100–0 km/h: estimated 36.35 m), grip and drag are engineering estimates because suitable published braking data was unavailable. The concept roadster has an estimated, distinct heavier-car profile; [Rolls-Royce has not published its engineering performance](https://www.press.rolls-roycemotorcars.com/rolls-royce-motor-cars-pressclub/article/detail/T0457093EN/presenting-project-nightingale-a-coachbuild-collection). There is no suspension, gear simulation, tyre temperature, wet weather or rigid-body dynamics. Do not interpret this as a certified real-world simulator.

## Road

A periodic Gaussian filter smooths elevation over approximately 16 m and bank over 10 m. Continuous Hermite height/bank derivatives remove sample-boundary kinks. The 4,103.82 m plan route and all X/Z samples remain identical. Maximum centerline elevation adjustment is 1.14346 m; adjacent grade-change RMS falls from .003399 to .002525 (26%). Broad hills remain.

The game applies the same correction to rendered road vertices and nearby terrain, kerbs and barriers, fading out by 28 m. Maximum rendered vertex shift is 1.163 m. Road normals follow the smooth profile; other normals are recomputed in Float32 while preserving source orientation. Camera/car attitude follows the surface with a short smoothing filter. Original track GLBs and the inspection viewer are unchanged. Existing coarse geometry, junction limitations and runoff collision approximations remain.

Rebuild: `python tools/build_smoothed_route.py` (numpy/scipy), then run `node tests/test-surface.mjs`. Handling changes use fresh `sonoma.best.v2.*` records; old records remain in browser storage.

## Verification

`node tests/test-performance.mjs`, `node tests/test-surface.mjs` and `node tests/racing-simulation.mjs` and `node tests/all-cars-lap.mjs` pass. Conservative automated full laps finish in all three cars with zero boundary contacts and less than 1.80 m lateral deviation. These bot times are QA checks, not performance predictions. Browser input confirms acceleration and braking; cockpit/chase captures verify the cream Tourbillon cabin, clear windscreen and terrain lighting. JSON reports and current captures accompany this review. Older gameplay media predates this handling update.

Final browser checks confirmed all three car/profile/record-key selections, pause and recovery, 390 px portrait layout without horizontal overflow, and touch pedal press/release. Raycasts at seven positions around the rendered road differed from the driving height by at most 2.75 cm. See `extra-browser.json` and `rendered-surface.json`.
