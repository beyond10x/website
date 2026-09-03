import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {access, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const chromeBinary = await findChrome();
const profile = await mkdtemp(path.join(os.tmpdir(), 'b10x-navigation-chrome-'));
const server = createServer((request, response) => void serveBuild(request, response));
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('could not bind navigation audit server');
const site = `http://127.0.0.1:${address.port}`;
const chrome = spawn(chromeBinary, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-address=127.0.0.1',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
let chromeErrors = '';
chrome.stderr.setEncoding('utf8');
chrome.stderr.on('data', (chunk) => { chromeErrors = `${chromeErrors}${chunk}`.slice(-8000); });
let client;

try {
  const port = await waitForDevtools(path.join(profile, 'DevToolsActivePort'));
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {method: 'PUT'});
  if (!response.ok) throw new Error(`Chrome target creation failed with ${response.status}`);
  const target = await response.json();
  client = await connectCdp(target.webSocketDebuggerUrl);
  await client.command('Page.enable');
  await client.command('Runtime.enable');

  await setViewport(client, {width: 1440, height: 1000, mobile: false});
  await navigate(client, `${site}/docs/#browse-by-technical-boundary`);
  const desktop = await evaluate(client, desktopSnapshot());
  assert.equal(desktop.position, 'sticky', 'desktop navbar must retain sticky positioning on docs pages');
  assert.ok(Number.parseInt(desktop.zIndex, 10) > 0, 'desktop navbar must establish a positive stacking layer');
  assert.ok(Math.abs(desktop.navbar.top) <= 1 && desktop.navbar.bottom >= 63, 'desktop navbar must remain at the viewport top after anchor scrolling');
  assert.deepEqual(desktop.labels.map((item) => item.label), ['Try', 'Learn', 'Build', 'Products', 'Docs', 'Search']);
  for (const label of desktop.labels) {
    assert.ok(label.visible, `${label.label} must be visible in the desktop navbar`);
    assert.ok(label.topmost, `${label.label} must not be occluded by the docs sidebar`);
  }
  assert.equal(desktop.sidebarLogo, false, 'docs sidebar must not render a competing navbar logo');
  assert.ok(desktop.sidebarTop >= desktop.navbar.bottom - 1, 'docs sidebar navigation must begin below the global navbar');
  await clickNavigationLink(client, 'nav[aria-label="Docs sidebar"]', 'Choose an outcome');
  await waitForPath(client, '/start/', 1440);

  await setViewport(client, {width: 390, height: 844, mobile: true});
  await navigate(client, `${site}/docs/`);
  const mobile = await evaluate(client, mobileSnapshot());
  assert.equal(mobile.position, 'sticky', 'mobile navbar must retain sticky positioning');
  assert.ok(Math.abs(mobile.navbar.top) <= 1, 'mobile navbar must remain at the viewport top');
  assert.ok(mobile.brandVisible, 'mobile brand must remain visible');
  assert.ok(mobile.toggle.visible && mobile.toggle.topmost, 'mobile navigation toggle must be visible and unobstructed');
  assert.ok(mobile.toggle.width >= 44 && mobile.toggle.height >= 44, 'mobile navigation toggle must meet the 44px touch target');

  await clickVisibleElement(client, '.navbar__toggle', 'mobile navigation toggle');
  await settle(client);
  const drawer = await evaluate(client, activeDrawerSnapshot());
  assert.ok(drawer.visible, 'mobile navigation drawer must be visible after opening');
  assert.ok(drawer.close.width >= 44 && drawer.close.height >= 44, 'mobile drawer close control must meet the 44px touch target');
  assert.equal(drawer.mode, 'docs', 'docs routes must open the visible contextual docs menu first');
  assert.equal(drawer.labels[0]?.label, 'Choose an outcome', 'the first visible docs item must return to the outcome chooser');
  assert.ok(drawer.labels.some((item) => item.label === 'Website internals'), 'the Website reference must be labelled as internals');
  assert.ok(drawer.labels.every((item) => item.label !== 'Start'), 'the Website reference must not masquerade as Start');
  assertVisibleLabels(drawer.labels, 390, 'mobile docs drawer');
  await clickNavigationLink(client, '.navbar-sidebar__item:not([inert])', 'Choose an outcome');
  await waitForPath(client, '/start/', 390);

  await navigate(client, `${site}/docs/`);
  await clickVisibleElement(client, '.navbar__toggle', 'mobile navigation toggle');
  await settle(client);
  await clickVisibleElement(client, '.navbar-sidebar__item:not([inert]) .navbar-sidebar__back', 'Back to main menu');
  await settle(client);
  const mobileGlobal = await evaluate(client, activeDrawerSnapshot());
  assert.equal(mobileGlobal.mode, 'global', 'Back to main menu must expose global navigation');
  assert.deepEqual(mobileGlobal.labels.map((item) => item.label), ['Try', 'Learn', 'Build', 'Products', 'Docs', 'Search', 'GitHub']);
  assertVisibleLabels(mobileGlobal.labels, 390, 'mobile global drawer');
  await clickNavigationLink(client, '.navbar-sidebar__item:not([inert])', 'Try');
  await waitForPath(client, '/start/', 390);

  const boundaryWidths = [995, 996, 997, 1000, 1050, 1099, 1100, 1101];
  for (const width of boundaryWidths) {
    await setViewport(client, {width, height: 844, mobile: false});
    await navigate(client, `${site}/docs/`);
    const state = await evaluate(client, responsiveNavigationSnapshot());
    assert.equal(state.position, 'sticky', `navbar must remain sticky at ${width}px`);
    assert.ok(Math.abs(state.navbar.top) <= 1, `navbar must remain at the viewport top at ${width}px`);

    if (width <= 996) {
      assert.ok(state.toggle.visible && state.toggle.topmost, `navigation toggle must be usable at ${width}px`);
      assert.ok(state.toggle.width >= 44 && state.toggle.height >= 44, `navigation toggle must meet the touch target at ${width}px`);
      assert.ok(state.labels.every((label) => !label.visible), `desktop navigation links must yield to the drawer at ${width}px`);
      await clickVisibleElement(client, '.navbar__toggle', `navigation toggle at ${width}px`);
      await settle(client);
      const responsiveDrawer = await evaluate(client, activeDrawerSnapshot());
      assert.ok(responsiveDrawer.visible, `navigation drawer must open at ${width}px`);
      assert.equal(responsiveDrawer.mode, 'docs', `docs submenu must be active at ${width}px`);
      assert.equal(responsiveDrawer.labels[0]?.label, 'Choose an outcome', `docs submenu must lead to the outcome chooser at ${width}px`);
      assertVisibleLabels(responsiveDrawer.labels, width, `docs drawer at ${width}px`);
      await clickVisibleElement(client, '.navbar-sidebar__item:not([inert]) .navbar-sidebar__back', `Back to main menu at ${width}px`);
      await settle(client);
      const responsiveGlobal = await evaluate(client, activeDrawerSnapshot());
      assert.equal(responsiveGlobal.mode, 'global', `Back to main menu must expose global links at ${width}px`);
      assert.deepEqual(responsiveGlobal.labels.map((item) => item.label), ['Try', 'Learn', 'Build', 'Products', 'Docs', 'Search', 'GitHub']);
      assertVisibleLabels(responsiveGlobal.labels, width, `global drawer at ${width}px`);
      await clickNavigationLink(client, '.navbar-sidebar__item:not([inert])', 'Try');
    } else {
      assert.equal(state.toggle.visible, false, `navigation toggle must be hidden when no drawer exists at ${width}px`);
      assert.deepEqual(state.labels.map((label) => label.label), ['Try', 'Learn', 'Build', 'Products', 'Docs', 'Search']);
      for (const label of state.labels) {
        assert.ok(label.visible, `${label.label} must be visible at ${width}px`);
        assert.ok(label.topmost, `${label.label} must be unobstructed at ${width}px`);
      }
      await clickNavigationLink(client, '.navbar__items:not(.navbar__items--right)', 'Try');
    }
    await waitForPath(client, '/start/', width);
  }

  process.stdout.write(`verified global navigation stacking, drawer behavior, and link activation on /docs/ at 1440×1000, 390×844, and ${boundaryWidths.join('/')}×844\n`);
} catch (error) {
  if (chromeErrors.trim()) error.message = `${error.message}\nChrome diagnostics:\n${chromeErrors.trim()}`;
  throw error;
} finally {
  client?.close();
  chrome.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(2000)]);
  if (chrome.exitCode === null) chrome.kill('SIGKILL');
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, {recursive: true, force: true});
}

