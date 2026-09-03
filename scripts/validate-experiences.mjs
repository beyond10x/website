import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {evaluateExperienceCatalog, validateManifestExperienceReferences} from '@beyond10x/docs-system/experiences';
import {readExperienceCatalog, readManifest} from '@beyond10x/docs-system/manifest';
import {validateExperiencePresentation} from './experience-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');
const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
const presentation = JSON.parse(await readFile(path.join(root, 'data', 'experience-pages.json'), 'utf8'));
const manifest = await readManifest(path.join(root, 'b10x.docs.yaml'));
if (manifest.schema !== 'b10x-docs/v4') throw new Error('Website must own its experience references through b10x-docs/v4');
validateManifestExperienceReferences(manifest, catalog);
const websiteSurface = manifest.surfaces.find((surface) => surface.id === 'docs');
if (!websiteSurface
  || websiteSurface.documentDefaults.support !== 'preview'
  || websiteSurface.documentDefaults.access !== 'public'
  || websiteSurface.documentDefaults.audiences.join(',') !== 'evaluator,adopter,developer,operator,researcher') {
  throw new Error('the Website v4 surface must preserve Atlas\'s preview/public defaults for all five audiences');
}
const result = validateExperiencePresentation(catalog, presentation);
const evaluated = evaluateExperienceCatalog(catalog);
const paths = evaluated.flatMap((experience) => experience.adoptionPaths);
const evaluatedById = new Map(evaluated.map((experience) => [experience.id, experience]));
const primaryPaths = presentation.pages.map((page) => evaluatedById.get(page.experienceId)?.adoptionPaths.find((path) => path.id === page.adoptionPathId));
if (primaryPaths.some((path) => !path?.actionable)) {
  throw new Error(`primary Website paths must be actionable: ${primaryPaths.filter((path) => !path?.actionable).map((path) => path ? `${path.id} (${path.blockers.join(', ')})` : 'missing path').join('; ')}`);
}
const experiencesWithoutAnAvailablePath = evaluated.filter((experience) => !experience.adoptionPaths.some((path) => path.actionable));
if (experiencesWithoutAnAvailablePath.length > 0) {
  throw new Error(`active Website experiences need at least one actionable path: ${experiencesWithoutAnAvailablePath.map((experience) => experience.id).join(', ')}`);
}
const unexplainedBlockers = paths.filter((path) => !path.actionable && !path.explanation);
if (unexplainedBlockers.length > 0) {
  throw new Error(`blocked adoption paths must explain their blockers: ${unexplainedBlockers.map((path) => path.id).join(', ')}`);
}
const devcenterCluster = evaluatedById.get('deploy-operate-products')?.adoptionPaths.find((path) => path.id === 'company-cluster-devcenter');
if (!devcenterCluster
  || devcenterCluster.actionable
  || devcenterCluster.support !== 'paused'
  || devcenterCluster.access !== 'approval-required'
  || devcenterCluster.effectiveAccess !== 'private'
  || !devcenterCluster.blockers.includes('non-actionable-support')
  || !devcenterCluster.blockers.includes('unavailable-artifact')
  || !devcenterCluster.blockers.includes('private-access')) {
  throw new Error('the Devcenter company-cluster path must remain visibly approval-gated and blocked by its unpublished private container');
}
const productPaths = evaluatedById.get('evaluate-beyond10x-products')?.adoptionPaths ?? [];
if (productPaths.map((path) => path.id).join(',') !== 'frontend-review,approved-source-build') {
  throw new Error('the Devcenter evaluation experience must keep its public review and approved source-build paths separate');
}
const [frontendReview, approvedSourceBuild] = productPaths;
if (!frontendReview.actionable || frontendReview.support !== 'preview' || frontendReview.effectiveAccess !== 'public'
  || frontendReview.artifactIds.join(',') !== 'devcenter-docs,devcenter-source') {
  throw new Error('the Devcenter frontend review must remain a public preview backed only by public docs and PolyForm evaluation source');
}
if (!approvedSourceBuild.actionable || approvedSourceBuild.support !== 'preview' || approvedSourceBuild.effectiveAccess !== 'approval-required'
  || approvedSourceBuild.artifactIds.join(',') !== 'devcenter-docs,devcenter-source,devcenter-private-build-dependencies') {
  throw new Error('the Devcenter full source build must remain a preview path requiring approved private dependencies');
}
const operations = evaluatedById.get('deploy-operate-products');
if (!operations || operations.audiences.join(',') !== 'operator'
  || operations.adoptionPaths.map((path) => path.id).join(',') !== 'public-source-service,company-cluster-devcenter') {
  throw new Error('production deployment belongs only to the operator experience and must not leak into product evaluation');
}
const artifacts = new Map(catalog.artifacts.map((artifact) => [artifact.id, artifact]));
for (const [id, version, url] of [
  ['agentplugins-release-source', '0.5.1', 'https://github.com/beyond10x/agentplugins/releases/tag/0.5.1'],
  ['aep-cli-binary', '0.44.0', 'https://github.com/beyond10x/aep/releases/tag/0.44.0'],
  ['ess-cli-binary', '0.5.1', 'https://github.com/beyond10x/ess/releases/tag/0.5.1'],
]) {
  const artifact = artifacts.get(id);
  if (!artifact || artifact.availability !== 'available' || artifact.access !== 'public' || artifact.version !== version || artifact.url !== url) {
    throw new Error(`${id} must name its exact available public ${version} release`);
  }
}
const claudePath = evaluatedById.get('try-spec-driven-development')?.adoptionPaths.find((path) => path.id === 'claude-code');
if (!claudePath || claudePath.prerequisites?.join('\n') !== [
  'A Git repository',
  'Claude Code',
  'The pinned AEP and ESS command-line binaries on PATH for a supported Linux or macOS target',
].join('\n')) {
  throw new Error('the Claude path must declare only its real repository, host, and native CLI prerequisites');
}
if (!/validated ESS model.*generated docs.*scoped.*critic-reviewed plan.*blocker.*evidence/is.test(claudePath.outcome ?? '')
  || !/implementation remains optional and experimental/i.test(claudePath.outcome ?? '')
  || /reviewed change|implemented change|finished implementation/i.test(claudePath.outcome ?? '')) {
  throw new Error('the Claude path outcome must stop at the validated model, generated docs, reviewed plan, and visible blockers without promising completed implementation');
}
for (const id of ['aep-cli-binary', 'ess-cli-binary']) {
  const note = artifacts.get(id)?.note ?? '';
  if (!/x86_64.*aarch64.*Linux GNU.*x86_64.*aarch64.*macOS/i.test(note)
    || !note.includes('SHA256SUMS')
    || !/No Windows archive is published/i.test(note)) {
    throw new Error(`${id} must publish its four-target Unix archive family, checksum file, and explicit Windows boundary`);
  }
}
process.stdout.write(
  `validated ${result.experienceCount} Docs System experiences, ${paths.length} adoption paths, ${catalog.artifacts.length} artifacts, `
  + `${result.stepCount} presentation steps, and the Website v4 manifest\n`,
);
