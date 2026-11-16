/* ============================================================
   Project analysis — PURE, no I/O.

   Consumes only a DirListing (paths + kinds + extensions) and
   returns a typed, evidence-bearing read of the project: framework,
   styling, component count, token layer, themes — plus a strict
   ignore tally. Because it never reads file *contents* and never
   touches the filesystem, the same engine runs unchanged against a
   real folder listing from a future LocalHost adapter.

   Every claim carries the file paths that prove it. No version
   numbers, because paths alone cannot substantiate them.
   ============================================================ */

import type { DirEntry, DirListing } from '../host/types';
import IGNORE_DIRS from './ignore-dirs.json';

export type Confidence = 'high' | 'med' | 'low';

export interface Detected {
  name: string;
  confidence: Confidence;
  evidence: string[];
}

export interface ProjectAnalysis {
  framework: Detected[];
  styling: Detected[];
  components: { count: number; samples: string[] };
  tokens: { files: string[]; signals: string[] };
  themes: Detected[];
  ignored: { count: number; reasons: Record<string, number> };
  /** One editorial line, e.g. "React · Vite · TypeScript · Tailwind". */
  summary: string;
  /** Included (analysed) file count. */
  scanned: number;
  /** Included directory count (walked, but not "scanned" as files). */
  dirs: number;
  /** Every entry the host returned, before ignoring. */
  total: number;
  /** The host hit its entry cap — later directories were never read. */
  truncated: boolean;
}

/* ----------------------------------------------------------------
   Strict ignore rules — one source of truth.

   The spec is emphatic: never crawl dependencies, build output,
   lockfiles, env/secrets, or media. These rules are applied here and
   their tallies surfaced on the Analyze stage so the rule is visible.
   ---------------------------------------------------------------- */

/* The directory names live in `ignore-dirs.json` so the sidecar's walker
   and write guard read the exact same list. `.git` is added here because
   it is a version-control concern, not a dependency/build one. */
const IGNORE_DIR_REASONS: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(IGNORE_DIRS).flatMap(([reason, names]) =>
      names.map((name) => [name.toLowerCase(), reason]),
    ),
  ),
  '.git': 'version control',
};

const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
]);

const MEDIA_EXT = new Set([
  // images
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif', '.bmp', '.tiff',
  // fonts
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  // audio / video
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg',
  // archives
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
]);

/**
 * Why an entry is ignored, or null if it should be analysed.
 * Checks every path segment so a file *inside* an ignored dir
 * (e.g. node_modules/react/index.js) is caught too.
 */
export function ignoreReason(e: DirEntry): string | null {
  const segs = e.path.split('/');
  for (const s of segs) {
    const why = IGNORE_DIR_REASONS[s.toLowerCase()];
    if (why) return why;
  }
  const name = e.name.toLowerCase();
  if (LOCKFILES.has(name)) return 'lockfiles';
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) {
    return 'env & secrets';
  }
  if (e.ext === '.pem' || e.ext === '.key') return 'env & secrets';
  if (e.ext === '.map') return 'sourcemaps';
  if (/\.min\.(css|js)$/.test(name)) return 'generated';
  if (e.ext && MEDIA_EXT.has(e.ext)) return 'media & binaries';
  return null;
}

/* ---------------------------------------------------------------- */

const COMPONENT_EXT = new Set(['.tsx', '.jsx', '.vue', '.svelte']);

const cap = (arr: string[], n = 4) => arr.slice(0, n);

