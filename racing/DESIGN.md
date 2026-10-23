# Sonoma time trial

Drive the existing blue open-top car around the imported main circuit from the driver's seat. Grip-focused arcade handling rewards braking before corners and staying on asphalt; leaving the road slows the car. Clock a complete sequential-checkpoint lap, then improve the locally saved best. A reset adds five seconds and returns the car to its last safe position; a fresh lap is always one action away.

Start on the front straight facing the uphill course. The first braking decision arrives at the climbing turns, then the winding hillside and hairpins ask for progressively slower corner entry. Straights provide recovery. A map, corner-distance cue and optional racing line keep the next turn readable.

World units are metres, Y up, X east, Z south. Imported vehicle is +Z forward and +X left. A fixed 120 Hz arcade bicycle model owns position/yaw/speed. A centerline and road crossfall extracted from the actual main-road mesh provide shared height, progress, camera and minimap queries. One car; no actor interaction. Swept sub-metre movement and a bounded runoff corridor stop high-speed escapes; this is an arcade surface-following model, not suspension/rigid-body simulation. Lap gates require ordered progress and forward crossing. No opponents in this time-trial slice.

Keyboard WASD/arrows, Space brake, R recover, C camera, Escape pause. Pointer-based throttle/brake/left/right on touch screens. Blur/visibility loss clears held input and pauses. Driver camera is default, with an optional chase view for viewing the imported car. Engine sound is synthesized locally from speed and throttle and starts only after a user gesture; mute always available.
