---
description: Prepare release with version {newVersion}
---

- update docs
- Change version of application everywhere (desktop, mobile, package)
- Run npm install both for desktop and mobile, e.g. `npm install; cd mobile npm install`
- commit and push whole waiting changes
- add git tag with {newVersion}
- push git tag with {newVersion}
