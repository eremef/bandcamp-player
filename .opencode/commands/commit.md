---
description: Prepare comprehensive commit, commit and push
---

# Rules

- Never commit secrets, credentials, or sensitive files (e.g., .env, credentials.json, *.key)
- Always review all changes before committing
- Follow existing commit message style from recent history
- Ensure tests pass before committing

## Steps

1. Run `git status` to see all untracked and modified files
2. Run `git diff` (staged and unstaged) to review all changes
3. Run `git log --oneline -10` to understand commit message style
4. Analyze all changes and draft a comprehensive commit message that:
   - Summarizes the nature of changes (feature, enhancement, bug fix, refactor, test, docs, etc.)
   - Focuses on the "why" rather than just the "what"
   - Is concise (1-2 sentences)
5. Stage relevant files with `git add` (but always ask before git add .). Git stash and git stash pop if needed.
6. Create commit with the drafted message
7. Push to remote with `git push`
8. Verify with `git status` that working tree is clean
