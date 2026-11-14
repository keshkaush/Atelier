/* ============================================================
   Canned sample projects for MockHost.

   Three trees chosen to exercise every detector branch:
     · northwind-web  — Vite + React 18 + TypeScript + Tailwind v4
     · lumen-site     — plain HTML / CSS static site
     · cadence-ds     — a design-system repo (tokens + themes)

   Each tree deliberately carries the noise a real repo has —
   node_modules, lockfiles, .env*, images — so the analysis
   stage can *show* its strict-ignore rules working.
   ============================================================ */

import type { DirEntry, DirListing, GitStatus } from './types';

export interface SampleProject {
  id: string;
  label: string;
  /** One-line description shown on the attach card. */
  blurb: string;
  listing: DirListing;
  git: GitStatus;
}

/** Small helper so the trees below stay readable. */
const f = (path: string, size = 1200): DirEntry => {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return {
    name,
    path,
    kind: 'file',
    ext: dot > 0 ? name.slice(dot).toLowerCase() : undefined,
    size,
  };
};
const d = (path: string): DirEntry => ({
  name: path.split('/').pop() ?? path,
  path,
  kind: 'dir',
});

/* ---------------------------------------------------------- */
/* 1. northwind-web — Vite + React 18 + TypeScript + Tailwind  */
/* ---------------------------------------------------------- */

const northwind: SampleProject = {
  id: 'northwind-web',
  label: 'Northwind — project app',
  blurb: 'Vite + React 18 + TypeScript + Tailwind v4. The flagship app.',
  git: { isRepo: true, branch: 'main', dirty: false, ahead: 0, behind: 0 },
  listing: {
    root: 'northwind-web',
    entries: [
      d('node_modules'),
      d('node_modules/react'),
      f('node_modules/react/index.js', 18000),
      d('node_modules/react-dom'),
      f('node_modules/react-dom/index.js', 22000),
      d('node_modules/vite'),
      f('node_modules/vite/package.json', 4200),
      d('dist'),
      f('dist/assets/index-a1b2c3.js', 184000),
      f('dist/index.html', 900),
      d('src'),
      d('src/components'),
      f('src/components/Board.tsx', 3200),
      f('src/components/Card.tsx', 1800),
      f('src/components/Sidebar.tsx', 2600),
      f('src/components/Toolbar.tsx', 1500),
      f('src/components/Modal.tsx', 2100),
      d('src/hooks'),
      f('src/hooks/useBoard.ts', 2400),
      f('src/hooks/useLocalStore.ts', 1600),
      d('src/styles'),
      f('src/styles/tokens.css', 3400),
      f('src/styles/index.css', 2200),
      f('src/App.tsx', 1700),
      f('src/main.tsx', 320),
      f('src/vite-env.d.ts', 40),
      f('index.html', 460),
      f('package.json', 1100),
      f('package-lock.json', 320000),
      f('tailwind.config.ts', 900),
      f('postcss.config.js', 180),
      f('vite.config.ts', 240),
      f('tsconfig.json', 700),
      f('.env', 90),
      f('.env.local', 120),
      f('.env.example', 140),
      f('README.md', 1800),
      d('public'),
      f('public/logo.svg', 2400),
      f('public/hero.jpg', 240000),
      d('src/assets'),
      f('src/assets/pattern.png', 88000),
      f('src/index.css.map', 5200),
    ],
  },
};

/* ---------------------------------------------------------- */
/* 2. lumen-site — plain HTML / CSS static site               */
/* ---------------------------------------------------------- */

const lumen: SampleProject = {
  id: 'lumen-site',
  label: 'Lumen — marketing site',
  blurb: 'Hand-written HTML + CSS. No framework, no build step.',
  git: { isRepo: true, branch: 'redesign', dirty: true, ahead: 1, behind: 0 },
  listing: {
    root: 'lumen-site',
    entries: [
      d('css'),
      f('css/reset.css', 900),
      f('css/site.css', 7600),
      f('css/print.css', 1100),
      d('js'),
      f('js/nav.js', 1400),
      f('js/theme-toggle.js', 900),
      d('img'),
      f('img/logo.png', 34000),
      f('img/hero.webp', 210000),
      f('img/icon-close.svg', 600),
      f('index.html', 8200),
      f('about.html', 5400),
      f('pricing.html', 6100),
      f('contact.html', 4200),
      f('404.html', 1800),
      f('styles.min.css', 6200),
      f('favicon.ico', 15000),
      f('README.md', 700),
      f('.env', 60),
    ],
  },
};

/* ---------------------------------------------------------- */
/* 3. cadence-ds — design-system repo (tokens + themes)       */
/* ---------------------------------------------------------- */

const cadence: SampleProject = {
  id: 'cadence-ds',
  label: 'Cadence — design system',
  blurb: 'Token-driven component library with light, dark, and high-contrast themes.',
  git: { isRepo: true, branch: 'main', dirty: false, ahead: 0, behind: 2 },
  listing: {
    root: 'cadence-ds',
    entries: [
      d('node_modules'),
      d('node_modules/@cadence/core'),
      f('node_modules/@cadence/core/dist/index.js', 96000),
      d('dist'),
      f('dist/cadence.css', 44000),
      d('src'),
      d('src/tokens'),
      f('src/tokens/color.ts', 4200),
      f('src/tokens/space.ts', 1600),
      f('src/tokens/type.ts', 2100),
      f('src/tokens/radius.ts', 900),
      f('src/tokens/index.ts', 700),
      d('src/themes'),
      f('src/themes/light.css', 3800),
      f('src/themes/dark.css', 3900),
      f('src/themes/high-contrast.css', 3600),
      f('src/themes/theme-provider.tsx', 2400),
      d('src/components'),
      f('src/components/Button.tsx', 2800),
      f('src/components/Input.tsx', 3200),
      f('src/components/Select.tsx', 2600),
      f('src/components/Dialog.tsx', 3400),
      f('src/components/Tabs.tsx', 2200),
      f('src/components/Tooltip.tsx', 1900),
      d('src/hooks'),
      f('src/hooks/useTheme.ts', 1300),
      f('src/index.ts', 900),
      f('package.json', 1600),
      f('pnpm-lock.yaml', 210000),
      f('tsup.config.ts', 500),
      f('tsconfig.json', 800),
      f('tokens.json', 5200),
      f('themes.json', 3100),
      f('.env.example', 120),
      f('README.md', 4200),
      f('CHANGELOG.md', 3600),
      f('src/logo.svg', 1200),
    ],
  },
};

export const SAMPLE_PROJECTS: SampleProject[] = [northwind, lumen, cadence];

export function sampleById(id: string): SampleProject | undefined {
  return SAMPLE_PROJECTS.find((p) => p.id === id);
}
