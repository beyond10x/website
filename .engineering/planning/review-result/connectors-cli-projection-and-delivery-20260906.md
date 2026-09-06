---
format: aep.planning-md/1
id: review-result:connectors-cli-projection-and-delivery-20260906
kind: review-result
status: active
title: Verify the Connector CLI projection and observed bundle delivery
relations:
- reviews: story:publish-reviewed-connectors-cli
- reviews: task:publish-reviewed-connectors-cli
revision: 1
---
unit: story:publish-reviewed-connectors-cli at7600eaf61952b7896f1e196881427dd5e84d4be4
verdict: green for generated source changes and observed delivery
review-kind: coordinator deterministic projection verification, not an independent product adversary pass

Reviewed the complete seven-file change from Website e0409292. Public source changes are the deterministic lock and three changed Atlas bootstrap files; ecosystem.json is unchanged. All five changed source entries name published commits and retain the same manifest digests. Only AEP, Connectors and ESS change collected content; Devcenter and Workspace advance source identity without changing their collected content. Metadata binds the clean Atlas producer f3b9f99b, committed Website inputs fc64c9ff and the exact lock/hash set. Release facts were observed by the producer, not authored as new release assertions.

The ordinary remote-backed Website gate at7600eaf passed99 tests, code/type checks, responsive navigation/search, and the crawl/provenance agreement of356 routes and1328 files. Atlas verify-portal passed24 locked sources,25 surfaces and52 delivery records against that artifact. CI34025485980 passed. Source PR5 merged at the identical bot-authored/bot-committed7600eaf through the normal fast-forward path.

Observed production is the existing immutable bundle publication v2, not this retained-lock artifact. Successful Atlas run34024493096 published Website runtimefc4571534765c098ed861bc326da4d3da0d1df63 with source set e68b6b02e92ce94126fc0ecee7540772472e25ad386183305b6f53565ddc94f2. Its live provenance identifies Connectors4b32397df2cc2f5bd5ee1c5737891163fb750957 and producer run34023890652/artifact9986420081. The later coordinator live gate passed37 repository states,26 Pages repositories and52 routes with one Website commit. No manual retained-lock publication was dispatched over the newer source set.

The later scheduled run34024834663 failed during Resolve and snapshot desired source level before publication. Its retained log gives only exit1; no specific cause is inferred, and this review does not claim the latest scheduler run is green. The already delivered Connector source and all live route checks remain verified. No release/tag, runtime pin change, live Slack send or package dependency change was made.

Raw evidence inventory: `~/.cache/cw6/p/website-cli-delivery-evidence-inventory.json`. All source gate, portal/live checks, successful publication metadata, live provenance and later failed schedule logs remain retained there.

```findings
[]
```
