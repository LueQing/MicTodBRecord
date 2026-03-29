---
phase: 02-browser-capture-curve
plan: "02"
subsystem: api
tags: [audio, naudiodon, sse, tcp, testing]
requires:
  - phase: 02-01
    provides: planning realignment for backend-owned microphone capture
provides:
  - Backend microphone adapter that samples the default input device as dBFS
  - SSE live stream that exposes capture status, timeline snapshot, and sample updates
  - Deterministic fake-source coverage for backend-fed stats and TCP broadcast
affects: [phase-02-ui, backend-audio, dashboard, tcp-stream]
tech-stack:
  added: [naudiodon]
  patterns: ["Backend-owned audio capture behind an injectable sampleSourceFactory"]
key-files:
  created:
    - .planning/phases/02-browser-capture-curve/02-02-SUMMARY.md
    - src/mic-source.js
  modified:
    - .gitignore
    - package.json
    - package-lock.json
    - src/app-server.js
    - tests/app-server.test.js
key-decisions:
  - "The backend now owns the microphone and publishes live browser data through SSE instead of `/api/readings` uploads"
  - "The live pipeline stays testable by injecting a fake sample source into createDbMonitorApp"
patterns-established:
  - "Backend capture adapters should emit normalized samples and status through callbacks, not touch HTTP concerns directly"
  - "Passive UI data should be bootstrapped from SSE snapshot plus incremental sample/status events"
requirements-completed: [AUD-01, AUD-03, VIS-01, VIS-02]
duration: 12min
completed: 2026-03-29
---

# Phase 2 Plan 2: Backend Capture Summary

**Backend default-microphone capture via naudiodon with SSE-fed live stats and deterministic fake-source tests**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-29T03:14:35.850Z
- **Completed:** 2026-03-29T03:26:35.000Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added a dedicated backend capture adapter that resolves the default input device, converts PCM chunks to `dBFS`, and reports capture state
- Refactored the app server so backend samples drive rolling stats, `/api/live` SSE updates, and the existing localhost TCP broadcast
- Expanded automated coverage with a fake sample source that verifies SSE frames, rolling-window expiry, and TCP output without physical audio hardware

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a backend microphone adapter behind a testable interface** - `aabf8eb` (feat)
2. **Task 2: Replace browser uploads with backend-fed live stream and timeline state** - `4acbe6d` (test)

**Plan metadata:** Summary committed in the docs close-out for this plan

## Files Created/Modified
- `.gitignore` - Ignores local dependency installs so generated runtime artifacts stay out of git status
- `package.json` - Adds `naudiodon` for backend microphone capture
- `package-lock.json` - Locks the native dependency tree needed by the backend capture adapter
- `src/mic-source.js` - Wraps default-device capture, PCM-to-dBFS conversion, and capture-status reporting
- `src/app-server.js` - Starts the backend sample source, serves `/api/live`, and disables browser upload writes
- `tests/app-server.test.js` - Injects a fake sample source and validates SSE plus TCP behavior from the same backend-fed samples

## Decisions Made
- Chose `naudiodon` as the backend capture bridge because it exposes default-input discovery and stream-based PCM access inside Node
- Kept the HTTP layer decoupled from capture by having the sample source push `{ db, timestamp }` plus status events into the server callbacks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `.gitignore` for generated dependency output**
- **Found during:** Task 1 (Add a backend microphone adapter behind a testable interface)
- **Issue:** Installing `naudiodon` created an untracked `node_modules/` tree that should never be committed
- **Fix:** Added a minimal `.gitignore` entry for `node_modules/`
- **Files modified:** `.gitignore`
- **Verification:** `git status --short` no longer reports the generated dependency directory
- **Committed in:** `aabf8eb`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** No scope creep. The deviation only kept generated runtime output out of version control.

## Issues Encountered

- `naudiodon` introduces a native dependency, so Windows environments still need a working node-gyp toolchain if the install must compile locally

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The backend now exposes `/api/live`, so the browser can be converted into a display-only dashboard without mic ownership
- Real microphone verification remains for the final checkpoint once the frontend is switched over

---
*Phase: 02-browser-capture-curve*
*Completed: 2026-03-29*
