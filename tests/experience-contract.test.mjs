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
  assert.equal(result.experienceCount, 5);
  assert.equal(result.routeCount, 5);
  assert.ok(result.stepCount >= 20);
  assert.deepEqual(presentation.pages.map((page) => [page.experienceId, page.route, page.navigationLabel, page.primaryStepId]), [
    ['try-spec-driven-development', '/start/spec-driven-development/', 'Try spec-driven development', 'install-agent-plugins'],
    ['understand-safe-agentic-coding', '/learn/safe-agentic-coding/', 'Learn safe agentic coding', 'safe-loop'],
    ['build-agent-systems', '/build/agent-systems/', 'Build agent systems', 'run-harness'],
    ['deploy-operate-products', '/operate/', 'Operate services', 'inspect-service-map'],
    ['contribute-maintain', '/contribute/', 'Contribute documentation', 'docs-system-contract'],
  ]);
  for (const page of presentation.pages) {
    const primaryStep = page.sections.flatMap((section) => section.steps).find((step) => step.id === page.primaryStepId);
    assert.ok(primaryStep, `${page.experienceId} primary step must exist`);
    assert.notEqual(primaryStep.url, page.route, `${page.experienceId} primary step must not loop to its own page`);
  }
  assert.equal(catalog.artifacts.length, 15);
  const evaluated = evaluateExperienceCatalog(catalog);
  const evaluatedById = new Map(evaluated.map((experience) => [experience.id, experience]));
  const primaryPaths = presentation.pages.map((page) => evaluatedById.get(page.experienceId).adoptionPaths.find((path) => path.id === page.adoptionPathId));
  assert.ok(primaryPaths.every((path) => path.actionable && path.effectiveAccess === 'public'));
  assert.ok(evaluated.every((experience) => experience.adoptionPaths.some((path) => path.actionable)));
  assert.deepEqual(primaryPaths.map((path) => path.support), [
    'experimental', 'supported', 'experimental', 'experimental', 'supported',
  ]);
});

test('production deployment stays in the operator experience', async () => {
  const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
  const operations = evaluateExperienceCatalog(catalog).find((experience) => experience.id === 'deploy-operate-products');
  assert.deepEqual(operations.audiences, ['operator']);
  assert.deepEqual(operations.adoptionPaths.map((path) => path.id), ['public-source-service']);
  assert.ok(catalog.artifacts.every((artifact) => !artifact.id.startsWith('agentide-')));
});

test('the Claude practitioner path pins its actual plugin and CLI releases', async () => {
  const catalog = await readExperienceCatalog(path.join(root, 'data', 'experiences.json'));
  const artifacts = new Map(catalog.artifacts.map((artifact) => [artifact.id, artifact]));
  assert.deepEqual(
    ['agentplugins-release-source', 'aep-cli-binary', 'ess-cli-source'].map((id) => {
      const artifact = artifacts.get(id);
      return [id, artifact.kind, artifact.version, artifact.url, artifact.availability, artifact.access];
    }),
    [
      ['agentplugins-release-source', 'source', '0.9.0', 'https://github.com/beyond10x/agentplugins/releases/tag/0.9.0', 'available', 'public'],
      ['aep-cli-binary', 'binary', '0.55.0', 'https://github.com/beyond10x/aep/releases/tag/0.55.0', 'available', 'public'],
      ['ess-cli-source', 'source', '0.22.0', 'https://github.com/beyond10x/ess/releases/tag/0.22.0', 'available', 'public'],
    ],
  );
  const claude = catalog.experiences.find((experience) => experience.id === 'try-spec-driven-development').adoptionPaths.find((path) => path.id === 'claude-code');
  for (const artifactId of ['agentplugins-release-source', 'aep-cli-binary', 'ess-cli-source']) {
    assert.ok(claude.artifactIds.includes(artifactId));
  }
  assert.deepEqual(claude.prerequisites, [
    'A Git repository',
    'Claude Code',
    'AEP 0.55.0 on PATH for a supported Linux or macOS target',
    'Rust to build ESS 0.22.0 from its source tag, with ess on PATH',
  ]);
  assert.ok(claude.prerequisites.every((prerequisite) => !/node(?:\.js)?/i.test(prerequisite)));
  for (const artifactId of ['aep-cli-binary']) {
    const artifact = artifacts.get(artifactId);
    assert.match(artifact.note, /x86_64.*aarch64.*Linux GNU.*x86_64.*aarch64.*macOS/i);
    assert.match(artifact.note, /SHA256SUMS/);
    assert.match(artifact.note, /No Windows archive is published/i);
  }
  assert.equal(claude.artifactIds.filter((artifactId) => artifactId === 'aep-cli-binary').length, 1);
  assert.equal(claude.artifactIds.filter((artifactId) => artifactId === 'ess-cli-source').length, 1);
  assert.match(artifacts.get('ess-cli-source').note, /source only.*no prebuilt CLI archives/i);
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
    'operate service deployment',
  ]);
  assert.equal(golden.queries.at(-1).expectedFirst, '/operate/');
  for (const query of golden.queries) {
    assert.ok(routes.has(query.expectedFirst), `${query.expectedFirst} must be represented in an audience path`);
  }
});
