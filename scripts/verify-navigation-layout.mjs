import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {access, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const build = path.join(root, 'build');
const chromeStartupTimeoutMs = 30_000;
const chromeStartupPollMs = 50;
const navigationPathTimeoutMs = 15_000;
const navigationPathPollMs = 50;
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
const siteOrigin = new URL(site).origin;
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
const chromeClosed = new Promise((resolve) => chrome.once('close', resolve));
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

  await verifyLocalAnchorPresentation(client, site);

  await setViewport(client, {width: 1440, height: 1000, mobile: false});
  await navigate(client, `${site}/docs/#browse-by-technical-boundary`);
  const desktop = await evaluate(client, desktopSnapshot());
  assert.equal(desktop.position, 'sticky', 'desktop navbar must retain sticky positioning on docs pages');
  assert.ok(Number.parseInt(desktop.zIndex, 10) > 0, 'desktop navbar must establish a positive stacking layer');
  assert.ok(Math.abs(desktop.navbar.top) <= 1 && desktop.navbar.bottom >= 63, 'desktop navbar must remain at the viewport top after anchor scrolling');
  assert.deepEqual(desktop.labels.map((item) => item.label), ['Start', 'Explore', 'Docs', 'Updates', 'Search']);
  for (const label of desktop.labels) {
    assert.ok(label.visible, `${label.label} must be visible in the desktop navbar`);
    assert.ok(label.topmost, `${label.label} must not be occluded by the docs sidebar`);
  }
  assert.equal(desktop.sidebarLogo, false, 'docs sidebar must not render a competing navbar logo');
  assert.ok(desktop.sidebarTop >= desktop.navbar.bottom - 1, 'docs sidebar navigation must begin below the global navbar');
  await clickNavigationLink(client, 'nav[aria-label="Docs sidebar"]', 'Start by outcome');
  await waitForPath(client, '/start/', 1440);

  await navigate(client, `${site}/docs/aep/getting-started/`);
  const projectContext = await evaluate(client, projectContextSnapshot());
  assert.ok(projectContext.sidebar.some((item) => item.label === 'Start by outcome' && item.path === '/start/'), 'deep project sidebar must return to an audience path');
  assert.ok(projectContext.sidebar.some((item) => item.label === 'All technical docs' && item.path === '/docs/'), 'deep project sidebar must return to all technical docs');
  assert.equal(projectContext.sidebar.filter((item) => item.path === '/docs/aep/').length, 1, 'deep project sidebar must expose the AEP root exactly once');
  assert.deepEqual(projectContext.sidebar.filter((item) => item.path?.startsWith('/docs/aep/')).slice(0, 2).map((item) => item.label), ['AEP', 'Getting started'], 'deep project sidebar must preserve AEP source ordering');
  assert.ok(projectContext.breadcrumbs.some((item) => item.label === 'AEP' && item.path === '/docs/aep/'), 'deep project breadcrumb must retain the linked AEP parent');
  assert.match(projectContext.context, /AEP/, 'deep project context must name AEP');
  assert.match(projectContext.provenance, /aep\/website\/docs\/getting-started\.md/, 'deep project provenance must qualify the source path with its repository');

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
  assert.equal(drawer.labels[0]?.label, 'Start by outcome', 'the first visible docs item must return to the outcome chooser');
  assert.ok(drawer.labels.some((item) => item.label === 'About this documentation site'), 'the Website reference must be labelled as documentation-system context');
  assert.ok(drawer.labels.every((item) => item.label !== 'Start'), 'the Website reference must not masquerade as Start');
  assertVisibleLabels(drawer.labels, 390, 'mobile docs drawer');
  await clickNavigationLink(client, '.navbar-sidebar__item:not([inert])', 'Start by outcome');
  await waitForPath(client, '/start/', 390);

  await navigate(client, `${site}/docs/`);
  await clickVisibleElement(client, '.navbar__toggle', 'mobile navigation toggle');
  await settle(client);
  await clickVisibleElement(client, '.navbar-sidebar__item:not([inert]) .navbar-sidebar__back', 'Back to main menu');
  await settle(client);
  const mobileGlobal = await evaluate(client, activeDrawerSnapshot());
  assert.equal(mobileGlobal.mode, 'global', 'Back to main menu must expose global navigation');
  assert.deepEqual(mobileGlobal.labels.map((item) => item.label), ['Start', 'Explore', 'Docs', 'Updates', 'Search', 'GitHub']);
  assertVisibleLabels(mobileGlobal.labels, 390, 'mobile global drawer');
  await clickNavigationLink(client, '.navbar-sidebar__item:not([inert])', 'Start');
  await waitForPath(client, '/start/', 390);

  for (const viewport of [
    {width: 320, height: 844, mobile: true},
    {width: 390, height: 844, mobile: true},
    {width: 996, height: 844, mobile: false},
  ]) {
    await verifyKeyboardDrawer(client, site, viewport);
  }

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
      assert.equal(responsiveDrawer.labels[0]?.label, 'Start by outcome', `docs submenu must lead to the outcome chooser at ${width}px`);
      assertVisibleLabels(responsiveDrawer.labels, width, `docs drawer at ${width}px`);
      await clickVisibleElement(client, '.navbar-sidebar__item:not([inert]) .navbar-sidebar__back', `Back to main menu at ${width}px`);
      await settle(client);
      const responsiveGlobal = await evaluate(client, activeDrawerSnapshot());
      assert.equal(responsiveGlobal.mode, 'global', `Back to main menu must expose global links at ${width}px`);
      assert.deepEqual(responsiveGlobal.labels.map((item) => item.label), ['Start', 'Explore', 'Docs', 'Updates', 'Search', 'GitHub']);
      assertVisibleLabels(responsiveGlobal.labels, width, `global drawer at ${width}px`);
      await clickNavigationLink(client, '.navbar-sidebar__item:not([inert])', 'Start');
    } else {
      assert.equal(state.toggle.visible, false, `navigation toggle must be hidden when no drawer exists at ${width}px`);
      assert.deepEqual(state.labels.map((label) => label.label), ['Start', 'Explore', 'Docs', 'Updates', 'Search']);
      for (const label of state.labels) {
        assert.ok(label.visible, `${label.label} must be visible at ${width}px`);
        assert.ok(label.topmost, `${label.label} must be unobstructed at ${width}px`);
      }
      await clickNavigationLink(client, '.navbar__items:not(.navbar__items--right)', 'Start');
    }
    await waitForPath(client, '/start/', width);
  }

  await verifyGlobalSectionState(client, site);
  await verifySearchCards(client, site);
  await verifyDocumentationViewports(client, site);

  process.stdout.write(`verified global navigation, project context, readable search cards, pointer activation, and trapped keyboard drawer flow at 1440×1000, 320/390×844, and ${boundaryWidths.join('/')}×844\n`);
} catch (error) {
  if (chromeErrors.trim()) error.message = `${error.message}\nChrome diagnostics:\n${chromeErrors.trim()}`;
  throw error;
} finally {
  client?.close();
  await stopChrome(chrome, chromeClosed);
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
}

