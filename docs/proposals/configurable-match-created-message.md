# Proposal: Configurable "Match Created" Message

**Date:** March 4, 2026
**Status:** TODO
**Priority:** Low

---

## Summary

The "Match Created!" message posted as a system comment when matches are generated is currently hardcoded in two places in `src/lib/server/services/adminMatches.ts` (`createMatches()` and `createPlayoffMatch()`). This message should be configurable from the admin panel rather than requiring a code change to update.

## Current State

The same template literal is duplicated across both functions:

```
Match Created! Important Information:

1. Contact: Please reach out to your opponent via Discord or Steam.
2. Demo Required: You must record a demo of your match.
3. Servers: Check #match-servers in Discord for official server information.
4. Rules: Review the rulebook at https://mge.tf/rulebook
5. Issue Resolution:
  - First, check the rulebook
  - Then, communicate with your opponent
  - Only contact an admin as a last resort

Need help? Ask in Discord or contact an admin.

Good luck to both teams!
```

## Proposed Changes

1. Add a configurable field (e.g. under `SiteContent` or a new settings area) in the admin panel for the match-created message template.
2. Both `createMatches()` and `createPlayoffMatch()` should read the template from the database instead of using hardcoded strings.
3. Consider supporting per-season or per-format message templates if different leagues need different instructions.
4. Address the current plain-text formatting issues (list indentation renders poorly with `whitespace-pre-wrap`). Options include supporting basic markdown rendering in match comms or switching to structured HTML.
