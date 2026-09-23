import numberPrefix from '@docusaurus/plugin-content-docs/lib/numberPrefix.js';
import {compareUtf8} from './order-contract.mjs';
import familyTaxonomy from '../data/ecosystem-families.json' with {type: 'json'};

export const documentationFamilyOrder = familyTaxonomy.families.map((family) => family.id);
export const documentationFamilies = familyTaxonomy.families.map((family) => ({
  id: family.id,
  label: family.label,
  slug: family.slug,
  description: family.purpose,
  docId: `families/${family.slug.replace(/^\/+|\/+$/g, '')}`,
}));

// Counted over the published manifests only. A quarantined source's manifest is not an input, so its
// family cannot be read; each quarantined source can have emptied at most one family, and that bound
// is what is enforced. An emptied family has no sidebar category (`renderSidebars` groups only the
// published registry); its authored landing page is still generated. Each family's authored start
// repository must be a published member of that family unless it is quarantined, which is the
// condition the family components otherwise fail on at render time.
export function assertDocumentationFamilyDistribution(sourceManifests, {quarantined = []} = {}) {
  const navigation = navigationByRepository(sourceManifests);
  const counts = Object.fromEntries(documentationFamilyOrder.map((family) => [family, 0]));
  for (const [repository, declared] of navigation) {
    if (repository === 'website') continue;
    if (!(declared.group in counts)) {
      throw new Error(`${repository} declares unknown documentation family ${declared.group ?? '<none>'}`);
    }
    counts[declared.group] += 1;
  }
  const empty = documentationFamilies.filter((family) => counts[family.id] === 0);
  if (quarantined.length === 0 && empty.length > 0) {
    throw new Error(`${empty[0].id} documentation family has no public repositories`);
  }
  if (empty.length > quarantined.length) {
    throw new Error(`${empty.length} documentation families have no public repositories, more than the ${quarantined.length} quarantined source${quarantined.length === 1 ? '' : 's'} could have emptied`);
  }
  for (const family of familyTaxonomy.families) {
    if (quarantined.includes(family.startRepository)) continue;
    if (navigation.get(family.startRepository)?.group !== family.id) {
      throw new Error(`${family.id} start ${family.startRepository} is not a published member of ${family.id}`);
    }
  }
  return counts;
}

export function renderSidebars(ecosystemRegistry, sourceManifests) {
  const navigation = navigationByRepository(sourceManifests);
  const declaredTrees = declaredSidebarItemsByRepository(sourceManifests);
  const repositories = [...new Set(ecosystemRegistry.surfaces.map((surface) => surface.repository.id))]
    .map((repository) => {
      const surface = ecosystemRegistry.surfaces.find((candidate) => candidate.repository.id === repository);
      const declared = navigation.get(repository) ?? {};
      return {
        repository,
        label: declared.label ?? surface.name,
        group: declared.group ?? (surface.kind === 'front-door' ? undefined : 'Projects'),
        frontDoor: surface.kind === 'front-door',
        order: Number.isFinite(declared.order) ? declared.order : 100,
      };
    });
  const expected = new Set(repositories.map((item) => item.repository));
  const frontDoors = repositories.filter((repository) => repository.frontDoor);
  if (frontDoors.length > 1) throw new Error('sidebar projection declares more than one front door');
  const groupedRepositories = repositories.filter((repository) => !repository.frontDoor);

  const groups = new Map();
  for (const repository of groupedRepositories) {
    if (!groups.has(repository.group)) groups.set(repository.group, []);
    groups.get(repository.group).push(repository);
  }
  const known = new Map(documentationFamilies.map((family, index) => [family.id, {...family, order: index}]));
  const families = [...groups].map(([id, members]) => ({
    ...(known.get(id) ?? {
      id,
      label: id,
      slug: `/groups/${slug(id)}/`,
      description: `${id} documentation from locked public repositories.`,
      order: documentationFamilies.length,
    }),
    members: members.sort((left, right) => left.order - right.order || compareUtf8(left.label, right.label) || compareUtf8(left.repository, right.repository)),
  })).sort((left, right) => left.order - right.order || compareUtf8(left.label, right.label));

  const emitted = [...frontDoors.map((repository) => repository.repository), ...families.flatMap((family) => family.members.map((member) => member.repository))];
  if (emitted.length !== expected.size || emitted.some((repository) => !expected.has(repository))) {
    throw new Error('sidebar family projection does not cover the public registry exactly once');
  }
  const overview = [
    {type: 'link', label: 'Start by outcome', href: '/start/'},
    {type: 'doc', id: 'index', label: 'Technical documentation'},
    ...families.map((family) => ({
      type: 'category',
      label: family.label,
      collapsed: true,
      link: family.docId
        ? {type: 'doc', id: family.docId}
        : {type: 'generated-index', slug: family.slug, title: family.label, description: family.description},
      items: family.members.map((item) => ({
        type: 'link',
        label: item.label,
        href: `/docs/${item.repository}/`,
      })),
    })),
    ...frontDoors.map((item) => ({
      type: 'link',
      label: item.repository === 'website' ? 'About this documentation site' : item.label,
      href: `/docs/${item.repository}/`,
    })),
  ];
  const projectSidebars = Object.fromEntries(
    repositories
      .sort((left, right) => compareUtf8(left.repository, right.repository))
      .map((item) => [
        `project_${item.repository.replaceAll('-', '_')}`,
        [
          {type: 'link', label: 'Start by outcome', href: '/start/'},
          {type: 'link', label: 'All technical docs', href: '/docs/'},
          {
            type: 'category',
            label: item.repository === 'website' ? 'Website internals' : item.label,
            collapsed: false,
            link: {type: 'doc', id: `${item.repository}/index`},
            items: declaredTrees.get(item.repository) ?? [{type: 'autogenerated', dirName: item.repository}],
          },
        ],
      ]),
  );
  return `module.exports = ${JSON.stringify({docs: overview, ...projectSidebars}, null, 2)};\n`;
}

