# North Star Audit PRD (Ralph Loop)

## Task 1: Architecture Refactor
- [x] Convert FileStorage to Async/Immutable (`fs.promises`, deep copies).
- [x] Convert SessionGraph to Async.
- [x] Convert ContextBridge to Async.
- [x] Implement Memory Management: `SessionCleaner` to purge sessions >24h.
- [x] Memory Management: Check `clearSession` implementation.

## Task 2: Security Hardening
- [ ] Input Validation: Escape strings before JSON serialization.
- [ ] Rate Limiting: Throttle model requests (10 ops/sec).
- [ ] Privacy: Strip API keys from logs.

## Task 3: Reliability
- [ ] Error Handling: Try-Catch wrappers for all commands.
- [ ] Recovery: Graceful fallback for corrupt files.
- [ ] CI/CD: Verify tests (mock import of `vscode` if possible).

## Task 4: Lifecycle
- [ ] Startup: Silent init if file exists.
- [ ] Shutdown: Flush pending writes.
- [ ] Cleanup: Clear timers on deactivate.
