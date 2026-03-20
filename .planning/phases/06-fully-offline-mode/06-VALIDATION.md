---
phase: 06
slug: fully-offline-mode
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (existing mobile tests) |
| **Config file** | mobile/jest.config.js |
| **Quick run command** | `npm run test:mobile` |
| **Full suite command** | `npm run test:mobile` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** `npm run test:mobile`
- **After every plan wave:** `npm run test:mobile`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | OFFL-04 | component | visual check | ✅ | ⬜ pending |
| 06-02-01 | 02 | 1 | OFFL-04 | component | visual check | ✅ | ⬜ pending |
| 06-03-01 | 03 | 2 | OFFL-01/02 | unit | `npm run test:mobile` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `mobile/__tests__/services/MobileCacheService.test.ts` — covers OFFL-01, OFFL-02, OFFL-05
- [ ] `mobile/__tests__/components/CachedIndicator.test.tsx` — covers OFFL-04

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OfflineEmptyState button navigates to Standalone | UX | Mode switch | Tap button, verify mode changes |
| "View on Bandcamp" hidden in offline | UX | UI visibility | Check in offline mode |
| Album detail empty state | UX | Screen flow | Navigate to uncached album offline |

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
