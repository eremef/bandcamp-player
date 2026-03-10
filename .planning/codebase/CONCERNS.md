# Codebase Concerns

**Analysis Date:** 2026-03-10

## Tech Debt

**Bandcamp Scraping Fragility:**
- Issue: Scraping depends on Bandcamp DOM structure which can change
- Files: `src/main/services/scraper.service.ts` (1293 lines)
- Impact: Collection fetch breaks on Bandcamp UI changes
- Fix approach: Remote config (remote-config.json) for selectors; auto-refresh on selector failure

**Offline Mode Collection Cache:**
- Issue: Cache key inconsistency between menubar API and cookie fan_id
- Files: `src/main/services/scraper.service.ts`, `src/main/database/database.ts`
- Impact: Collection not found in offline mode for some users
- Fix approach: Dual-key caching (both userId and fanIdFromCookie)

**Large Collection Simulation:**
- Issue: `--simulate-large-collection` creates 5000+ items for testing
- Files: `src/main/services/simulation.service.ts`
- Impact: Performance issues in development with simulated data
- Fix approach: Document limitation; use selective simulation

## Known Bugs

**Artist ID Deduplication:**
- Issue: Same artist appearing multiple times due to missing numeric ID
- Files: `src/main/services/scraper.service.ts` (`consolidateArtistIds` method)
- Trigger: Collection with mixed track/album sources
- Workaround: `consolidateArtistIds()` attempts fix but may not catch all cases

**Stream URL Expiration:**
- Issue: Bandcamp stream URLs expire; offline tracks may become unplayable
- Files: `src/main/services/scraper.service.ts`, `src/main/services/player.service.ts`
- Trigger: Playing cached track after extended offline period
- Workaround: Refresh stream URL on play attempt

**Duplicate Collection Items:**
- Issue: Same album/track appearing multiple times
- Files: `src/main/services/scraper.service.ts`
- Trigger: API pagination edge cases
- Workaround: Deduplication in fetch loop

## Security Considerations

**Bandcamp Session:**
- Risk: Session cookies stored in Electron session
- Files: `src/main/services/auth.service.ts`
- Current mitigation: Session-bound to Electron, not persisted
- Recommendations: Consider encrypting at rest

**No HTTPS Enforcement:**
- Risk: Some Bandcamp URLs may be HTTP
- Files: Network requests in scraper service
- Current mitigation: Axios handles redirects
- Recommendations: Upgrade to HTTPS where possible

**Last.fm Credentials:**
- Risk: API key/secret in source or remote config
- Files: `src/main/services/scrobbler.service.ts`
- Current mitigation: Per-user session key only; API key is public Last.fm key
- Recommendations: Accept risk as standard for Last.fm integration

## Performance Bottlenecks

**Collection Fetch:**
- Problem: Sequential API pagination with rate limiting
- Files: `src/main/services/scraper.service.ts`
- Cause: Bandcamp API rate limits + retry logic
- Improvement path: Parallel batch fetches with better concurrency

**Initial Load:**
- Problem: All collection items loaded at once
- Files: `src/main/services/scraper.service.ts`, `src/renderer/store/store.ts`
- Cause: No virtual scrolling, full state in memory
- Improvement path: Implement virtual scrolling, pagination in UI

**Cache Size Check:**
- Problem: Cache size calculated on every access
- Files: `src/main/services/cache.service.ts`
- Cause: SQLite query on getStats()
- Improvement path: Cache stats with invalidation

## Fragile Areas

**ScraperService JSON Extraction:**
- Files: `src/main/services/scraper.service.ts` (`extractJsonObject` method, lines 105-192)
- Why fragile: Complex brace-parsing logic for extracting embedded JSON
- Safe modification: Test with multiple Bandcamp page variants
- Test coverage: Snapshot tests exist: `scraper.snapshot.test.ts`

**Remote Config Parsing:**
- Files: `src/shared/remote-config.service.ts`
- Why fragile: Config fetched from external JSON; malformed config breaks scraping
- Safe modification: Validate config schema on load
- Test coverage: None detected

## Scaling Limits

**Collection Size:**
- Current capacity: Tested with 5000+ items (simulation)
- Limit: Memory + SQLite performance
- Scaling path: Virtual scrolling, pagination

**Concurrent Downloads:**
- Current capacity: Sequential (one download at a time)
- Limit: Bandwidth + cache space
- Scaling path: Parallel downloads with queue management

**WebSocket Remote:**
- Current capacity: Multiple concurrent connections
- Limit: Memory per connection
- Scaling path: Connection pooling if needed

## Dependencies at Risk

**Cheerio (1.2.0):**
- Risk: HTML parsing depends on Bandcamp DOM structure
- Impact: Breaking changes in Bandcamp HTML = scraping failures
- Migration plan: Watch for breakage; update selectors via remote-config.json

**better-sqlite3 (12.6.2):**
- Risk: Native module requiring rebuild on Node/Electron version changes
- Impact: `npm install` failures on some platforms
- Migration plan: Use better-sqlite3-multiple-ciphers or switch to sql.js (pure JS)

**Electron (40.6.1):**
- Risk: Rapid version updates; breaking changes
- Impact: Main process code breaks on Electron upgrade
- Migration plan: Pin version, test thoroughly before upgrade

## Missing Critical Features

**Search:**
- Problem: Only collection search; no global search
- Blocks: Finding specific tracks across large collections
- Priority: Medium

**Playlists Sync:**
- Problem: Local only; no cloud sync
- Priority: Low (per design, offline-first)

**Mini Player:**
- Problem: Basic implementation
- Files: `src/renderer/components/` (mini player component)
- Priority: Low

## Test Coverage Gaps

**ScraperService:**
- What's not tested: DOM parsing edge cases, API response variations
- Files: `src/main/services/scraper.service.ts`
- Risk: Breaking changes in Bandcamp API not caught
- Priority: High

**Integration Tests:**
- What's not tested: Full auth flow, offline mode transitions
- Files: IPC handlers
- Risk: Silent failures in production
- Priority: Medium

**E2E:**
- What's not tested: Offline mode, cache clearing
- Files: `e2e/*.spec.ts`
- Risk: Critical user flows broken
- Priority: Medium

---

*Concerns audit: 2026-03-10*
