---
description: Prepare release with version {newVersion}
---

# Rules

// turbo-all

- do not merge any branches!
- do not prepare implementation plan - just proceed instantly
- update docs
- running npm install, run `npm run release` and analyse the output for possible errors, fix them and run the release script again

## Agent Constraints (Covered by `npm run release`)

Do NOT perform the following manually:

- **Do not bump versions** in `package.json`, `mobile/package.json`, or `mobile/app.json`.
- **Do not run `npm install`** manually (unless the script fails).
- **Do not run `npm test`** manually (the script includes them).
- **Do not commit, tag, or push** the release changes manually.
