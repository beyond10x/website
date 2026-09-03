import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {evaluateExperienceCatalog} from '@beyond10x/docs-system/experiences';
import {readExperienceCatalog} from '@beyond10x/docs-system/manifest';
import {experienceRoutes, validateExperiencePresentation} from '../scripts/experience-contract.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('Docs System validates the audience-first catalog and its evaluated adoption contracts', async () => {
  const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
  const presentation = JSON.parse(await readFile(path.join(root, 'data', 'experience-pages.json'), 'utf8'));
  const result = validateExperiencePresentation(catalog, presentation);
  assert.equal(result.experienceCount, 6);
  assert.ok(result.stepCount >= 20);
  assert.equal(catalog.artifacts.length, 20);
  const evaluated = evaluateExperienceCatalog(catalog);
  const evaluatedById = new Map(evaluated.map((experience) => [experience.id, experience]));
  const primaryPaths = presentation.pages.map((page) => evaluatedById.get(page.experienceId).adoptionPaths.find((path) => path.id === page.adoptionPathId));
  assert.ok(primaryPaths.every((path) => path.actionable && path.effectiveAccess === 'public'));
  assert.ok(evaluated.every((experience) => experience.adoptionPaths.some((path) => path.actionable)));
  assert.deepEqual(primaryPaths.map((path) => path.support), [
    'experimental', 'supported', 'experimental', 'preview', 'experimental', 'supported',
  ]);
  const devcenterCluster = evaluatedById.get('deploy-operate-products').adoptionPaths.find((path) => path.id === 'company-cluster-devcenter');
  assert.deepEqual({
    support: devcenterCluster.support,
    access: devcenterCluster.access,
    effectiveAccess: devcenterCluster.effectiveAccess,
    actionable: devcenterCluster.actionable,
    blockers: devcenterCluster.blockers,
  }, {
    support: 'paused',
    access: 'approval-required',
    effectiveAccess: 'private',
    actionable: false,
    blockers: ['non-actionable-support', 'unavailable-artifact', 'private-access'],
  });
  assert.match(devcenterCluster.explanation, /paused.*unpublished.*private/i);
});

test('Devcenter keeps evaluation paths separate from operator-only production deployment', async () => {
  const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
  const product = evaluateExperienceCatalog(catalog).find((experience) => experience.id === 'evaluate-beyond10x-products');
  assert.deepEqual(product.adoptionPaths.map((path) => path.id), ['frontend-review', 'approved-source-build']);
  assert.deepEqual(product.adoptionPaths.map((path) => ({
    support: path.support,
    access: path.access,
    effectiveAccess: path.effectiveAccess,
    actionable: path.actionable,
    artifactIds: path.artifactIds,
  })), [
    {support: 'preview', access: 'public', effectiveAccess: 'public', actionable: true, artifactIds: ['devcenter-docs', 'devcenter-source']},
    {support: 'preview', access: 'approval-required', effectiveAccess: 'approval-required', actionable: true, artifactIds: ['devcenter-docs', 'devcenter-source', 'devcenter-private-build-dependencies']},
  ]);
  const operations = evaluateExperienceCatalog(catalog).find((experience) => experience.id === 'deploy-operate-products');
  assert.deepEqual(operations.audiences, ['operator']);
  assert.deepEqual(operations.adoptionPaths.map((path) => path.id), ['public-source-service', 'company-cluster-devcenter']);
  const artifacts = new Map(catalog.artifacts.map((artifact) => [artifact.id, artifact]));
  assert.match(artifacts.get('devcenter-source').note, /PolyForm.*less than 32 consecutive calendar days/i);
  assert.deepEqual(
    ['devcenter-docs', 'devcenter-source', 'devcenter-private-build-dependencies', 'devcenter-chart', 'devcenter-production-container']
      .map((id) => [id, artifacts.get(id).kind, artifacts.get(id).availability, artifacts.get(id).access]),
    [
      ['devcenter-docs', 'documentation', 'available', 'public'],
      ['devcenter-source', 'source', 'available', 'public'],
      ['devcenter-private-build-dependencies', 'package', 'available', 'approval-required'],
      ['devcenter-chart', 'helm-chart', 'available', 'public'],
      ['devcenter-production-container', 'container', 'unpublished', 'private'],
    ],
  );
  assert.match(artifacts.get('devcenter-chart').note, /insufficient.*private images/i);
});

