---
format: aep.planning-md/1
id: story:publish-connectors-auth
kind: story
status: active
title: Deliver the reviewed Connectors login and authentication-recovery guidance
refs:
- provider: github
  reference: beyond10x/connectors#19
relations:
- derived_from: story:publish-connectors-schema3
scope:
- confidence: cited
  path: data/bootstrap/changes.json
- confidence: cited
  path: data/bootstrap/ecosystem.json
- confidence: cited
  path: data/bootstrap/metadata.json
- confidence: cited
  path: data/bootstrap/release-facts.json
- confidence: cited
  path: sources.lock.json
revision: 6
---
## Outcome

Deliver the reviewed Connectors personal OAuth and authentication-recovery guidance through the existing organization documentation pipeline. Connectors PR19 is merged at main aab96797d227963ac06fde72ebd58230a773ab0f after both implementation reviews, all corrections and successful twelve-workspace/four-platform rehearsal 34069722221. Main documentation bundle 34071380358 completed successfully; its artifact 10000574260 was downloaded and its archive digest verified. This continues the operator-authorized CLI wave; source implementation is complete and Website delivery is active.

The complete 24-source remote lock refresh and explicit freshness check passed. Seven source rows advance: AEP, Connectors, Devcenter, ESS, Identity, Substrate and Workspace; the source roster and Website runtime/dependency/workflow pins remain unchanged. Atlas snapshot and Website/delivery gates are the next checks.

## Acceptance

- Publish the reviewed Connectors source first and observe its exact successful main documentation bundle. The two selected public pages are architecture/interfaces and architecture/deployment, both already allowlisted.
- Regenerate the complete retained source lock with the Website owner command after source publication, inspect all changed rows and prove remote availability and freshness. Commit the generated lock before rendering the four Atlas-owned bootstrap outputs.
- Run the full Website gate, the exact current Atlas portal verification, and the full Atlas fence, retaining unrelated primary-workspace failures separately if they recur.
- Publish the normal Website maintenance PR; retain the existing production build and facade revisions for this content change.
- Observe automatic organization publication, verify its complete durable v2 artifact and exact inputs, require fresh:true from the source-set freshness check, run the live Pages check, and compare live provenance bytes and both intended guidance routes.
- Keep the product limitations visible: GitLab public PKCE/device login is explicitly configured local development functionality with unsealed DevelopmentFile custody; hosted acquisition remains unsupported. Authentication repair ends with a fresh validation and a separate explicit invocation.

## Scope

All entries are cited from the existing Website owner commands and Atlas snapshot contract:

- sources.lock.json
- data/bootstrap/ecosystem.json
- data/bootstrap/changes.json
- data/bootstrap/release-facts.json
- data/bootstrap/metadata.json

The coordinator alone writes the planning store. This delivery changes no Website runtime, dependency, source roster, workflow, facade control or private Atlas migration acceptance.

## Evidence and execution state

Managed Website checkout begins at exact remote main d914fa947cc3e497e8770bb814af36d55b880f5c. Node24 npm ci --ignore-scripts completed successfully in the assigned checkout; the full gate has not yet run. The read-only delivery checklist and command inventory are retained under the assigned CLI-wave scratch root. Current Atlas authority d10b7484d64c28830774c9dae0ec531fcc47acb2 was compared with the remote advertisement. Its relevant binary and embedded build inputs are identical to the previously verified producer, whose SHA256 is 571ee4fcabc3dc62ab02084f5c7d210a8326f373ba64f8b151f19e6c4438ab74.
