status: FAIL
errors:
  - spec: spec-07-dashboard-0-empty-state + spec-11-dashboard-empty-state-0
    issue: "OVERLAP: Near-identical duplicate specs — both create the same 3 files: components/dashboard/DashboardEmptyState.tsx (create), components/dashboard/__tests__/DashboardEmptyState.test.tsx (create), and modify app/dashboard/page.tsx."
    fix_suggestion: "Delete spec-11 (duplicate). Consolidate all empty-state requirements into spec-07."

  - spec: spec-21-lib-dashboard + spec-22-needs-action-pending-responded-info-only + spec-23-200-loc + spec-26-app-dashboard-page-tsx-200-loc + spec-27-lib-dashboard-queries-ts
    issue: "OVERLAP: All 5 specs list lib/dashboard-queries.ts as 'create' in Files in Scope. Only one spec can be the authoritative creator."
    fix_suggestion: "Designate spec-27 as the sole creator of lib/dashboard-queries.ts. Move the file to FORBIDDEN (managed by spec-27) in specs 21, 22, 23, 26."

  - spec: spec-21-lib-dashboard + spec-22-needs-action-pending-responded-info-only + spec-23-200-loc + spec-24-lib-dashboard-queries-ts-8 + spec-26-app-dashboard-page-tsx-200-loc + spec-27-lib-dashboard-queries-ts
    issue: "OVERLAP: All 6 specs list lib/__tests__/dashboard-queries.test.ts as 'create' in Files in Scope. Only one spec can own this test file."
    fix_suggestion: "Consolidate dashboard-queries tests into spec-27. Add lib/__tests__/dashboard-queries.test.ts to FORBIDDEN in all other specs."

  - spec: spec-22-needs-action-pending-responded-info-only + spec-26-app-dashboard-page-tsx-200-loc + spec-28-components-dashboard-3
    issue: "OVERLAP: All 3 specs list components/dashboard/DashboardEmailItem.tsx, DashboardStatusSection.tsx, and DashboardCategorySection.tsx as 'create' in Files in Scope."
    fix_suggestion: "Assign component creation to spec-28 only. In specs 22 and 26, move these component files to FORBIDDEN (managed by spec-28)."

  - spec: spec-07-dashboard-0-empty-state + spec-11-dashboard-empty-state-0 + spec-13-aria-label + spec-21-lib-dashboard + spec-22-needs-action-pending-responded-info-only + spec-23-200-loc + spec-26-app-dashboard-page-tsx-200-loc + spec-28-components-dashboard-3 + spec-58-dashboard-viewed-dashboard
    issue: "OVERLAP: 9 specs all modify app/dashboard/page.tsx in the same batch. This file has 9 overlapping owners."
    fix_suggestion: "Define a strict serialization order. Each spec after the first must reference the prior as FORBIDDEN or use an explicit merge strategy. Consider consolidating dashboard page mutations into fewer specs."

  - spec: spec-02-dashboard-4-detail-375px + spec-03-overflow-main + spec-04-15-sm-md-lg + spec-06-detail-app-fixture-match-cargo-vessel-recap-id + spec-08-npm-run-lint-npm-test-npm-run-build + spec-30-lib-types-ts + spec-32-generics + spec-59-detail-viewed-detail-cargo-vessel-fixture-match
    issue: "OVERLAP: 8 specs all list app/cargo/[id]/page.tsx, app/vessel/[id]/page.tsx, app/fixture/[id]/page.tsx, and app/match/[id]/page.tsx in Files in Scope."
    fix_suggestion: "Assign the detail pages to a single owning spec. Others must list them in FORBIDDEN with the owning spec identified."

  - spec: spec-06-detail-app-fixture-match-cargo-vessel-recap-id + spec-08-npm-run-lint-npm-test-npm-run-build
    issue: "OVERLAP: Both specs list lib/parsing-utils.ts as 'extend' in Files in Scope."
    fix_suggestion: "Decide which spec owns lib/parsing-utils.ts. The other must move it to FORBIDDEN."

  - spec: spec-06-detail-app-fixture-match-cargo-vessel-recap-id + spec-08-npm-run-lint-npm-test-npm-run-build
    issue: "OVERLAP: spec-06 creates lib/ui-render.ts while spec-08 creates lib/ui-render.tsx — same logical module with conflicting file extensions, both listed as 'create' in Files in Scope."
    fix_suggestion: "Pick one extension (.ts vs .tsx) and designate one spec as sole creator. Update FORBIDDEN references in the other."

  - spec: spec-12-div-onclick-button + spec-13-aria-label
    issue: "OVERLAP: Both specs list components/recap/recap-actions.tsx as 'modify' in Files in Scope."
    fix_suggestion: "Merge the two modifications into one spec, or serialize them with the second spec listing recap-actions.tsx in FORBIDDEN."

  - spec: spec-05-app-processing-page-tsx-7 + spec-13-aria-label + spec-14-role-aria-processing + spec-20-processing-tabindex-aria-live + spec-56-processing-complete-pipeline-7 + spec-57-processing-failed
    issue: "OVERLAP: 6 specs all list app/processing/page.tsx as 'modify'/'extend' in Files in Scope."
    fix_suggestion: "Define explicit serialization order for processing/page.tsx modifications. Each subsequent spec must reference the prior owners in FORBIDDEN."

  - spec: spec-36-lib-sample-data + spec-37-json-cargo-inquiries + spec-38-route-ts-import + spec-39-route-ts-30-loc + spec-42-app-api-sample-route-ts-30-loc + spec-43-lib-sample-data-json
    issue: "OVERLAP: 6 specs all list app/api/sample/route.ts as 'modify' in Files in Scope."
    fix_suggestion: "Assign route.ts ownership to one spec (e.g., spec-42). Others should list it in FORBIDDEN."

  - spec: spec-36-lib-sample-data + spec-37-json-cargo-inquiries + spec-43-lib-sample-data-json
    issue: "OVERLAP: All 3 specs list lib/sample-data/cargo-inquiries.json, vessel-positions.json, fixture-recaps.json, and client-replies.json as 'create' in Files in Scope."
    fix_suggestion: "Assign JSON file creation to spec-37. Move to FORBIDDEN in specs 36 and 43."

  - spec: spec-37-json-cargo-inquiries + spec-43-lib-sample-data-json
    issue: "OVERLAP: Both specs list app/api/sample/__tests__/route.test.ts as 'create' in Files in Scope."
    fix_suggestion: "Pick one spec as the test owner (e.g., spec-43). Add it to FORBIDDEN in spec-37."

  - spec: spec-15-alt-img + spec-35-ts-ignore-ts-expect-error
    issue: "OVERLAP: Both specs list .eslintrc.json as 'modify' in Files in Scope."
    fix_suggestion: "Merge ESLint rule changes into one spec, or serialize with the second referencing FORBIDDEN."

  - spec: spec-61-next-public-posthog-key-posthog + spec-62-posthog
    issue: "OVERLAP: Near-duplicate analytics specs — both create lib/analytics.ts, lib/__tests__/analytics.test.ts, and both extend package.json and .env.local.example."
    fix_suggestion: "Delete spec-62 or consolidate into spec-61. If both are needed, split their scopes so no files overlap."

  - spec: spec-64-docs-deploy-md-rollback + spec-74-docs-deploy-md-rollback
    issue: "OVERLAP: Both specs extend docs/deploy.md with a ## Rollback section (identical content). spec-74 states it supersedes spec-64 but both remain active with the same Files in Scope."
    fix_suggestion: "Delete spec-64. Keep only spec-74 as the authoritative rollback docs spec."

  - spec: spec-49-readme-docker + spec-65-readme-md + spec-66-setup-clone-env-local-npm-install + spec-67-email-classify-parse-match-recap + spec-68-npm-test + spec-69-local-npm-run-dev-docker-compose-up + spec-70-env + spec-71-docs-deploy-md + spec-73-readme-setup-env
    issue: "OVERLAP: 9 specs all list README.md in Files in Scope. spec-65 performs a full rewrite while the other 8 do extend-only appends — spec-65 full rewrite will destroy work from all other README specs if merged after them."
    fix_suggestion: "Define strict merge order for README.md. spec-65 must be executed LAST incorporating all other sections, or rewritten as an extend-only spec that adds only its specific section."

  - spec: spec-45-multi-stage-dockerfile-builder-npm-ci-npm-run-build-runner + spec-46-dockerignore-node-modules-git-next-cache-data + spec-47-docker-compose-yml-local-dev-hot-reload-volume-mount-npm + spec-49-readme-docker
    issue: "OVERLAP: spec-45 claims Dockerfile, .dockerignore, docker-compose.yml, AND README.md in Files in Scope, while specs 46, 47, and 49 individually own .dockerignore, docker-compose.yml, and README Docker section respectively."
    fix_suggestion: "Remove .dockerignore from spec-45 scope (owned by spec-46), remove docker-compose.yml from spec-45 (owned by spec-47), remove README.md from spec-45 (owned by spec-49)."

  - spec: spec-51-docker-run-p-3000-3000-quantika-demo + spec-33-npm-run-lint-npm-test-npm-run-build
    issue: "OVERLAP: Both specs list next.config.mjs as 'modify' in Files in Scope — spec-33 removes eslint.ignoreDuringBuilds, spec-51 adds output:'standalone'."
    fix_suggestion: "Serialize modifications: spec-33 runs first, spec-51 must list next.config.mjs in FORBIDDEN (managed by spec-33) and apply its change as an incremental patch."

  - spec: spec-30-lib-types-ts + spec-31-unknown-type-guard + spec-32-generics
    issue: "OVERLAP: spec-30 and spec-32 share the 4 detail pages and multiple app/api/ai/* routes. spec-31 and spec-32 share app/api/ai/parse-cargo/route.ts, parse-vessel/route.ts, and parse-recap/route.ts."
    fix_suggestion: "Consolidate TypeScript improvement specs or define strict file ownership. Each file must appear in exactly one spec's Files in Scope within the batch."

  - spec: spec-01-npm-run-lint-npm-test-npm-run-build (Batch 1) + spec-33-npm-run-lint-npm-test-npm-run-build (D5)
    issue: "OVERLAP: Batch 1 spec-01 and D5 spec-33 both list next.config.mjs as 'modify' in Files in Scope (cross-batch)."
    fix_suggestion: "Ensure spec-33 lists next.config.mjs in FORBIDDEN as 'managed by Batch 1 spec-01' if Batch 1 completes first, or merge the changes."

  - spec: spec-48-env-file-environment + spec-02-unit-tests (Batch 1)
    issue: "OVERLAP: D5 spec-48 and Batch 1 spec-02-unit-tests both modify app/api/auth/google/route.ts (cross-batch)."
    fix_suggestion: "spec-48 must reference Batch 1 spec-02-unit-tests in its FORBIDDEN list for google/route.ts, or merge both changes into one spec."

