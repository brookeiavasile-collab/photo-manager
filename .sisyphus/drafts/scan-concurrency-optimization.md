# Draft: Scan Concurrency Optimization

## Requirements (confirmed)
- [performance issue]: "照片视频的扫描操作太慢了，思考一下如何并发执行"
- [research mode]: User requested exhaustive search mode with parallel agents and direct code search.

## Technical Decisions
- [mode]: Treat as architecture/performance planning task (no direct implementation).
- [approach]: Run parallel codebase exploration + external best-practice research before finalizing plan recommendations.

## Research Findings
- [pipeline map]: `src-tauri/src/commands/directories.rs` orchestrates scan in two serial phases: photos first, then videos.
- [photo scan loop]: `src-tauri/src/scanner/photo_scanner.rs` processes files sequentially (`for` loop): metadata -> EXIF -> GPS geocode -> MD5 -> AI cache read -> thumbnail.
- [video scan loop]: `src-tauri/src/scanner/video_scanner.rs` is sequential and spawns `ffprobe`/`ffmpeg` per file.
- [state model]: Global `ScanState` is `Arc<Mutex<ScanState>>` in `src-tauri/src/lib.rs`; progress/events emitted from `scan_directory`.
- [cancellation gap]: `stop_scan` only sets `scanning=false` in state, but scanner loops do not check stop flag; mid-scan cancellation is effectively not implemented.
- [contention/consistency risk]: `save_photos`/`save_videos` write full JSON snapshots; concurrent scans would risk lost updates without single-writer merge.
- [hot bottlenecks]: Full-file MD5, thumbnail generation, sequential ffmpeg/ffprobe, and geocoding latency/rate-limit dominate runtime.
- [external guidance]: Strong recommendation toward bounded concurrency + backpressure + single-writer aggregation, with cooperative cancellation token and monotonic progress accounting.
- [architecture recommendation]: Hybrid model favored for this codebase: bounded parallel workers for local CPU/IO-heavy per-file work, serialized geocoding/cache writes/persistence via aggregator.

## Open Questions
- [test strategy]: Project currently has no test infrastructure (no frontend test scripts and no discovered `*.test`/`*.spec` files). Decide whether to include test setup in this refactor plan.
- [target focus]: Which stage is currently the biggest pain point in practice (hashing, thumbnail generation, geocoding/AI, or JSON persistence)?
- [safety envelope]: Is scan result ordering important, or can output order be non-deterministic if overall throughput improves?

## Scope Boundaries
- INCLUDE: Analysis and work-plan recommendations for parallelizing photo/video scanning.
- EXCLUDE: Immediate code implementation in this phase.

## Test Strategy Decision
- **Infrastructure exists**: NO
- **Automated tests**: YES (set up test infrastructure first)
- **Agent-Executed QA**: REQUIRED for all planned tasks
