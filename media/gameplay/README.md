# Sonoma gameplay captures

Fresh captures from the running racing mode on October 23, 2026. Both cars are shown in cockpit and chase views. The screenshots come from active driving with the HUD visible.

[Watch the gameplay video](sonoma-gameplay.mp4) — 32 seconds, 1280×720, H.264, 30 fps, 8.6 MB. Silent capture.

| Porsche · cockpit | Porsche · chase |
| --- | --- |
| ![Porsche cockpit gameplay](porsche-cockpit.jpg) | ![Porsche chase gameplay](porsche-chase.jpg) |
| **Roadster · cockpit** | **Roadster · chase** |
| ![Roadster cockpit gameplay](roadster-cockpit.jpg) | ![Roadster chase gameplay](roadster-chase.jpg) |

## Capture notes

The video records actual Chrome/WebGL gameplay using scripted keyboard inputs. It is two joined segments, not a continuous lap: the first follows the Porsche from the start for 20 seconds; the second begins the blue roadster at route distance 1,100 m for 12 seconds. Each segment switches from cockpit to chase at its midpoint. No artificial cars, track shots or motion were generated for this video. Browser screencast timestamps set the frame durations; FFmpeg encodes H.264 with web playback metadata at the beginning of the file.

Neither captured segment hit the corridor boundaries, and no browser page/console errors or failed requests were recorded. The complete MP4 decoded without errors, and its resolution, codec and duration were checked with ffprobe. See `capture-report.json` and `video-check.json`. These captures demonstrate the existing arcade driving mode, not a completed lap or real-world vehicle physics.