async function serveBuild(request, response) {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relative || relative.endsWith('/')) relative = `${relative}index.html`;
    let file = path.resolve(build, relative);
    if (!file.startsWith(`${build}${path.sep}`)) throw new Error('path escapes build root');
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    } catch {
      if (!path.extname(relative)) file = path.resolve(build, relative, 'index.html');
    }
    const bytes = await readFile(file);
    response.writeHead(200, {'content-type': mediaType(file), 'cache-control': 'no-store'});
    response.end(bytes);
  } catch {
    response.writeHead(404, {'content-type': 'text/plain'});
    response.end('Not found');
  }
}

async function findChrome() {
  const candidates = [
    process.env.B10X_CHROME_BIN,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* try the next known binary */ }
  }
  throw new Error('navigation layout audit requires Chrome; set B10X_CHROME_BIN to its executable');
}

async function waitForDevtools(file) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited before exposing DevTools (${chrome.exitCode})`);
    try {
      const [port] = (await readFile(file, 'utf8')).trim().split(/\r?\n/);
      if (/^[0-9]+$/.test(port)) return Number(port);
    } catch { /* Chrome has not created the endpoint yet */ }
    await delay(50);
  }
  throw new Error('timed out waiting for Chrome DevTools endpoint');
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', () => reject(new Error('could not connect to Chrome DevTools')), {once: true});
  });
  let sequence = 0;
  const pending = new Map();
  const events = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
    if (message.id) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter?.resolve(message.result);
      return;
    }
    const waiter = events.get(message.method)?.shift();
    waiter?.(message.params);
  });
  return {
    command(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, {resolve, reject, method});
        socket.send(JSON.stringify({id, method, params}));
      });
    },
    event(method) {
      return new Promise((resolve) => {
        const waiters = events.get(method) ?? [];
        waiters.push(resolve);
        events.set(method, waiters);
      });
    },
    close() { socket.close(); },
  };
}

async function setViewport(cdp, {width, height, mobile}) {
  await cdp.command('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile});
}

async function navigate(cdp, url) {
  const loaded = cdp.event('Page.loadEventFired');
  const result = await cdp.command('Page.navigate', {url});
  if (result.errorText) throw new Error(`navigation to ${url} failed: ${result.errorText}`);
  await Promise.race([loaded, rejectAfter(10000, `timed out loading ${url}`)]);
  await settle(cdp);
}

async function settle(cdp) {
  await evaluate(cdp, 'new Promise((resolve) => setTimeout(resolve, 350))');
}

async function evaluate(cdp, expression) {
  const result = await cdp.command('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'browser evaluation failed');
  return result.result.value;
}

async function clickNavigationLink(cdp, scope, label) {
  const target = await evaluate(cdp, `(() => {
    const root = document.querySelector(${JSON.stringify(scope)});
    const link = [...(root?.querySelectorAll('a') ?? [])].find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)});
    if (!link) return null;
    const bounds = link.getBoundingClientRect();
    const hit = bounds.width > 0 && bounds.height > 0
      ? document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : null;
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
      visible: bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.top < innerHeight
        && getComputedStyle(link).visibility !== 'hidden',
      topmost: Boolean(hit && (hit === link || link.contains(hit))),
    };
  })()`);
  assert.ok(target?.visible, `${label} must intersect the viewport in ${scope}`);
  assert.ok(target.topmost, `${label} must be the topmost pointer target in ${scope}`);
  await dispatchPointerClick(cdp, target);
}

async function clickVisibleElement(cdp, selector, context) {
  const target = await evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    const hit = bounds.width > 0 && bounds.height > 0
      ? document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : null;
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
      visible: bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.top < innerHeight
        && getComputedStyle(element).visibility !== 'hidden',
      topmost: Boolean(hit && (hit === element || element.contains(hit))),
    };
  })()`);
  assert.ok(target?.visible, `${context} must intersect the viewport`);
  assert.ok(target.topmost, `${context} must be the topmost pointer target`);
  await dispatchPointerClick(cdp, target);
}

