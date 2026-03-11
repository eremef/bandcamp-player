---
phase: 4
slug: caching-music-and-offline-mode-for-mobile-app-based-on-the-desktop-app-solution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 4 — Validation Strategy

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

- **After every task commit:** Run `npm run test:mobile`
- **After every plan wave:** Run `npm run test:mobile -- --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 1 | OFFL-01 | unit | `npm run test:mobile` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | OFFL-02 | unit | `npm run test:mobile` | ❌ W0 | ⬜ pending |
| 4-01-03 | 01 | 1 | OFFL-03 | integration | `npm run test:mobile` | ✅ | ⬜ pending |
| 4-02-01 | 02 | 1 | OFFL-04 | unit | `npm run test:mobile` | ✅ | ⬜ pending |
| 4-02-02 | 02 | 1 | OFFL-05 | unit | `npm run test:mobile` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `mobile/__tests__/MobileCacheService.test.ts` — covers OFFL-01, OFFL-02, OFFL-05
- [ ] `mobile/services/MobileCacheService.ts` — main cache service
- [ ] Add audio_cache table migration to MobileDatabase.ts
- [ ] Update player.ts to check isCached and use local URL

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Download progress UI | OFFL-01 | Visual verification | Check toast and progress bar appear during download |
| Offline indicator | OFFL-04 | UI element | Toggle airplane mode, verify banner appears |
| Cache settings UI | OFFL-05 | Settings screen | Visit Settings, adjust cache size, clear cache |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

