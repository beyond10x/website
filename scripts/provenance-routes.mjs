export function routesFromFiles(files) {
  return files
    .map((file) => typeof file === 'string' ? file : file.path)
    .filter((file) => file.endsWith('.html') && file !== '404.html')
    .map((file) => file === 'index.html' ? '/' : file.endsWith('/index.html') ? `/${file.slice(0, -'index.html'.length)}` : `/${file}`)
    .sort();
}
