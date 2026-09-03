const sectionOrder = ['learn', 'do', 'verify'];
const canonicalOrigin = 'https://beyond10x.github.io';

export function validateExperiencePresentation(catalog, presentation) {
  if (catalog?.schema !== 'b10x-experiences/v1' || !Array.isArray(catalog.artifacts) || !Array.isArray(catalog.experiences)) {
    throw new Error('experience catalog must use the Docs System b10x-experiences/v1 shape');
  }
  if (presentation?.schema !== 'b10x-website-experience-pages/v1' || !Array.isArray(presentation.pages)) {
    throw new Error('experience presentation must use b10x-website-experience-pages/v1');
  }
  const identifiers = new Set();
  const routes = new Set();
  const stepIdentifiers = new Set();
  const experienceById = new Map(catalog.experiences.map((experience) => [experience.id, experience]));
  if (experienceById.size !== catalog.experiences.length) throw new Error('experience identifiers must be unique');

  for (const page of presentation.pages) {
    assertIdentifier(page.experienceId, 'experience page id');
    if (identifiers.has(page.experienceId)) throw new Error(`duplicate experience page ${page.experienceId}`);
    identifiers.add(page.experienceId);
    const experience = experienceById.get(page.experienceId);
    if (!experience) throw new Error(`experience page ${page.experienceId} has no canonical catalog entry`);
    assertIdentifier(page.adoptionPathId, `${page.experienceId} primary adoption path id`);
    const pathIds = new Set();
    for (const path of experience.adoptionPaths) {
      assertIdentifier(path.id, `${page.experienceId} adoption path id`);
      if (pathIds.has(path.id)) throw new Error(`${page.experienceId} contains duplicate adoption path ${path.id}`);
      pathIds.add(path.id);
      if (path.url) websiteRoute(path.url, `${page.experienceId}/${path.id}`);
    }
    const adoptionPath = experience.adoptionPaths.find((path) => path.id === page.adoptionPathId);
    if (!adoptionPath) throw new Error(`${page.experienceId} has no primary adoption path ${page.adoptionPathId}`);
    assertIdentifier(page.primaryStepId, `${page.experienceId} primary step id`);
    assertRoute(page.route, `${page.experienceId} page route`);
    const route = page.route;
    if (routes.has(route)) throw new Error(`duplicate experience route ${route}`);
    routes.add(route);
    if (typeof page.navigationLabel !== 'string' || !page.navigationLabel.trim() || page.navigationLabel.length > 80) {
      throw new Error(`${page.experienceId} must declare a concise navigation label`);
    }
    if (!adoptionPath.outcome || adoptionPath.outcome.length < 40) throw new Error(`${page.experienceId} must define a concrete outcome`);
    if (!Number.isInteger(adoptionPath.estimatedMinutes) || adoptionPath.estimatedMinutes < 1) throw new Error(`${page.experienceId} must define a positive estimate`);
    if (JSON.stringify(page.sections?.map((section) => section.kind)) !== JSON.stringify(sectionOrder)) {
      throw new Error(`${page.experienceId} sections must be ordered learn, do, verify`);
    }
    let primaryStep;
    for (const section of page.sections) {
      if (!section.title || !Array.isArray(section.steps) || section.steps.length === 0) throw new Error(`${page.experienceId}/${section.kind} must contain steps`);
      for (const step of section.steps) {
        assertIdentifier(step.id, `${page.experienceId} step id`);
        const key = `${page.experienceId}/${step.id}`;
        if (stepIdentifiers.has(key)) throw new Error(`duplicate experience step ${key}`);
        stepIdentifiers.add(key);
        assertRoute(step.url, `${key} URL`, {allowFragment: true});
        if (!step.completion || step.completion.length < 30) throw new Error(`${key} must state when it is complete`);
        if (step.id === page.primaryStepId) primaryStep = step;
      }
    }
    if (!primaryStep) throw new Error(`${page.experienceId} has no primary step ${page.primaryStepId}`);
    if (primaryStep.url === page.route) throw new Error(`${page.experienceId} primary step must not link back to its own page`);
  }
  if (identifiers.size !== experienceById.size || [...experienceById.keys()].some((id) => !identifiers.has(id))) {
    throw new Error('canonical experiences and Website experience pages must have exact identifier parity');
  }
  return {experienceCount: identifiers.size, routeCount: routes.size, stepCount: stepIdentifiers.size};
}

export function experienceRoutes(catalog, presentation) {
  const routes = new Set(catalog.experiences.flatMap((experience) => experience.adoptionPaths
    .filter((path) => path.url)
    .map((path) => websiteRoute(path.url, `${experience.id}/${path.id}`))));
  for (const page of presentation.pages) {
    assertRoute(page.route, `${page.experienceId} page route`);
    routes.add(page.route);
    for (const section of page.sections) {
      for (const step of section.steps) {
        if (step.url.startsWith('/')) routes.add(step.url);
      }
    }
  }
  return routes;
}

function websiteRoute(value, context) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${context} must declare an absolute adoption URL`); }
  if (url.origin !== canonicalOrigin || url.search || url.hash) throw new Error(`${context} must use a canonical Website route`);
  assertRoute(url.pathname, `${context} URL`);
  return url.pathname;
}

function assertIdentifier(value, context) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value ?? '')) throw new Error(`${context} must be a lowercase kebab-case identifier`);
}

function assertRoute(value, context, {allowFragment = false} = {}) {
  if (allowFragment && /^#[a-z][a-z0-9-]*$/.test(value ?? '')) return;
  if (!/^\/(?:[a-z0-9._-]+\/)*$/.test(value ?? '')) throw new Error(`${context} must be a canonical root-relative route`);
}
