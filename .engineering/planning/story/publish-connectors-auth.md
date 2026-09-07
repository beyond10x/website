---
format: aep.planning-md/1
id: story:publish-connectors-auth
kind: story
status: implemented
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
revision: 9
---
## Outcome

The reviewed Connectors guidance is published and independently verified end to end. Connectors PR19 and Website PR8 are merged; the complete Website gate, GitHub CI, managed Atlas portal, full publication-v2 verifier, source-set freshness and postpublication live Pages checks pass. All 1,713 artifact files match durable publication d0b1cb6ecc2c2c8343ab73561fc494b84ef12dd8, including byte-identical live provenance and both intended guidance pages. [The verification report](../verification-report/cli-auth-website-delivery-20260907.md) preserves the initial Devcenter source failure and correction, exact artifact identities, unchanged runtime pins and three separate primary-workspace Atlas fence failures. No release or tag is included.

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

The first full Website gate passed source/bootstrap validation, experience validation, all tests and its critical-level dependency audit, then failed the code-rendering contract on two `console` fences in newly published Devcenter docs/local-acceptance.md. The failure is retained. Devcenter PR60 fixes exactly those two labels as bash without changing command bytes; consumer diagnostics reproduced two failures before and zero after. Source main ba8cf660bdded7872df3512548d33eef22e61555 is published and documentation bundle 34072674071 passed. The complete lock and explicit freshness owner commands passed again, changing only the Devcenter row from the first refresh.

The actual unmodified full Atlas fence ran against clean remote-main d10b7484d64c28830774c9dae0ec531fcc47acb2. All 149 Rust tests passed; catalog, live Pages, projection, markdown and brand checks were green. Three primary-workspace failures remain separately retained: Agentide v4 manifest rejected by the primary collector, primary Website dependency pin mismatch, and Widgets missing a Serves objective. These do not replace the required managed Website portal check. The 53-member evidence seal was independently verified; report SHA256 6e70c614f102bcb032cbe11f40404021d4ba865ef270b120672e23797d018d51. An initial preflight resource refusal launched nothing; the later complete run stayed above every reserve and changed no Atlas source.

The snapshot is regenerated after this committed lock, then the full Website gate is repeated. Runtime, dependency, source roster, workflow and facade pins remain unchanged. The Devcenter producer was explicitly dispatched through its existing input because its generated path filter does not yet list the new guide; this delivery does not hand-edit that generated workflow.
