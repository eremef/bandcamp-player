---
description: Commit and push current changes and staged files
---

# Instructions for the AI Agent

When the user triggers this workflow, execute the following steps:

1. **Analyze Changes**: Check the repository for staged and unstaged changes (e.g., using `git status` and `git diff`).
2. **Formulate the Message**: Synthesize the changes into a comprehensive commit message that strictly adheres to the provided format.
3. **Commit and Push**: Stage the files, commit them with the formulated message, and push the changes to the remote branch. Combine these into a single chained execution if possible (e.g., `git add . ; git commit -m "..." ; git push`).
   - *Note on temporary files*: If you use a temporary file to bypass PowerShell string escaping issues for complex messages, **you MUST ALWAYS create the file inside the `.git` directory (e.g. `.git/msg.txt`)**. Do NOT create it in the root folder. This guarantees it will be completely ignored by `git add .` and prevents it from being accidentally tracked and committed into the repository.

## Required Commit Message Format

The commit message MUST contain the following three sections:

- **Short summary**: First line always, imperative mood, in present tense. Brief summary of the changes, following Conventional Commits (e.g., `feat(...)`, `chore(...)`, `style(...)`, `refactor(...)`, etc.)
- **Maintainer Notes**: Deep technical details, rationale behind design decisions, performance impacts, or architectural changes. Use category prefixes (e.g., `- Performance:`, `- Caching:`).
- **Summary of Changes**: High-level bulleted list of the exact files/components modified and what they do now.
- **User-facing**: Clear, non-technical explanations of what the end user will notice (new features, visual changes, or speed improvements).

### Example

```text
feat: Add initial support forfetching alerts from providers.

Maintainer Notes:
- Concurrency: Split MAX_CONCURRENT_REQUESTS into API (15) and WebView (3) to prevent scraper-heavy providers from stalling faster API sources.
- Caching: Implemented granular per-source caching in cache.rs and lib.rs to allow single-provider refreshes without losing state for others.
...

Summary of Changes:
- UI: Added a collapsible 'Progress Console' that shows real-time status of each provider during refresh.
- UI: Added a toast warning for Enea/PSG due to their known slower response times.
- PGE: Now filters out 'revoked' outages and includes city names in the location preview.
...

User-facing:
- New progress tracker shows which providers are currently updating.
- Faster startup and data refreshes through optimized background processing.
...
```
