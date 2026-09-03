import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import docsSystemPlugin from '@beyond10x/docs-system/docusaurus';
import {PRISM_ADDITIONAL_LANGUAGES} from '@beyond10x/docs-system/code';

const localPreview = process.env.B10X_LOCAL_PREVIEW === '1';

function localPreviewMetadata(): Record<string, unknown> {
  if (!localPreview) return {enabled: false};
  const revision = process.env.B10X_PREVIEW_REVISION;
  const treeState = process.env.B10X_PREVIEW_TREE_STATE;
  return {
    enabled: true,
    revision: revision && /^(?:[0-9a-f]{12}|unavailable)$/.test(revision) ? revision : 'unavailable',
    treeState: treeState && /^(?:clean|dirty|unknown)$/.test(treeState) ? treeState : 'unknown',
    reusedInputs: process.env.B10X_PREVIEW_REUSED_INPUTS === 'true',
  };
}

const config: Config = {
  title: 'beyond10x',
  tagline: 'Safe autonomous coding, from explicit intent to inspectable evidence',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
    // Rspack currently panics while rebuilding this large generated route graph. Keep the
    // production fast path, but use Webpack's stable HMR for an unambiguous local review loop.
    faster: localPreview ? false : undefined,
  },

  customFields: {
    localPreview: localPreviewMetadata(),
  },

  url: 'https://beyond10x.github.io',
  baseUrl: '/',
  organizationName: 'beyond10x',
  projectName: 'website',
  trailingSlash: true,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    docsSystemPlugin,
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'ecosystem-profiles',
        path: '.generated/ecosystem',
        routeBasePath: 'ecosystem',
        sidebarPath: false,
        showLastUpdateAuthor: false,
        showLastUpdateTime: false,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'component-data',
        path: '.generated/components',
        routeBasePath: 'components',
        sidebarPath: false,
        showLastUpdateAuthor: false,
        showLastUpdateTime: false,
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'api-reference',
        path: '.generated/api',
        routeBasePath: 'api',
        sidebarPath: false,
        showLastUpdateAuthor: false,
        showLastUpdateTime: false,
      },
    ],
  ],

  staticDirectories: ['static', '.generated/static'],

  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          path: '.generated/docs',
          routeBasePath: 'docs',
          sidebarPath: '.generated/sidebars.cjs',
          sidebarItemsGenerator: async ({defaultSidebarItemsGenerator, ...args}) => {
            const rootId = `${args.item.dirName}/index`;
            const docs = args.docs.filter((doc) => doc.id !== rootId);
            const hasNestedDocs = docs.some((doc) => doc.id.startsWith(`${args.item.dirName}/`));
            return hasNestedDocs ? defaultSidebarItemsGenerator({...args, docs}) : [];
          },
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: {
          path: '.generated/blog',
          routeBasePath: 'updates/field-notes',
          showReadingTime: true,
          blogTitle: 'Field notes',
          blogDescription: 'Repository-owned observations and research notes across beyond10x.',
          feedOptions: {type: ['rss', 'atom', 'json']},
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.svg',
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
      options: {
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      },
    },
    docs: {
      sidebar: {
        autoCollapseCategories: true,
        hideable: true,
      },
    },
    metadata: [
      {
        name: 'keywords',
        content:
          'beyond10x, safe agentic coding, autonomous coding, spec-driven development, Claude Code, Agent Plugins, Harness, AEP, ESS, executable system specification',
      },
    ],
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'beyond10x',
      hideOnScroll: false,
      logo: {
        alt: 'beyond10x layered mark',
        src: 'img/mark.svg',
      },
      items: [
        {to: '/start/', label: 'Start', position: 'left', activeBaseRegex: '^/(start|learn|build|products|operate|contribute)(/|$)'},
        {to: '/ecosystem/', label: 'Explore', position: 'left', activeBasePath: '/ecosystem'},
        {to: '/docs/', label: 'Docs', position: 'left', activeBaseRegex: '^/(docs|api|components|architecture)(/|$)'},
        {to: '/updates/', label: 'Updates', position: 'left', activeBaseRegex: '^/(updates|changes|releases)(/|$)'},
        {to: '/search/', label: 'Search', position: 'left'},
        {
          href: 'https://github.com/beyond10x',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Start',
          items: [
            {label: 'Try a governed change', href: '/start/spec-driven-development/'},
            {label: 'Learn safe agentic coding', href: '/learn/safe-agentic-coding/'},
            {label: 'Build agent systems', href: '/build/agent-systems/'},
          ],
        },
        {
          title: 'Adopt',
          items: [
            {label: 'Evaluate products', href: '/products/evaluate/'},
            {label: 'Operate services', href: '/operate/'},
            {label: 'Explore the project map', href: '/ecosystem/'},
          ],
        },
        {
          title: 'Documentation',
          items: [
            {label: 'Technical documentation', to: '/docs/'},
            {label: 'Search all documentation', to: '/search/'},
            {label: 'Updates and field notes', to: '/updates/'},
            {label: 'Releases', to: '/releases/'},
          ],
        },
        {
          title: 'About',
          items: [
            {label: 'Vision', to: '/vision/'},
            {label: 'Architecture', to: '/architecture/'},
            {label: 'GitHub organization', href: 'https://github.com/beyond10x'},
          ],
        },
      ],
      copyright: '© 2026 beyond10x · Make the decision explicit.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: [...PRISM_ADDITIONAL_LANGUAGES],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
