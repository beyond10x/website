import {assertPortableRelativePath} from './order-contract.mjs';

export function effectiveRedirectMap(declared, {routes, files}) {
  if (declared?.schema !== 'b10x-redirects/v1' || declared.origin !== 'https://beyond10x.github.io' || !Array.isArray(declared.redirects)) {
    throw new Error('legacy redirect contract is invalid');
  }
  const routeSet = new Set(routes);
  const fileSet = new Set(files.map((file) => typeof file === 'string' ? file : file.path));
  const seen = new Set();
  const redirects = declared.redirects.map((redirect) => {
    assertWebPath(redirect.from, 'legacy redirect source');
    if (seen.has(redirect.from)) throw new Error(`duplicate legacy redirect ${redirect.from}`);
    seen.add(redirect.from);
    if (redirect.type === 'alias') {
      assertPortableRelativePath(redirect.source, `legacy alias ${redirect.from}`);
      if (!fileSet.has(redirect.source)) throw new Error(`legacy alias source /${redirect.source} is absent from the root artifact`);
      return redirect;
    }
    if (redirect.type !== 'html') throw new Error(`legacy redirect ${redirect.from} has unsupported type ${String(redirect.type)}`);
    assertWebPath(redirect.to, `legacy redirect target ${redirect.from}`);
    return {...redirect, to: nearestRoute(redirect.to, redirect.from, routeSet)};
  });
  return {...declared, redirects};
}

function nearestRoute(requested, legacySource, routes) {
  let candidate = normalizeRoute(requested);
  if (routes.has(candidate)) return candidate;
  while (candidate !== '/') {
    candidate = normalizeRoute(candidate.replace(/[^/]+\/$/, ''));
    if (routes.has(candidate)) return candidate;
  }
  const repository = legacySource.split('/').filter(Boolean)[0];
  for (const fallback of [`/docs/${repository}/`, `/ecosystem/${repository}/`, '/']) {
    if (routes.has(fallback)) return fallback;
  }
  throw new Error(`${legacySource} has no truthful built fallback for ${requested}`);
}

function normalizeRoute(value) {
  const route = `/${value.replace(/^\/+|\/+$/g, '')}/`.replace(/\/+/g, '/');
  return route === '//' ? '/' : route;
}

function assertWebPath(value, label) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\') || (value !== '/' && value.includes('//')) || /%(?:2e|2f|5c)/i.test(value) || /\p{Cc}/u.test(value) || /[?#]/.test(value)) {
    throw new Error(`${label} is not a safe rooted path: ${String(value)}`);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error(`${label} contains traversal: ${value}`);
  }
  if (segments.some((segment) => ['.git', '.gitattributes', '.gitignore'].includes(segment.toLowerCase()))) {
    throw new Error(`${label} contains forbidden Git metadata: ${value}`);
  }
  return value;
}