async function stopChrome(process, closed) {
  if (process.exitCode === null && process.signalCode === null) process.kill('SIGTERM');
  const stoppedGracefully = await Promise.race([
    closed.then(() => true),
    delay(2000).then(() => false),
  ]);
  if (stoppedGracefully) return;

  process.kill('SIGKILL');
  await Promise.race([
    closed,
    rejectAfter(5000, 'Chrome did not exit after SIGKILL'),
  ]);
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
  const deadline = performance.now() + chromeStartupTimeoutMs;
  while (true) {
    if (chrome.exitCode !== null || chrome.signalCode !== null) {
      throw new Error(`Chrome exited before exposing DevTools (${chrome.exitCode ?? chrome.signalCode})`);
    }
    try {
      const [port] = (await readFile(file, 'utf8')).trim().split(/\r?\n/);
      if (/^[0-9]+$/.test(port)) return Number(port);
    } catch { /* Chrome has not created the endpoint yet */ }
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(chromeStartupPollMs, remaining));
  }
  throw new Error(`timed out after ${chromeStartupTimeoutMs}ms waiting for Chrome DevTools endpoint`);
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
  await waitForHydration(cdp, url);
  await settle(cdp);
}

async function waitForHydration(cdp, url) {
  const deadline = performance.now() + navigationPathTimeoutMs;
  let observed = {hydrated: null, readyState: '<unavailable>', href: '<unavailable>'};
  while (performance.now() < deadline) {
    try {
      observed = await evaluate(cdp, `({
        hydrated: document.documentElement.dataset.hasHydrated ?? null,
        readyState: document.readyState,
        href: window.location.href,
      })`);
      if (observed.hydrated === 'true') return;
    } catch {
      // A page navigation can briefly replace the execution context.
    }
    await delay(navigationPathPollMs);
  }
  throw new Error(
    `page did not hydrate after navigating to ${url} within ${navigationPathTimeoutMs}ms; observed ${JSON.stringify(observed)}`,
  );
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
    const fragments = [...element.getClientRects()]
      .filter((bounds) => bounds.width > 0 && bounds.height > 0)
      .map((bounds) => {
        const x = bounds.left + bounds.width / 2;
        const y = bounds.top + bounds.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {bounds, x, y, topmost: Boolean(hit && (hit === element || element.contains(hit)))};
      });
    const fragment = fragments.find(({topmost}) => topmost) ?? fragments[0];
    const bounds = fragment?.bounds;
    return {
      x: fragment?.x,
      y: fragment?.y,
      visible: Boolean(bounds && bounds.right > 0 && bounds.bottom > 0
        && bounds.left < innerWidth && bounds.top < innerHeight
        && getComputedStyle(element).visibility !== 'hidden'),
      topmost: Boolean(fragment?.topmost),
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

async function verifyKeyboardDrawer(cdp, siteUrl, viewport) {
  await setViewport(cdp, viewport);
  await navigate(cdp, `${siteUrl}/docs/aep/getting-started/`);
  await tabToSelector(cdp, '.navbar__toggle', viewport.width);
  await pressKey(cdp, 'Enter');
  await settle(cdp);

  const opened = await evaluate(cdp, keyboardDrawerSnapshot());
  assert.ok(opened.visible, `keyboard must open the drawer at ${viewport.width}px`);
  assert.equal(opened.expanded, 'true', `drawer trigger must expose expanded state at ${viewport.width}px`);
  assert.equal(opened.mode, 'docs', `deep docs must open the contextual drawer at ${viewport.width}px`);
  assert.ok(opened.active.inDrawer && opened.active.inActivePanel, `opening must move focus into the visible drawer view at ${viewport.width}px: ${JSON.stringify(opened)}`);
  assert.ok(opened.active.visible, `opening focus must be visible at ${viewport.width}px`);
  assert.ok(opened.labels.includes('Start by outcome'), `deep docs drawer must expose the audience-path escape at ${viewport.width}px`);
  assert.equal(opened.active.identity, opened.firstActiveIdentity, `opening must focus the first visible drawer control or link at ${viewport.width}px`);
  assert.match(opened.active.label, /Back to main menu/, `deep docs opening focus must expose the menu switch at ${viewport.width}px`);

  await pressKey(cdp, 'Enter');
  await settle(cdp);
  const switched = await evaluate(cdp, keyboardDrawerSnapshot());
  assert.equal(switched.mode, 'global', `keyboard menu switch must expose global navigation at ${viewport.width}px`);
  assert.ok(switched.active.inActivePanel && switched.active.visible, `menu switch must move focus into the visible global view at ${viewport.width}px`);
  assert.equal(switched.active.identity, switched.firstActiveIdentity, `menu switch must focus the first visible global link at ${viewport.width}px`);
  assert.equal(switched.active.label, 'Start', `first global keyboard target must be Start at ${viewport.width}px`);

  const cycleStart = switched.active.identity;
  assert.ok(switched.focusableCount > 1, `drawer must expose multiple keyboard targets at ${viewport.width}px`);
  for (let index = 0; index < switched.focusableCount; index += 1) {
    await pressKey(cdp, 'Tab');
    const tabbed = await evaluate(cdp, keyboardDrawerSnapshot());
    assert.ok(tabbed.active.inDrawer && tabbed.active.visible, `Tab ${index + 1} must stay in the visible drawer at ${viewport.width}px`);
  }
  const cycled = await evaluate(cdp, keyboardDrawerSnapshot());
  assert.equal(cycled.active.identity, cycleStart, `Tab must cycle within the drawer at ${viewport.width}px`);

  await pressKey(cdp, 'Tab', {shift: true});
  const reverseTabbed = await evaluate(cdp, keyboardDrawerSnapshot());
  assert.ok(reverseTabbed.active.inDrawer && reverseTabbed.active.visible, `Shift+Tab must stay in the visible drawer at ${viewport.width}px`);

  await pressKey(cdp, 'Escape');
  await settle(cdp);
  const closed = await evaluate(cdp, keyboardDrawerSnapshot());
  assert.equal(closed.visible, false, `Escape must close the drawer at ${viewport.width}px`);
  assert.equal(closed.expanded, 'false', `Escape must collapse the drawer trigger at ${viewport.width}px`);
  assert.ok(closed.active.isToggle, `Escape must restore focus to the drawer trigger at ${viewport.width}px`);
}

async function verifyGlobalSectionState(cdp, siteUrl) {
  await setViewport(cdp, {width: 1440, height: 1000, mobile: false});
  const cases = [
    ['Start', ['/start/', '/learn/', '/build/', '/products/evaluate/', '/operate/', '/contribute/']],
    ['Explore', ['/ecosystem/', '/ecosystem/aep/']],
    ['Docs', ['/docs/', '/docs/aep/', '/architecture/']],
    ['Updates', ['/updates/', '/changes/', '/releases/']],
    ['Search', ['/search/']],
  ];
  for (const [expected, routes] of cases) {
    for (const route of routes) {
      await navigate(cdp, `${siteUrl}${route}`);
      const active = await evaluate(cdp, `([...document.querySelectorAll('.navbar__items:not(.navbar__items--right) a.navbar__link--active')].map((item) => item.textContent.trim()))`);
      assert.deepEqual(active, [expected], `${route} must retain the ${expected} global section context`);
    }
  }
}

async function verifyLocalAnchorPresentation(cdp, siteUrl) {
  await setViewport(cdp, {width: 1440, height: 1000, mobile: false});
  const routes = [
    '/ecosystem/',
    '/changes/',
    '/docs/foundations/',
    '/ecosystem/website/',
    '/start/spec-driven-development/',
    '/docs/aep',
    '/docs/aep/',
    '/docs/website/',
  ];
  for (const route of routes) {
    await navigate(cdp, `${siteUrl}${route}`);
    const snapshot = await evaluate(cdp, localAnchorSnapshot());
    assert.deepEqual(snapshot.absoluteSameOriginAnchors, [], `${route} must not escape a local preview through canonical Website anchors`);
    assert.deepEqual(snapshot.localBlankAnchors, [], `${route} must not open local navigation in a new tab`);
    assert.match(snapshot.canonical ?? '', /^https:\/\/beyond10x\.github\.io\//, `${route} must retain absolute canonical metadata`);
  }

  await navigate(cdp, `${siteUrl}/docs/aep/`);
  await evaluate(
    cdp,
    `document.querySelector('main a[href="/ecosystem/agentplugins/"]')?.scrollIntoView({block: 'center', behavior: 'instant'})`,
  );
  await settle(cdp);
  await clickVisibleElement(
    cdp,
    'main a[href="/ecosystem/agentplugins/"]',
    'AEP compatibility link to the integrated Agent Plugins profile',
  );
  await waitForPath(cdp, '/ecosystem/agentplugins/', 1440);
}

async function verifySearchCards(cdp, siteUrl) {
  await setViewport(cdp, {width: 1440, height: 1000, mobile: false});
  const cards = await loadSearchCards(cdp, `${siteUrl}/search/?audience=operator`);
  assert.ok(cards.length > 0, 'operator search must render result cards in the browser');
  for (const card of cards) {
    assert.ok(card.description.length > 20, `${card.path} search card must expose a human-readable summary`);
    assert.doesNotMatch(card.description, /Skip to main content|On this page|(?:experience|reference){2,}|[a-z-]+(?:experience|reference)(?:adopter|developer|evaluator|operator|researcher)/i, `${card.path} search card must not expose navigation chrome or filter payloads`);
  }
  const operate = cards.find((card) => card.path === '/operate/');
  assert.equal(
    operate?.description,
    'Find service operations material without pushing cluster and chart detail into the practitioner onboarding path.',
    'operator search must render the canonical Operate summary',
  );

  for (const query of ['agent plugins', 'approval']) {
    const typedCards = await loadSearchCards(cdp, `${siteUrl}/search/?q=${encodeURIComponent(query)}`);
    assert.ok(typedCards.length > 0, `${query} search must render result cards in the browser`);
    for (const card of typedCards.slice(0, 10)) {
      assert.doesNotMatch(card.description.slice(0, 240), /source-owned (?:documentation|field note)|\b[0-9a-f]{40}\b/i, `${query} search card ${card.path} must not lead with source provenance`);
    }
  }

  const entityCards = await loadSearchCards(cdp, `${siteUrl}/search/?q=shared%20capability%20layer&project=agentplugins`);
  const decoded = entityCards.find((card) => card.description.includes('skills/<name>/SKILL.md'));
  assert.ok(decoded, 'typed search cards must display decoded <name> code placeholders as safe text');
  assert.doesNotMatch(decoded.description, /&lt;name/i, 'typed search cards must not expose encoded entities to readers');
}

async function loadSearchCards(cdp, url) {
  await navigate(cdp, url);
  let cards = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    cards = await evaluate(cdp, searchCardSnapshot());
    if (cards.length > 0) break;
    await delay(50);
  }
  return cards;
}

async function verifyDocumentationViewports(cdp, siteUrl) {
  // 720 CSS pixels at scale 2 exercises the reflow of a 1440px display at 200% zoom.
  const sizes = [
    {width: 1440, height: 1000, mobile: false, scale: 1},
    {width: 320, height: 844, mobile: true, scale: 1},
    {width: 390, height: 844, mobile: true, scale: 1},
    {width: 720, height: 500, mobile: false, scale: 2},
  ];
  for (const theme of ['light', 'dark']) {
    await evaluate(cdp, `localStorage.setItem('theme', ${JSON.stringify(theme)})`);
    for (const {width, height, mobile, scale} of sizes) {
      const context = `${theme}, ${width}px, scale ${scale}`;
      await cdp.command('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile});
      await navigate(cdp, `${siteUrl}/docs/connectors/architecture/specification/`);
      let diagram;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        diagram = await evaluate(cdp, `(() => {
          const viewport = document.querySelector('.theme-doc-markdown .b10x-diagram__viewport');
          const svg = viewport?.querySelector('svg');
          if (!svg?.viewBox.baseVal.width) return null;
          return {
            nativeWidth: svg.viewBox.baseVal.width, width: svg.getBoundingClientRect().width,
            focusable: viewport.tabIndex === 0, scrollWidth: viewport.scrollWidth,
            clientWidth: viewport.clientWidth, hidden: Boolean(svg.closest('[aria-hidden="true"]')),
            nested: Boolean(viewport.querySelector('.b10x-diagram__viewport')),
            source: Boolean(document.querySelector('[data-b10x-mermaid-source]')),
            described: Boolean(document.getElementById(viewport.getAttribute('aria-describedby').split(' ').at(-1))),
          };
        })()`);
        if (diagram && diagram.width >= diagram.nativeWidth - 1) break;
        await delay(50);
      }
      assert.ok(diagram, `ordinary Mermaid must render inside a shared viewport at ${context}`);
      assert.ok(diagram.width >= diagram.nativeWidth - 1, `diagram labels must retain intrinsic size at ${context}`);
      assert.ok(diagram.focusable && diagram.described, `diagram must expose keyboard focus and instructions at ${context}`);
      assert.equal(diagram.hidden, false, 'ordinary Mermaid must retain its native accessible description');
      assert.equal(diagram.nested, false, 'Mermaid must have exactly one scroll viewport');
      assert.ok(diagram.source, 'Mermaid must retain the exact-source evidence marker');
      if (diagram.scrollWidth > diagram.clientWidth + 1) {
        await assertKeyboardPan(cdp, '.theme-doc-markdown .b10x-diagram__viewport', context);
      }

      const tables = await evaluate(cdp, `([...document.querySelectorAll('.theme-doc-markdown .b10x-table-wrap')].map((wrapper) => ({
        columns: wrapper.querySelectorAll('thead th').length,
        overflow: wrapper.scrollWidth > wrapper.clientWidth + 1,
        focusable: wrapper.tabIndex === 0,
        named: Boolean(wrapper.getAttribute('aria-label')),
        hint: !document.getElementById(wrapper.getAttribute('aria-describedby'))?.hidden,
      })))`);
      assert.ok(tables.some((table) => table.columns >= 3), 'coverage comparison must retain its semantic column headers');
      for (const [index, table] of tables.entries()) {
        if (!table.overflow) continue;
        assert.ok(table.focusable && table.named && table.hint, `overflowing table must be named and keyboard accessible at ${context}`);
        // Select by inventory index: prose and other wrappers also participate in nth-of-type.
        await evaluate(cdp, `document.querySelectorAll('.theme-doc-markdown .b10x-table-wrap')[${index}].id = 'viewport-audit-table'`);
        await assertKeyboardPan(cdp, '#viewport-audit-table', context);
        const lastColumnVisible = await evaluate(cdp, `(() => {
          const wrapper = document.getElementById('viewport-audit-table');
          wrapper.scrollLeft = wrapper.scrollWidth;
          const column = wrapper.querySelector('thead th:last-child').getBoundingClientRect();
          return column.right <= wrapper.getBoundingClientRect().right + 1;
        })()`);
        assert.ok(lastColumnVisible, `the final table column must be reachable at ${context}`);
      }
      assert.ok(await evaluate(cdp, 'document.documentElement.scrollWidth <= innerWidth + 1'), `documentation must not force whole-page horizontal scrolling at ${context}`);
    }
  }
  await evaluate(cdp, "localStorage.removeItem('theme')");
  process.stdout.write('verified readable diagrams and semantic tables in both themes at desktop, 320/390px, and 200% reflow\n');
}

async function assertKeyboardPan(cdp, selector, context) {
  await evaluate(cdp, `(() => {
    const viewport = document.querySelector(${JSON.stringify(selector)});
    viewport.scrollIntoView({block: 'center'});
    viewport.scrollLeft = 0;
    viewport.focus();
  })()`);
  for (let count = 0; count < 4; count += 1) await pressKey(cdp, 'ArrowRight');
  await settle(cdp);
  const panned = await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)}).scrollLeft > 0`);
  assert.ok(panned, `arrow keys must pan ${selector} at ${context}`);
}

async function tabToSelector(cdp, selector, width) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await pressKey(cdp, 'Tab');
    const matches = await evaluate(cdp, `document.activeElement?.matches(${JSON.stringify(selector)}) ?? false`);
    if (matches) return;
  }
  throw new Error(`keyboard focus did not reach ${selector} at ${width}px`);
}

async function pressKey(cdp, key, {shift = false} = {}) {
  const definition = {
    Tab: {code: 'Tab', keyCode: 9},
    Enter: {code: 'Enter', keyCode: 13, text: '\r'},
    Escape: {code: 'Escape', keyCode: 27},
    ArrowRight: {code: 'ArrowRight', keyCode: 39},
  }[key];
  if (!definition) throw new Error(`unsupported navigation audit key ${key}`);
  const common = {
    key,
    code: definition.code,
    windowsVirtualKeyCode: definition.keyCode,
    nativeVirtualKeyCode: definition.keyCode,
    modifiers: shift ? 8 : 0,
    text: definition.text ?? '',
    unmodifiedText: definition.text ?? '',
  };
  await cdp.command('Input.dispatchKeyEvent', {type: definition.text ? 'keyDown' : 'rawKeyDown', ...common});
  await cdp.command('Input.dispatchKeyEvent', {type: 'keyUp', ...common});
  await delay(30);
}

function assertVisibleLabels(labels, width, context) {
  assert.ok(labels.length > 0, `${context} must contain links`);
  for (const label of labels) {
    assert.ok(label.visible, `${label.label} must intersect the ${width}px viewport in ${context}`);
    assert.ok(label.topmost, `${label.label} must be an unobstructed pointer target in ${context}`);
  }
}

async function waitForPath(cdp, expected, width) {
  const deadline = performance.now() + navigationPathTimeoutMs;
  let observed = {origin: '<unavailable>', pathname: '<unavailable>', href: '<unavailable>', readyState: '<unavailable>'};
  while (performance.now() < deadline) {
    try {
      observed = await evaluate(cdp, `({
        origin: window.location.origin,
        pathname: window.location.pathname,
        href: window.location.href,
        readyState: document.readyState,
      })`);
      if (observed.origin === siteOrigin && observed.pathname === expected) return;
    } catch {
      // A full-page navigation can briefly replace the execution context.
    }
    await delay(navigationPathPollMs);
  }
  throw new Error(
    `navigation link did not reach ${expected} at ${width}px within ${navigationPathTimeoutMs}ms; observed ${JSON.stringify(observed)}`,
  );
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

function projectContextSnapshot() {
  return `(() => {
  const entries = (selector) => [...document.querySelectorAll(selector)].map((element) => ({
    label: element.textContent.trim(),
    path: element instanceof HTMLAnchorElement ? new URL(element.href, location.href).pathname : null,
  }));
  return {
    sidebar: entries('nav[aria-label="Docs sidebar"] a'),
    breadcrumbs: entries('.theme-doc-breadcrumbs .breadcrumbs__item > :first-child'),
    context: document.querySelector('[aria-label="Documentation context"]')?.textContent.trim() ?? '',
    provenance: document.querySelector('[data-b10x-source-provenance]')?.textContent.trim() ?? '',
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

function keyboardDrawerSnapshot() {
  return `(() => {
  const drawer = document.querySelector('.navbar-sidebar');
  const toggle = document.querySelector('.navbar__toggle');
  const activePanel = [...(drawer?.querySelectorAll('.navbar-sidebar__item') ?? [])].find((panel) => !panel.inert);
  const rendered = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return bounds.width > 0 && bounds.height > 0
      && bounds.right > 0 && bounds.bottom > 0 && bounds.left < innerWidth && bounds.top < innerHeight
      && style.display !== 'none' && style.visibility !== 'hidden'
      && !element.closest('[inert], [aria-hidden="true"]');
  };
  const identity = (element) => element instanceof HTMLElement
    ? [element.tagName, element.getAttribute('href') ?? '', element.getAttribute('aria-label') ?? '', element.textContent.trim()].join('|')
    : '';
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const focusable = [...(drawer?.querySelectorAll(focusableSelector) ?? [])].filter(rendered);
  const activePanelFocusable = [...(activePanel?.querySelectorAll(focusableSelector) ?? [])].filter(rendered);
  const active = document.activeElement;
  const drawerBounds = drawer?.getBoundingClientRect();
  const drawerStyle = drawer ? getComputedStyle(drawer) : undefined;
  return {
    visible: Boolean(drawer && drawerBounds.width > 0 && drawerBounds.height > 0 && drawerStyle.visibility !== 'hidden'),
    expanded: toggle?.getAttribute('aria-expanded') ?? null,
    mode: activePanel?.querySelector('.navbar-sidebar__back') ? 'docs' : 'global',
    focusableCount: focusable.length,
    labels: [...(activePanel?.querySelectorAll('a') ?? [])].filter(rendered).map((item) => item.textContent.trim()),
    firstActiveIdentity: identity(activePanelFocusable[0]),
    active: {
      identity: identity(active),
      label: active instanceof HTMLElement ? active.textContent.trim() : '',
      inDrawer: Boolean(drawer?.contains(active)),
      inActivePanel: Boolean(activePanel?.contains(active)),
      visible: rendered(active),
      isToggle: active === toggle,
    },
  };
})()`;
}

function searchCardSnapshot() {
  return `(() => [...document.querySelectorAll('section[aria-label="Documentation search results"] .b10x-content-card')].map((card) => ({
  path: new URL(card.querySelector('h2 a, h3 a, h4 a')?.href ?? '/', location.href).pathname,
  description: card.querySelector('.b10x-content-card__description')?.textContent.trim().replace(/\\s+/g, ' ') ?? '',
})))()`;
}

function localAnchorSnapshot() {
  return `(() => ({
  absoluteSameOriginAnchors: [...document.querySelectorAll('a[href]')]
    .map((anchor) => anchor.getAttribute('href'))
    .filter((href) => href?.startsWith('https://beyond10x.github.io')),
  localBlankAnchors: [...document.querySelectorAll('a[href][target="_blank"]')]
    .map((anchor) => anchor.getAttribute('href'))
    .filter((href) => href?.startsWith('/')),
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
}))()`;
}