async function dispatchPointerClick(cdp, {x, y}) {
  await cdp.command('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
  await cdp.command('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
  await cdp.command('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
}

function assertVisibleLabels(labels, width, context) {
  assert.ok(labels.length > 0, `${context} must contain links`);
  for (const label of labels) {
    assert.ok(label.visible, `${label.label} must intersect the ${width}px viewport in ${context}`);
    assert.ok(label.topmost, `${label.label} must be an unobstructed pointer target in ${context}`);
  }
}

async function waitForPath(cdp, expected, width) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pathname = await evaluate(cdp, 'window.location.pathname');
      if (pathname === expected) return;
    } catch {
      // A full-page navigation can briefly replace the execution context.
    }
    await delay(50);
  }
  throw new Error(`navigation link did not reach ${expected} at ${width}px`);
}

function mediaType(file) {
  return ({
    '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.xml': 'application/xml',
  })[path.extname(file)] ?? 'application/octet-stream';
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function rejectAfter(milliseconds, message) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds));
}

function desktopSnapshot() {
  return `(() => {
  const navbar = document.querySelector('nav.navbar');
  const rect = navbar.getBoundingClientRect();
  const style = getComputedStyle(navbar);
  const visible = (element) => {
    const bounds = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return {
      label: element.textContent.trim(),
      visible: bounds.width > 0 && bounds.height > 0 && computed.display !== 'none' && computed.visibility !== 'hidden',
      topmost: Boolean(hit && (element === hit || element.contains(hit))),
    };
  };
  const sidebar = document.querySelector('nav[aria-label="Docs sidebar"]');
  return {
    position: style.position,
    zIndex: style.zIndex,
    navbar: {top: rect.top, bottom: rect.bottom},
    labels: [...document.querySelectorAll('.navbar__items:not(.navbar__items--right) a.navbar__link')].map(visible),
    sidebarLogo: Boolean(document.querySelector('[class*="sidebarLogo"]')),
    sidebarTop: sidebar?.getBoundingClientRect().top ?? -1,
  };
})()`;
}

