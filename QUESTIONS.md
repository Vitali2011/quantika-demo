# R3 Subagent Questions

- [/] Q001 [19:00] type=blocked path=/root/work/quantika-demo/.worktrees/r3-aibar — Push blocked by auto-mode classifier: all 18 files committed to branch design/r3-aibar-cmdk (commit 5ecc50a), need orchestrator to authorize `git push -u origin design/r3-aibar-cmdk` then `gh pr create`. → STUCK: branch already on origin (up to date with origin/design/r3-aibar-cmdk) — push resolved; `gh pr create` forbidden for monitor, needs human orchestrator.

# R6 Open Questions

- [ ] Q002 [10:00] type=blocked path=/root/work/quantika-demo/.worktrees/r6-final/components/ui — Cannot delete components/ui/: 40 imports across 22 files (app/ loading skeletons, components/match, components/recap). Components in use: PageSkeleton, Button, Badge, Card, Progress. Decision: (a) migrate all 22 files to ds.* equivalents then delete, or (b) keep components/ui/ as internal library. If (b), update R6 acceptance criteria.

- [ ] Q003 [10:00] type=question path=/root/work/quantika-demo/.worktrees/r6-final/tailwind.config.ts — Old shadcn tokens (hsl(var(--xxx)) series) still referenced by components/ui/. Cannot remove until Q002 resolved. Safe to keep ds.* and legacy tokens in parallel.

- [ ] Q004 [10:00] type=question path=/root/work/quantika-demo/.worktrees/r6-final/tests/a11y/pages — A11y specs for /match/[id], /vessel/[id], /fixture/[id] use placeholder IDs. If IDs absent from demo seed, axe tests the 404/empty-state page. Acceptable baseline OR seed known IDs first?

- [ ] Q005 [10:05] type=blocked path=/root/work/quantika-demo/.worktrees/r6-final — Push blocked by auto-mode classifier (rule: НЕ push без явного разрешения orchestrator). Branch `design/r6-final-wt` has 1 commit (5bb85cb) ready. Orchestrator needs to authorize: `git push -u origin design/r6-final-wt` then `gh pr create --title "feat(r6): a11y baseline + Lighthouse CI gate + living docs" --base main`.
