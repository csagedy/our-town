# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:1105d646 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


## The Project: "our town" pretend-play game

A Toca Boca-style open-ended pretend-play game for two kids:
- **Zoe (9)**: voracious reader; loves cooking and dreams of opening a cafe; loves singing and theater.
- **Ian (5)**: starting kindergarten, knows only a handful of sight words; loves building and Spider-Man; plays "school" to understand it.

**Toca Boca mechanics, not a "game":** no score, no timers, no failure, no win state. Everything is draggable, everything reacts to a tap (squish, sound, face change), characters and objects carry between locations, the state autosaves. Joy is in the tactile details and funny reactions.

**Locations (city map hub):** Cafe (kitchen and dining room), Theater (stage, costume closet, lights, singing), Construction Site (build, dig, stack), School (kindergarten classroom and recess). Superhero play lives in the theater costume closet: generic capes, masks, a web-slinger suit. **No Marvel/Disney IP, names, or logos.**

**Hard requirements**
- Target: **iPad Safari, landscape, touch-first**, installable to the home screen as a PWA.
- **Must run fully offline** (road trips). Service worker precaches everything; no CDNs, no network calls at runtime.
- **Zero reading required** for Ian: all core play is icons, pictures and sound. Text is an optional layer for Zoe (menu board, dish names, show programs, name tags).
- Mic recording in the theater must work offline and on-device only; never upload anything.
- Performance on older iPads: animate only transform and opacity; big hit targets (at least 64pt).
- **Target devices:** an original iPad Pro (A9X, which tops out at **iPadOS 16 / Safari 16**, 2 to 4GB RAM) and an iPad Air 5th gen (M1). **Safari 16 is the compatibility floor**: no syntax or APIs newer than Safari 16.0 (check caniuse), and performance is judged on the old Pro.
- **Hosting:** GitHub Pages under the csagedy account, same as `/Users/chris/workspace/games` (kids-arcade). Reuse its PWA/service-worker update pattern (`sw.js`, version shown in menu, "Update now" button). Creating or pushing a repo needs the user's OK.
- **Mechanics must actually work.** The last attempt's interactions "didn't seem to work as intended". Every interaction bead must be verified by driving it with real synthetic touch/pointer events in a browser (touch emulation, iPad-sized viewport), not just by unit tests or reading the code. Describe in the close note exactly what you did and saw.
- The old bakery prototype is in `archive/bakery-v1/`. It's reference only. Don't build on it without a reason.

**Workflow:** all work is tracked in beads (`bd`). Orchestrator is the main Claude session; subagents claim a bead, do the work, and close it with a note on what changed and how it was verified. Don't commit unless the orchestrator asks.

## Build & Test

_To be filled in once the engine exists._

## Architecture Overview

_To be filled in once the engine exists. Design doc: `docs/design.md`._