test('the Claude practitioner path pins its actual plugin and CLI releases', async () => {
  const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
  const artifacts = new Map(catalog.artifacts.map((artifact) => [artifact.id, artifact]));
  assert.deepEqual(
    ['agentplugins-release-source', 'aep-cli-binary', 'ess-cli-binary'].map((id) => {
      const artifact = artifacts.get(id);
      return [id, artifact.kind, artifact.version, artifact.url, artifact.availability, artifact.access];
    }),
    [
      ['agentplugins-release-source', 'source', '0.5.1', 'https://github.com/beyond10x/agentplugins/releases/tag/0.5.1', 'available', 'public'],
      ['aep-cli-binary', 'binary', '0.44.0', 'https://github.com/beyond10x/aep/releases/tag/0.44.0', 'available', 'public'],
      ['ess-cli-binary', 'binary', '0.5.1', 'https://github.com/beyond10x/ess/releases/tag/0.5.1', 'available', 'public'],
    ],
  );
  const claude = catalog.experiences.find((experience) => experience.id === 'try-spec-driven-development').adoptionPaths.find((path) => path.id === 'claude-code');
  for (const artifactId of ['agentplugins-release-source', 'aep-cli-binary', 'ess-cli-binary']) {
    assert.ok(claude.artifactIds.includes(artifactId));
  }
  assert.deepEqual(claude.prerequisites, [
    'A Git repository',
    'Claude Code',
    'The pinned AEP and ESS command-line binaries on PATH for a supported Linux or macOS target',
  ]);
  assert.ok(claude.prerequisites.every((prerequisite) => !/node(?:\.js)?/i.test(prerequisite)));
  for (const artifactId of ['aep-cli-binary', 'ess-cli-binary']) {
    const artifact = artifacts.get(artifactId);
    assert.match(artifact.note, /x86_64.*aarch64.*Linux GNU.*x86_64.*aarch64.*macOS/i);
    assert.match(artifact.note, /SHA256SUMS/);
    assert.match(artifact.note, /No Windows archive is published/i);
  }
  assert.equal(claude.artifactIds.filter((artifactId) => artifactId === 'aep-cli-binary').length, 1);
  assert.equal(claude.artifactIds.filter((artifactId) => artifactId === 'ess-cli-binary').length, 1);
  assert.match(claude.label, /Plan one governed change/i);
  assert.match(claude.outcome, /validated ESS model.*generated docs.*scoped.*critic-reviewed plan.*blocker.*evidence/is);
  assert.match(claude.outcome, /implementation remains optional and experimental/i);
  assert.doesNotMatch(claude.outcome, /reviewed change|implemented change|finished implementation/i);
});

test('golden search targets are first-class experiences or source-owned steps', async () => {
  const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
  const presentation = JSON.parse(await readFile(path.join(root, 'data', 'experience-pages.json'), 'utf8'));
  const golden = JSON.parse(await readFile(path.join(root, 'data', 'search-golden.json'), 'utf8'));
  const routes = experienceRoutes(catalog, presentation);
  assert.equal(golden.schema, 'b10x-search-golden/v1');
  assert.deepEqual(golden.queries.map((item) => item.query), [
    'spec driven development claude',
    'safe autonomous coding',
    'agent plugins install claude',
    'harness approvals',
    'deploy devcenter kubernetes',
  ]);
  assert.equal(golden.queries.at(-1).expectedFirst, '/operate/');
  for (const query of golden.queries) {
    assert.ok(routes.has(query.expectedFirst), `${query.expectedFirst} must be represented in an audience path`);
  }
});
