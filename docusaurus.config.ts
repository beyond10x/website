import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import docsSystemPlugin, {ecosystemFooterGroup} from '@beyond10x/docs-system/docusaurus';

const config: Config = {
  title: 'beyond10x',
  tagline: 'Evidence-backed principles, deterministic systems, and governed agents',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
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
          'beyond10x, agentic principles, entity runtime, AEP, agentic engineering protocol, ESS, executable system specification, governed connectors, autonomous engineering, deterministic systems',
      },
    ],
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'beyond10x',
      hideOnScroll: true,
      logo: {
        alt: 'beyond10x layered mark',
        src: 'img/mark.svg',
      },
      items: [
        {to: '/', label: 'Start', position: 'left'},
        {to: '/ecosystem/', label: 'Explore', position: 'left'},
        {to: '/docs/', label: 'Docs', position: 'left'},
        {to: '/changes/', label: 'Changes', position: 'left'},
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
        ecosystemFooterGroup(),
        {
          title: 'Start at the bottom',
          items: [
            {
              label: 'Agentic Principles',
              href: '/docs/agentic-principles/',
            },
            {label: 'Entity Runtime', href: '/docs/entity-runtime/'},
            {
              label: 'AEP',
              href: '/docs/aep/',
            },
            {label: 'ESS', href: '/docs/ess/'},
            {label: 'Harness', href: '/docs/harness/'},
            {label: 'AEP Service', href: '/docs/aep-service/'},
          ],
        },
        {
          title: 'Source',
          items: [
            {label: 'This repository', href: 'https://github.com/beyond10x/website'},
            {
              label: 'Agentic Principles',
              href: 'https://github.com/beyond10x/agentic-principles',
            },
            {label: 'Entity Runtime', href: 'https://github.com/beyond10x/entity-runtime'},
            {
              label: 'AEP',
              href: 'https://github.com/beyond10x/aep',
            },
            {label: 'ESS', href: 'https://github.com/beyond10x/ess'},
            {label: 'AEP Service', href: 'https://github.com/beyond10x/aep-service'},
          ],
        },
        {
          title: 'Map',
          items: [
            {label: 'Public ecosystem', to: '/ecosystem/'},
            {label: 'Adoption journeys', to: '/journeys/'},
            {label: 'Release stream', to: '/releases/'},
            {label: 'Architecture', to: '/architecture/'},
          ],
        },
      ],
      copyright: '© 2026 beyond10x · Make the decision explicit.',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['yaml', 'json', 'bash'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
