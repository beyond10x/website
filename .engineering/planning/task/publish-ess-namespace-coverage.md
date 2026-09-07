---
format: aep.planning-md/1
id: task:publish-ess-namespace-coverage
kind: task
status: implemented
title: Deliver the native namespace-coverage documentation
revision: 6
---
Refresh the retained Website source lock after ESS PR #12 is merged, render the corresponding Atlas-owned snapshot, and run the Website and Atlas delivery gates required by workspace policy. ESS owns the public source; this task adds no authored technical claims or tool/runtime changes to Website.

Use the existing remote source-lock writer and preserve its complete roster. Record the exact ESS source revision, all other rows the native writer advances, snapshot producer, checks and actual source-set publication. Do not hand-edit lock rows or generated bootstrap output. Public source remains restricted to declared manifests, and no private adopter observations are inputs.

User instruction on 2026-09-07: merge the tested collector fix. This task records the documentation delivery required by the source and workspace contracts. It authorizes no release tag or binary publication. Any observed gate refusal remains visible; a completed source merge and production delivery are separate facts.

## Verified retained-lock delivery, 2026-09-07

ESS PR https://github.com/beyond10x/ess/pull/12 merged as a45b4081de9352e0b2f0b7a8ec87bb91f99b6cc3. The original collector pin 23a4986cef0a3b86b9ef6fa6ab48f7c4191b1ba0 remains an ancestor. The combined source branch passed task check (2,125 tests) and task site-build before merge; the merge tree is byte-identical to that tested branch.

The native remote-backed Website writer advanced exactly three source rows: ESS to a45b4081de9352e0b2f0b7a8ec87bb91f99b6cc3, Devcenter to 22482c1bc85ea753a409c1fcc9b61a9d6703de86, and Eventlog to 081815cdfcbf1c751e7ee91abd81af2ff7d460cb. The committed lock input is f124ccf4ecbde2edc11d279cf8c64c27c065cd99 and its SHA-256 is 633e0fd2e80f5e106f2f051726a64873f40bfdc838a8cbfcc4851f43d96843da. Native Atlas snapshot at clean producer d10b7484d64c28830774c9dae0ec531fcc47acb2 changed only bootstrap metadata; snapshot commit ef3de524cae83a0f74012468f69522a238f4b566.

On ef3de524cae83a0f74012468f69522a238f4b566, Node 24 npm run gate passed all 99 tests, typecheck, source/build code contracts, search and browser navigation/reflow checks, and verified 357 routes, 1,332 files and production deployment agreement. Source fetching used public remote commits with no local-preview or source-workspace override. Exact managed Atlas docs verify-portal passed: 24 locked public sources, 25 surfaces, 52 delivery records. Logs are external under /home/timo/.cache/ess-pr12-merge-20260907/website-gate.log and website-atlas-portal.log.

The unmodified broad Atlas fence remains red on pre-existing primary-workspace drift (AgentIDE manifest support, the primary Website Docs System pin, and the catalog map). This is distinct from the successful checks on the exact managed Website and Atlas trees; no unrelated primary checkout was changed.

Production source-set reconciliation was dispatched through the b10x-bot App in https://github.com/beyond10x/atlas/actions/runs/34096309073. Publication and live provenance verification remain in progress. No runtime/control pins, release tags or binary publication are changed by this task.

## Completed production delivery

The retained Website lock, native snapshot and gate record were published to main at 585598c4a5cd5d838d48ad560f49dec5210d73c0 through the Atlas bot wrapper. The automatic source-set path independently completed successfully in https://github.com/beyond10x/atlas/actions/runs/34096309073; the ESS post-merge CI and documentation bundle also succeeded.

The downloaded self-contained publication passed the native Website verifier: 357 routes, 1,332 files and b10x-publication-layout/v2 deployment agreement. Its source set selects ESS a45b4081de9352e0b2f0b7a8ec87bb91f99b6cc3 from producer run 34095802682, artifact 10008553008. Production keeps Website runtime fc4571534765c098ed861bc326da4d3da0d1df63 and Atlas controls d10b7484d64c28830774c9dae0ec531fcc47acb2. Source-set SHA-256: 18a4e13c0c850e2bab27e231450109a4a6e67ecc818ce7db44d5c6c4ac2b5af8. Site artifact SHA-256: a4616ad4124aa26893feb22a0ae65e1934e1935aa97da3401581e1b601a8056f.

Live https://beyond10x.github.io/.well-known/b10x-docs.json was byte-identical to the verified artifact's site/PROVENANCE.json. Live https://beyond10x.github.io/docs/ess/guides/check-infrastructure/ was byte-identical to its generated artifact page (SHA-256 5932df1ae844ae69225fe124dd40b0fc34828e7438b612f1318426ae36811daf). The native Atlas docs verify-pages check passed: 37 repository states, 26 Pages repositories, 52 delivery routes and one Website commit.

External verification inputs and logs are retained under /home/timo/.cache/ess-pr12-merge-20260907, including publication/, publication-verify.log, live-provenance.json, live-infrastructure-guide.html and live-pages.log. Generated build/dependency output is disposable and removed during managed worktree cleanup. The ESS and four specs worktrees have already been removed by exact reviewed worktree GC IDs with remote recovery evidence; the Website and Atlas task trees are next after this record is published. This interactive run required no fabricated approval or release authorization.