export function analyze(listing: DirListing): ProjectAnalysis {
  const reasons: Record<string, number> = {};
  const included: DirEntry[] = [];

  for (const e of listing.entries) {
    const why = ignoreReason(e);
    if (why) reasons[why] = (reasons[why] ?? 0) + 1;
    else included.push(e);
  }

  const files = included.filter((e) => e.kind === 'file');
  const dirs = included.length - files.length;
  const paths = files.map((e) => e.path);
  const match = (re: RegExp) => paths.filter((p) => re.test(p));
  const any = (re: RegExp) => paths.some((p) => re.test(p));

  /* --- components -------------------------------------------- */
  const componentFiles = files.filter(
    (e) =>
      e.ext != null &&
      COMPONENT_EXT.has(e.ext) &&
      (e.path.includes('/components/') || /^[A-Z]/.test(e.name)),
  );
  const components = {
    count: componentFiles.length,
    samples: componentFiles.slice(0, 6).map((e) => e.name),
  };

  /* --- signals ----------------------------------------------- */
  const tsx = match(/\.(tsx|jsx)$/);
  const ts = match(/\.(ts|tsx)$/);
  const hasMain = any(/^src\/main\.[jt]sx$/);
  const hasApp = any(/^src\/App\.[jt]sx$/);
  const hasVite = any(/(^|\/)vite\.config\.[tj]s$/);
  const hasTsup = any(/(^|\/)tsup\.config\.[tj]s$/);
  const hasNext = any(/(^|\/)next\.config\./) || listing.entries.some((e) => e.name === '.next');
  const hasTsconfig = paths.includes('tsconfig.json');
  const htmlFiles = match(/\.html$/);
  const vue = match(/\.vue$/);
  const svelte = match(/\.svelte$/);
  const hasTailwind = any(/(^|\/)tailwind\.config\.[tj]s$/);
  const cssFiles = match(/\.css$/);
  const cssModules = match(/\.module\.css$/);
  const tokenFiles = paths.filter(
    (p) =>
      /(^|\/)tokens?\//.test(p) ||
      /tokens?\.(css|json|ts)$/.test(p) ||
      /(^|\/)tailwind\.config\.[tj]s$/.test(p),
  );
  const themePaths = paths.filter(
    (p) => /theme/i.test(p) || /\/(dark|light|high-contrast)\.css$/.test(p),
  );
  const themeCss = themePaths.filter((p) => /\.css$/.test(p));
  const themeToggle = paths.find((p) => /theme-toggle\.[jt]s$/.test(p));

  /* --- framework / stack ------------------------------------- */
  const framework: Detected[] = [];

  if (tsx.length || hasApp || hasMain) {
    framework.push({
      name: 'React',
      confidence: tsx.length >= 3 ? 'high' : 'med',
      evidence: cap([...(hasMain ? ['src/main.tsx'] : []), ...tsx]),
    });
  }
  if (vue.length) {
    framework.push({ name: 'Vue', confidence: 'high', evidence: cap(vue) });
  }
  if (svelte.length) {
    framework.push({ name: 'Svelte', confidence: 'high', evidence: cap(svelte) });
  }
  if (hasNext) {
    framework.push({
      name: 'Next.js',
      confidence: 'high',
      evidence: cap(match(/(^|\/)next\.config\./).concat(['.next'])),
    });
  }
  if (hasVite) {
    framework.push({
      name: 'Vite',
      confidence: 'high',
      evidence: cap(match(/(^|\/)vite\.config\.[tj]s$/)),
    });
  } else if (hasTsup) {
    framework.push({
      name: 'tsup (library build)',
      confidence: 'high',
      evidence: cap(match(/(^|\/)tsup\.config\.[tj]s$/)),
    });
  }
  if (ts.length || hasTsconfig) {
    framework.push({
      name: 'TypeScript',
      confidence: hasTsconfig && ts.length >= 2 ? 'high' : 'med',
      evidence: cap([...(hasTsconfig ? ['tsconfig.json'] : []), ...ts]),
    });
  }
  // Static site: HTML present and no JS framework detected.
  if (htmlFiles.length && !tsx.length && !vue.length && !svelte.length) {
    framework.push({
      name: 'Static HTML',
      confidence: 'high',
      evidence: cap(htmlFiles),
    });
  }
  // Library signal: a token/theming system with a bundler but no app entry.
  if (hasTsup && tokenFiles.length && (themePaths.length || /\btokens?\b/.test(listing.root))) {
    framework.push({
      name: 'Component library',
      confidence: 'med',
      evidence: cap([...tokenFiles, ...themePaths]),
    });
  }

  /* --- styling ----------------------------------------------- */
  const styling: Detected[] = [];
  if (hasTailwind) {
    styling.push({
      name: 'Tailwind',
      confidence: 'high',
      evidence: cap(match(/(^|\/)tailwind\.config\.[tj]s$/)),
    });
  }
  if (cssModules.length) {
    styling.push({ name: 'CSS Modules', confidence: 'high', evidence: cap(cssModules) });
  }
  if (cssFiles.length) {
    // Exclude module files from the "plain CSS" evidence so it reads honestly.
    const plain = cssFiles.filter((p) => !/\.module\.css$/.test(p));
    if (plain.length) {
      styling.push({
        name: 'Plain CSS',
        confidence: hasTailwind ? 'low' : 'high',
        evidence: cap(plain),
      });
    }
  }

  /* --- tokens ------------------------------------------------ */
  const tokenSignals: string[] = [];
  if (tokenFiles.length) {
    tokenSignals.push(`${tokenFiles.length} token source${tokenFiles.length === 1 ? '' : 's'}`);
  }
  if (hasTailwind) tokenSignals.push('Tailwind theme config extends the token scale');
  if (tokenFiles.some((p) => /tokens?\.css$/.test(p))) {
    tokenSignals.push('CSS custom properties in a dedicated tokens stylesheet');
  }
  if (!tokenFiles.length) {
    tokenSignals.push('No token layer detected — styles are written inline in plain CSS');
  }

  /* --- themes ------------------------------------------------ */
  const themes: Detected[] = [];
  if (themeCss.length) {
    // One entry per theme stylesheet, name = humanised basename.
    for (const p of themeCss.slice(0, 6)) {
      const base = (p.split('/').pop() ?? p).replace(/\.css$/, '');
      themes.push({
        name: base
          .split(/[-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        confidence: 'high',
        evidence: [p],
      });
    }
  }
  if (themeToggle && !themes.length) {
    themes.push({
      name: 'Light / dark (runtime toggle)',
      confidence: 'med',
      evidence: [themeToggle],
    });
  }
  const themeProvider = paths.find((p) => /theme-provider\.[jt]sx$/.test(p));
  if (themeProvider) {
    themes.push({
      name: 'Theme provider (context)',
      confidence: 'med',
      evidence: [themeProvider, ...(themePaths.includes('src/hooks/useTheme.ts') ? ['src/hooks/useTheme.ts'] : [])],
    });
  }

  /* --- summary ----------------------------------------------- */
  const parts = [...framework.map((d) => d.name), ...styling.map((d) => d.name)];
  const summary = Array.from(new Set(parts)).slice(0, 4).join(' · ') || 'Unclassified project';

  return {
    framework,
    styling,
    components,
    tokens: { files: cap(tokenFiles, 6), signals: tokenSignals },
    themes,
    ignored: { count: listing.entries.length - included.length, reasons },
    summary,
    scanned: files.length,
    dirs,
    total: listing.entries.length,
    truncated: Boolean(listing.truncated),
  };
}