export function sourceSidebarMetadata(frontmatter, fallbackLabel) {
  const declaredLabel = frontmatter.sidebar_label;
  const label = typeof declaredLabel === 'string' && declaredLabel.trim()
    ? declaredLabel.trim()
    : fallbackLabel;
  const declaredPosition = frontmatter.sidebar_position;
  if (declaredPosition === undefined || declaredPosition === null) return {label};
  if (typeof declaredPosition !== 'number' || !Number.isSafeInteger(declaredPosition)) {
    throw new Error('sidebar_position must be a safe YAML integer');
  }
  return {label, position: declaredPosition};
}

/**
 * The route a published document is served at, from its path relative to its surface's
 * `source.root`: beneath the surface's route base, or the route base itself for the document the
 * surface declares as its landing.
 */
export function declaredDocumentRoute(surface, relative) {
  const base = surface.routeBase.replace(/^\/docs\//, '').replace(/^\/+|\/+$/g, '');
  const leaf = relative === surface.source?.navigation?.landing
    ? ''
    : normalizeDocumentRelative(relative).replace(/\.(?:md|mdx)$/i, '').replace(/(?:^|\/)index$/i, '');
  return `/docs/${[base, leaf].filter(Boolean).join('/')}/`.replace(/\/+/g, '/');
}

/**
 * The id Docusaurus assigns the file `prepare-site.mjs` writes for a route (`<route>/index.md`):
 * its directory with number prefixes stripped, then `index`.
 */
export function documentIdForRoute(route) {
  const directory = route.replace(/^\/docs\/?/, '').replace(/\/$/, '');
  return [numberPrefix.stripPathNumberPrefixes(directory, numberPrefix.DefaultNumberPrefixParser), 'index'].filter(Boolean).join('/');
}

/** A collected document's path relative to its surface's `source.root` (the collector's outputPath tail). */
export function documentSourceRelative(file) {
  return file.outputPath.split('/').slice(3).join('/');
}

/**
 * Whether a document is menu-withheld. It keeps its route (its slug) but is written under
 * `menu.withheld/`, outside `docs/<repo>/`, the directory an autogenerated sidebar enumerates;
 * `menu.withheld` cannot be a repository id. The document at the route base is never withheld:
 * `declaredNavigationRefusals` refuses it.
 */
export function isMenuWithheld(surface, relative) {
  return (surface?.source?.navigation?.menuWithheld ?? []).includes(relative);
}

/** The generated page, relative to `.generated/docs/`, that a document served at `route` becomes. */
export function documentPagePath(route, sourcePath, {withheld = false} = {}) {
  const relativeRoute = route.replace(/^\/docs\//, '').replace(/\/$/, '');
  const extension = /\.mdx$/i.test(sourcePath) ? '.mdx' : '.md';
  return [...(withheld ? ['menu.withheld'] : []), ...relativeRoute.split('/').filter(Boolean), `index${extension}`].join('/');
}

/**
 * Every refusal the portal makes on one source's route base and declared navigation, over the
 * documents collected for it. `prepare-site.mjs` fails on any of them; the source preview
 * (`source-preview-checks.mjs`) reports the same list.
 *
 * - A document surface's routeBase lies at or below `/docs/<repository id>/`, whatever the manifest
 *   revision, so its pages and doc ids stay in its own namespace. The Website's own `/` surface is
 *   the one exception.
 * - Every declared sidebar leaf, landing and menu-withheld path names a document that was collected
 *   for that surface; a leaf without one would name a doc id Docusaurus does not have.
 * - A declared landing and another document of the surface cannot both serve the landing's route.
 * - The document at the route base (the landing, or an index, README or intro) is the project
 *   sidebar's own category link and cannot be menu-withheld.
 */
export function declaredNavigationRefusals(manifest, documents) {
  const repository = manifest.repository.id;
  const refusals = [];
  for (const surface of manifest.surfaces) {
    const own = documents.filter((file) => file.surface === surface.id);
    const where = `${repository}/${surface.id}`;
    if (!(repository === 'website' && surface.routeBase === '/') && (surface.source?.documents || own.length > 0)
      && !String(surface.routeBase).startsWith(`/docs/${repository}/`)) {
      refusals.push(`${where} routeBase ${surface.routeBase} is not at or below /docs/${repository}/`);
      continue;
    }
    const navigation = surface.source?.navigation;
    if (!navigation) continue;
    const collected = new Set(own.map(documentSourceRelative));
    const declared = [
      ...(Array.isArray(navigation.sidebar) ? sidebarLeaves(navigation.sidebar).map((leaf) => ['sidebar leaf', leaf]) : []),
      ...(navigation.landing === undefined ? [] : [['landing', navigation.landing]]),
      ...(navigation.menuWithheld ?? []).map((leaf) => ['menu-withheld document', leaf]),
    ];
    for (const [kind, leaf] of declared) {
      if (!collected.has(leaf)) refusals.push(`${where} ${kind} ${leaf} is not a collected document`);
    }
    const baseRoute = declaredDocumentRoute(surface, '');
    for (const leaf of navigation.menuWithheld ?? []) {
      if (declaredDocumentRoute(surface, leaf) === baseRoute) {
        refusals.push(`${where} menu-withheld document ${leaf} serves the route base ${baseRoute}, which cannot be withheld`);
      }
    }
    if (navigation.landing === undefined) continue;
    const landingRoute = declaredDocumentRoute(surface, navigation.landing);
    for (const file of own) {
      if (documentSourceRelative(file) === navigation.landing) continue;
      if (declaredDocumentRoute(surface, documentSourceRelative(file)) === landingRoute) {
        refusals.push(`${where} landing ${navigation.landing} and ${file.sourcePath} both serve ${landingRoute}`);
      }
    }
  }
  return refusals;
}

function sidebarLeaves(items) {
  return items.flatMap((item) => (typeof item === 'string' ? [item] : sidebarLeaves(item.items)));
}

function normalizeDocumentRelative(relative) {
  let value = relative.replace(/^website\/docs\//, '').replace(/^docs\//, '');
  value = value.replace(/(^|\/)(?:README|index|intro)\.(?:md|mdx)$/i, '$1index.md');
  return value;
}

// A v5 surface's declared tree, as items of its repository's one project sidebar. A repository
// that declares none is absent and keeps the autogenerated entry. Menu-withheld documents are never
// leaves: Docs System refuses a manifest that lists one in the tree.
function declaredSidebarItemsByRepository(sourceManifests) {
  const declared = new Map();
  for (const manifest of sourceManifests) {
    for (const surface of manifest.surfaces) {
      const sidebar = surface.source?.navigation?.sidebar;
      if (!Array.isArray(sidebar)) continue;
      const items = declared.get(manifest.repository.id) ?? [];
      items.push(...sidebar.map((item) => declaredSidebarItem(surface, item)));
      declared.set(manifest.repository.id, items);
    }
  }
  return declared;
}

function declaredSidebarItem(surface, item) {
  if (typeof item === 'string') return {type: 'doc', id: documentIdForRoute(declaredDocumentRoute(surface, item))};
  return {
    type: 'category',
    label: item.label,
    ...(item.collapsed === undefined ? {} : {collapsed: item.collapsed}),
    items: item.items.map((child) => declaredSidebarItem(surface, child)),
  };
}

function navigationByRepository(sourceManifests) {
  const navigation = new Map();
  for (const manifest of sourceManifests) {
    for (const surface of manifest.surfaces) {
      const declared = surface.source?.navigation;
      if (!declared) continue;
      const current = navigation.get(manifest.repository.id);
      if (current?.group && declared.group && current.group !== declared.group) {
        throw new Error(`${manifest.repository.id} declares conflicting documentation groups`);
      }
      navigation.set(manifest.repository.id, {...current, ...declared});
    }
  }
  return navigation;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'other';
}
