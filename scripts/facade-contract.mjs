export function facadeRepositories(roster) {
  return [...new Set([...roster.repositories, ...(roster.compatibilityRepositories ?? [])])].sort();
}

export function synthesizeFacadeRoutes(repository, input, rootRoutes) {
  const routes = [...input];
  const profile = rootRoutes.has(`/ecosystem/${repository}/`) ? `/ecosystem/${repository}/` : '/ecosystem/';
  const documentation = rootRoutes.has(`/docs/${repository}/`) ? `/docs/${repository}/` : '/';
  if (!routes.some((redirect) => redirect.from === '/')) {
    routes.push({from: '/', to: profile, type: 'html'});
  }
  if (!routes.some((redirect) => redirect.from === '/docs' || redirect.from === '/docs/')) {
    routes.push({from: '/docs/', to: documentation, type: 'html'});
  }
  if (!routes.some((redirect) => redirect.from === '/ecosystem' || redirect.from === '/ecosystem/')) {
    routes.push({from: '/ecosystem/', to: profile, type: 'html'});
  }
  for (const redirect of routes.filter((candidate) => candidate.type === 'html')) {
    if (!rootRoutes.has(redirect.to)) throw new Error(`${repository} façade target ${redirect.to} is absent from root provenance`);
  }
  return routes.sort((left, right) => left.from.localeCompare(right.from));
}