warnings:
  - spec: spec-45-multi-stage-dockerfile-builder-npm-ci-npm-run-build-runner + spec-49-readme-docker
    issue: "OVERLAP: spec-45 FORBIDDEN list marks README.md as 'managed by spec-17' which is inconsistent with spec-49 being the Docker README section owner."

  - spec: spec-56-processing-complete-pipeline-7 + spec-57-processing-failed
    issue: "OVERLAP: Both specs add track('processing_failed') calls to app/processing/page.tsx in different catch blocks — risk of duplicate analytics events if both are applied."

  - spec: spec-09-processing-page-step-specific
    issue: "DEPENDENCY_CONSISTENCY: FORBIDDEN list references 'app/api/ai/classify/route.ts — managed by spec-02'. In D5 batch spec-02 is a different spec. This appears to reference Batch 1 spec-02. Cross-batch spec numbering causes ambiguity for implementors."

  - spec: spec-13-aria-label
    issue: "DEPENDENCY_CONSISTENCY: FORBIDDEN list references 'lib/ui-render.ts — managed by spec-06' but spec-08 creates lib/ui-render.tsx (different extension). The authoritative file extension is undefined."

  - spec: spec-54-oauth-initiated-connect-gmail + spec-55-sample-started-try-sample-data + spec-56-processing-complete-pipeline-7 + spec-57-processing-failed + spec-58-dashboard-viewed-dashboard + spec-59-detail-viewed-detail-cargo-vessel-fixture-match
    issue: "DEPENDENCY_CONSISTENCY: All 6 PostHog tracking specs declare 'lib/analytics.ts — managed by spec-53' in FORBIDDEN. spec-53 does not create analytics.ts. The actual analytics.ts creators are spec-61 and spec-62. FORBIDDEN references are wrong."

  - spec: spec-60-npm-run-lint-npm-test-npm-run-build
    issue: "DEPENDENCY_CONSISTENCY: References 'spec-01 — removes typescript.ignoreBuildErrors from next.config.mjs'. In D5 batch spec-01 is the formatPortName utility spec, not the next.config.mjs modifier. Cross-batch reference causes confusion."

  - spec: spec-44-sample-route
    issue: "DEPENDENCY_CONSISTENCY: FORBIDDEN list covers specs 37, 39, 40, 42 but misses spec-43 which also creates app/api/sample/__tests__/route.test.ts."

  - spec: spec-46-dockerignore-node-modules-git-next-cache-data
    issue: "OVERLAP: Internal description references 'spec-44 (Dockerfile), spec-45 (docker-compose.yml + README Docker sektsiya)' but spec-44 is the sample route spec. The Dockerfile spec is spec-45. Spec number references inside spec-46 are wrong."

  - spec: spec-47-docker-compose-yml-local-dev-hot-reload-volume-mount-npm + spec-45-multi-stage-dockerfile-builder-npm-ci-npm-run-build-runner
    issue: "OVERLAP: spec-47 compat notes reference 'node:22-alpine' but spec-45 Dockerfile uses node:20-alpine. Inconsistent Node.js version reference between specs."

  - spec: spec-02-dashboard-4-detail-375px
    issue: "GENERIC_AC: 'Desktop-otobrazhenie (>=640px) vizualno ne izmenilos' — visual regression check with no automated verification method specified. Untestable in CI without screenshot tooling."

  - spec: spec-03-overflow-main
    issue: "GENERIC_AC: Requirement 'net gorizontalnogo overflow' is visually subjective. No concrete automated test specified for overflow behavior."

  - spec: spec-74-docs-deploy-md-rollback + spec-75-api-health-rollback-verification-step
    issue: "DEPENDENCY_CONSISTENCY: spec-75 contains conditional logic 'if rollback section already added by spec-74 — no changes needed'. Both specs are in the same batch and could be assigned to different implementors — the conditional guard risks neither implementor adding the content."

  - spec: spec-66-setup-clone-env-local-npm-install
    issue: "DEPENDENCY_CONSISTENCY: FORBIDDEN list says 'docs/deploy.md — managed by spec-65 / spec-67 (rollback section)'. spec-65 is the README.md rewrite spec, not docs/deploy.md. The docs/deploy.md rollback section is managed by spec-64/spec-74. Erroneous FORBIDDEN reference."
