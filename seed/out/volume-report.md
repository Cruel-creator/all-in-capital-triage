# Volume test (Phase 5)

- **Load:** 20 applications queued at once (10 seed + 10 synthetic variants), worker at 4 in flight.
- **Result:** 20 of 20 ended `scored`; 0 lost, 0 `needs_attention`. Wall time 6.7 minutes.
- **Resilience:** 6 model calls failed and were recovered by gateway retries; the sweeper failed 1 orphaned job left by an earlier run.
- **Daily limit:** with the limit set below today's spend, the next model call paused the queue, the in-flight application was put back with "Waiting: the daily cost limit paused the queue", and 0 model calls ran after the pause. After resuming, it finished normally.
- **Bugs found and fixed:** cost totals were summed from rows, which the API caps at 1,000 (moved into a database function, for both the guard and the Cost & ops page); one database blip crashed the worker loop (each iteration now backs off and retries); middleware at the project root was ignored by Next.js (moved to `src/`).
