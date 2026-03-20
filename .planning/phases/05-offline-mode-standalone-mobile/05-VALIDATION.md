---
phase: 05
slug: offline-mode-standalone-mobile
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (existing mobile tests) |
| **Config file** | mobile/jest.config.js |
| **Quick run command** | `npm run test:mobile` |
| **Full suite command** | `npm run test:mobile -- --coverage` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run test:mobile`
- **After every plan wave:** `npm run test:mobile -- --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | OFFL-04 | unit | `npm run test:mobile` | ✅ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | OFFL-04 | component | visual check | ✅ | ⬜ pending |
| 05-02-01 | 02 | 1 | OFFL-02 | unit | `npm run test:mobile` | ✅ | ⬜ pending |
| 05-02-02 | 02 | 1 | OFFL-02 | component | visual check | ✅ | ⬜ pending |
| 05-03-01 | 03 | 2 | OFFL-03 | unit | `npm run test:mobile` | ✅ | ⬜ pending |
| 05-03-02 | 03 | 2 | OFFL-01 | unit | `npm run test:mobile` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `mobile/__tests__/MobileCacheService.test.ts` — stubs for OFFL-01, OFFL-02, OFFL-05
- [ ] `mobile/components/CacheFab.tsx` — component for bulk downloads
- [ ] `mobile/__tests__/store/index.test.ts` — update for offline filtering, WiFi-only

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FAB positioned above player bar | UX | Overlap check | Open collection, verify FAB doesn't block player |
| Cached dot visible on dark artwork | UX | Color contrast | Test on albums with dark cover art |
| Background downloads complete | Integration | App termination | Minimize app, verify download completes |
| Offline mode queue clearing | UX | Mode transition | Switch Standalone→Offline with mixed queue |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
