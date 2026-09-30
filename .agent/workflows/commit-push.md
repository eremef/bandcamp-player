---
description: Commit and push current changes and staged files
---

# Commit and Push

Run this workflow only when the user explicitly invokes it or asks to commit and push the current changes. That request authorizes staging, committing, and pushing for this invocation. Do not trigger it just to draft a commit message, inspect Git status, or finish unrelated implementation work.

## 1. Analyze Changes

- Confirm the repository root, current branch, configured upstream, and working-tree status with Git.
- Review staged and unstaged diffs separately. Inspect untracked file names and contents because they do not appear in `git diff` until staged.
- Check for merge conflicts, likely secrets or credentials, and generated or unrelated files that should not be published. If a secret is present, a conflict exists, the branch is detached, or the push destination is unclear, stop and explain the blocker before staging.
- Do not discard, reset, stash, rebase, or rewrite existing user changes.
- If there are no changes to commit, report that and stop.

## 2. Formulate the Commit Message

Use the changes to write one accurate, comprehensive message. Include all four sections below; the format description says “three sections” but lists four.

```text
feat(scope): add a concise imperative summary

Maintainer Notes:
- Category: Explain important technical decisions, behavior, or performance effects.

Summary of Changes:
- Path/component: Describe the exact change.

User-facing:
- Describe what users will notice in clear, non-technical language.
```

- The first line must be a brief Conventional Commit in imperative, present-tense wording, following this repository’s lowercase style (for example, `fix(playlist-sync): sync in standalone mode`).
- Keep Maintainer Notes technically useful and use category prefixes such as `Security:`, `Architecture:`, or `Performance:`.
- Make Summary of Changes bullets specific to the files or components changed. Make User-facing bullets understandable to end users. Omit claims that are not supported by the reviewed changes.

## 3. Stage, Commit, and Push

- Stage all current staged, unstaged, deleted, and untracked repository changes with `git add -A`, as requested by this workflow. Ignored files remain ignored.
- If a temporary file is needed for the multiline message, create it only inside Git’s metadata directory, resolved with `git rev-parse --absolute-git-dir`. Never create the message file in the repository root. Set a shell variable named `messageFile` to its absolute path and remove the temporary file after use.
- When supported, use one guarded chained execution so commit and push run only if each preceding step succeeds:

  ```sh
  git add -A && git diff --cached --check && git commit --file "$messageFile" && git push
  ```

- Review any newly staged file that was not already inspected before committing. Do not force-push, change branches, or guess a remote/upstream. If there is no configured upstream, ask which destination to use.
- If commit succeeds but push fails, leave the local commit intact and report the exact push failure. Never reset or amend it automatically.

## 4. Verify and Report

After a successful push, check the latest commit and branch status. Report the commit hash and subject, the pushed branch/upstream, and whether the worktree is clean. If any step fails, report which steps completed and what remains.