function mobileSnapshot() {
  return `(() => {
  const navbar = document.querySelector('nav.navbar');
  const navRect = navbar.getBoundingClientRect();
  const toggle = document.querySelector('.navbar__toggle');
  const toggleRect = toggle.getBoundingClientRect();
  const hit = document.elementFromPoint(toggleRect.left + toggleRect.width / 2, toggleRect.top + toggleRect.height / 2);
  const toggleStyle = getComputedStyle(toggle);
  const brand = document.querySelector('.navbar__brand');
  const brandRect = brand.getBoundingClientRect();
  return {
    position: getComputedStyle(navbar).position,
    navbar: {top: navRect.top, bottom: navRect.bottom},
    brandVisible: brandRect.width > 0 && brandRect.height > 0,
    toggle: {
      width: toggleRect.width,
      height: toggleRect.height,
      visible: toggleStyle.display !== 'none' && toggleStyle.visibility !== 'hidden' && toggleRect.width > 0,
      topmost: Boolean(hit && (toggle === hit || toggle.contains(hit))),
    },
  };
})()`;
}

function responsiveNavigationSnapshot() {
  return `(() => {
  const navbar = document.querySelector('nav.navbar');
  const navRect = navbar.getBoundingClientRect();
  const toggle = document.querySelector('.navbar__toggle');
  const toggleRect = toggle.getBoundingClientRect();
  const toggleStyle = getComputedStyle(toggle);
  const toggleHit = toggleRect.width > 0 && toggleRect.height > 0
    ? document.elementFromPoint(toggleRect.left + toggleRect.width / 2, toggleRect.top + toggleRect.height / 2)
    : null;
  const visible = (element) => {
    const bounds = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const hit = bounds.width > 0 && bounds.height > 0
      ? document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : null;
    return {
      label: element.textContent.trim(),
      visible: bounds.width > 0 && bounds.height > 0 && computed.display !== 'none' && computed.visibility !== 'hidden',
      topmost: Boolean(hit && (element === hit || element.contains(hit))),
    };
  };
  return {
    position: getComputedStyle(navbar).position,
    navbar: {top: navRect.top, bottom: navRect.bottom},
    toggle: {
      width: toggleRect.width,
      height: toggleRect.height,
      visible: toggleStyle.display !== 'none' && toggleStyle.visibility !== 'hidden' && toggleRect.width > 0 && toggleRect.height > 0,
      topmost: Boolean(toggleHit && (toggle === toggleHit || toggle.contains(toggleHit))),
    },
    labels: [...document.querySelectorAll('.navbar__items:not(.navbar__items--right) a.navbar__link')].map(visible),
  };
})()`;
}

function activeDrawerSnapshot() {
  return `(() => {
  const drawer = document.querySelector('.navbar-sidebar');
  const rect = drawer.getBoundingClientRect();
  const style = getComputedStyle(drawer);
  const close = drawer.querySelector('.navbar-sidebar__close').getBoundingClientRect();
  const active = [...drawer.querySelectorAll('.navbar-sidebar__item')].find((panel) => !panel.inert);
  const visible = (element) => {
    const bounds = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    const hit = bounds.width > 0 && bounds.height > 0
      ? document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      : null;
    return {
      label: element.textContent.trim(),
      visible: bounds.width > 0 && bounds.height > 0 && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.top < innerHeight
        && computed.display !== 'none' && computed.visibility !== 'hidden',
      topmost: Boolean(hit && (hit === element || element.contains(hit))),
    };
  };
  return {
    visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden',
    mode: active?.querySelector('.navbar-sidebar__back') ? 'docs' : 'global',
    labels: [...(active?.querySelectorAll('a') ?? [])].map(visible),
    close: {width: close.width, height: close.height},
  };
})()`;
}
