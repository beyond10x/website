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
if (productPaths.map((path) => path.id).join(',') !== 'agentide-local-tui,agentide-hosted-preview,frontend-review,approved-source-build') {
  throw new Error('product evaluation must keep AgentIDE and Devcenter public and gated paths separate');
}
const agentideLocal = productPaths.find((path) => path.id === 'agentide-local-tui');
const agentideHosted = productPaths.find((path) => path.id === 'agentide-hosted-preview');
const frontendReview = productPaths.find((path) => path.id === 'frontend-review');
const approvedSourceBuild = productPaths.find((path) => path.id === 'approved-source-build');
if (!agentideLocal?.actionable || agentideLocal.support !== 'preview' || agentideLocal.effectiveAccess !== 'public'
  || agentideLocal.artifactIds.join(',') !== 'agentide-documentation,agentide-source,agentide-linux-binary') {
  throw new Error('the AgentIDE local TUI must remain a public preview backed by public docs, source, and the released Linux binary');
}
if (!agentideHosted || agentideHosted.actionable || agentideHosted.support !== 'paused'
  || agentideHosted.effectiveAccess !== 'approval-required'
  || !agentideHosted.blockers.includes('non-actionable-support')
  || !agentideHosted.blockers.includes('unavailable-artifact')) {
  throw new Error('hosted AgentIDE must remain a paused approval-required path blocked by its unpublished service');
}
const agentideSourceBuild = evaluatedById.get('build-agent-systems')?.adoptionPaths.find((path) => path.id === 'agentide-approved-source-build');
if (!agentideSourceBuild?.actionable || agentideSourceBuild.support !== 'preview'
  || agentideSourceBuild.effectiveAccess !== 'approval-required'
  || agentideSourceBuild.artifactIds.join(',') !== 'agentide-documentation,agentide-source,agentide-private-build-dependencies') {
  throw new Error('the AgentIDE source-build path must remain a preview requiring approved private dependencies');
}
if (!frontendReview.actionable || frontendReview.support !== 'preview' || frontendReview.effectiveAccess !== 'public'
  || frontendReview.artifactIds.join(',') !== 'devcenter-docs,devcenter-source') {
  throw new Error('the Devcenter frontend review must remain a public preview backed only by public docs and PolyForm evaluation source');
}
if (!approvedSourceBuild.actionable || approvedSourceBuild.support !== 'preview' || approvedSourceBuild.effectiveAccess !== 'approval-required'
  || approvedSourceBuild.artifactIds.join(',') !== 'devcenter-docs,devcenter-source,devcenter-private-build-dependencies'
  || approvedSourceBuild.url !== 'https://beyond10x.github.io/docs/devcenter/source-build/') {
  throw new Error('the Devcenter full source build must remain a preview path requiring approved private dependencies');
}
const operations = evaluatedById.get('deploy-operate-products');
if (!operations || operations.audiences.join(',') !== 'operator'
  || operations.adoptionPaths.map((path) => path.id).join(',') !== 'public-source-service,company-cluster-devcenter'
  || devcenterCluster.url !== 'https://beyond10x.github.io/docs/devcenter/production-deployment/') {
  throw new Error('production deployment belongs only to the operator experience and must not leak into product evaluation');
}
const productPresentation = presentation.pages.find((page) => page.experienceId === 'evaluate-beyond10x-products');
const agentideStepUrls = productPresentation?.sections.flatMap((section) => section.steps)
  .filter((step) => step.url.startsWith('/docs/agentide/'))
  .map((step) => step.url) ?? [];
if (agentideStepUrls.join(',') !== '/docs/agentide/running-modes/,/docs/agentide/,/docs/agentide/running-modes/') {
  throw new Error('the primary product evaluation path must lead through AgentIDE modes, installation, and runtime boundaries');
}
const artifacts = new Map(catalog.artifacts.map((artifact) => [artifact.id, artifact]));
for (const [id, version, url] of [
  ['agentplugins-release-source', '0.5.1', 'https://github.com/beyond10x/agentplugins/releases/tag/0.5.1'],
  ['aep-cli-binary', '0.44.0', 'https://github.com/beyond10x/aep/releases/tag/0.44.0'],
  ['ess-cli-binary', '0.8.0', 'https://github.com/beyond10x/ess/releases/tag/0.8.0'],
  ['agentide-linux-binary', '0.1.1', 'https://github.com/beyond10x/agentide/releases/tag/0.1.1'],
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
