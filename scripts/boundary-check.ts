#!/usr/bin/env bun
import { Glob } from 'bun';
import { existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dir, '..');

type Severity = 'error' | 'warning';

interface Check {
  name: string;
  globs: string[];
  pattern: RegExp;
  message: string;
  severity: Severity;
}

interface FileAssertion {
  name: string;
  path: string;
  shouldExist: boolean;
  message: string;
  contentPattern?: RegExp;
  contentMessage?: string;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

// Glob shortcuts
const ROUTE_SVELTE = 'src/routes/**/*.svelte';
const ROUTE_TS = 'src/routes/**/*.ts';
const ROUTE_SERVER_TS = ['src/routes/**/+page.server.ts', 'src/routes/**/+server.ts'];
const SERVICE_TS = 'src/lib/server/services/**/*.ts';
const ALL_SVELTE = 'src/**/*.svelte';
const COMPONENT_SVELTE = 'src/lib/components/**/*.svelte';

// ---------------------------------------------------------------------------
// Section 1: Architecture boundary checks
// ---------------------------------------------------------------------------

const architectureChecks: Check[] = [
  {
    name: 'No direct Prisma in routes',
    globs: ROUTE_SERVER_TS,
    pattern: /from '\$lib\/server\/db'/,
    message: 'Use service functions instead.',
    severity: 'error',
  },
  {
    name: 'No client imports from $lib/server',
    globs: [ALL_SVELTE],
    pattern: /from '\$lib\/server\//,
    message: 'Move types to $lib/types/.',
    severity: 'error',
  },
  {
    name: 'No raw @prisma/client imports',
    globs: ['src/**/*.ts', ALL_SVELTE],
    pattern: /from '@prisma\/client'/,
    message: 'Use $prisma/client.js alias.',
    severity: 'error',
  },
  {
    name: 'No magic format IDs',
    globs: [SERVICE_TS, ROUTE_TS],
    pattern: /formatId\s*[:=]\s*[12]\b/,
    message: 'Use FORMAT_1V1/FORMAT_2V2 constants.',
    severity: 'warning',
  },
  {
    name: 'No @sveltejs/kit in services',
    globs: [SERVICE_TS],
    pattern: /from '@sveltejs\/kit'/,
    message: 'Use notFound/badRequest/forbidden from $lib/server/utils/errors.',
    severity: 'error',
  },
  {
    name: 'No Shape B form error responses',
    globs: [ROUTE_TS],
    pattern: /fail\(\d+,\s*\{[^}]*success:\s*false/,
    message: 'Use fail(status, { error }) shape.',
    severity: 'error',
  },
  {
    name: 'No raw process.env in services or routes',
    globs: [SERVICE_TS, ROUTE_TS, ROUTE_SVELTE],
    pattern: /process\.env\./,
    message: 'Use getOptionalEnv/getRequiredEnv or $env/dynamic/private.',
    severity: 'error',
  },
  {
    name: 'No $app/stores imports',
    globs: [ALL_SVELTE],
    pattern: /app\/stores/,
    message: 'Use $app/state instead.',
    severity: 'error',
  },
  {
    name: 'No formData.get() with type assertions in routes',
    globs: ROUTE_SERVER_TS,
    pattern: /formData\.get\(.+\)\s+as\s+/,
    message: 'Use validateForm() with a Zod schema.',
    severity: 'error',
  },
  {
    name: 'No catch (err: any) blocks',
    globs: ['src/**/*.ts', ALL_SVELTE],
    pattern: /catch\s*\(\s*\w+\s*:\s*any\s*\)/,
    message: 'Remove : any — strict mode treats catch variables as unknown.',
    severity: 'error',
  },
];

// ---------------------------------------------------------------------------
// Section 2: Banned raw palette colors in route files
// ---------------------------------------------------------------------------

const paletteChecks: Check[] = [
  // Surface / Layout
  {
    name: 'No bg-zinc-950 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-zinc-950/,
    message: 'Use bg-surface-page.',
    severity: 'error',
  },
  {
    name: 'No bg-zinc-900 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-zinc-900/,
    message: 'Use bg-surface-card or Card component.',
    severity: 'error',
  },
  {
    name: 'No bg-zinc-800 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-zinc-800/,
    message: 'Use bg-surface-input.',
    severity: 'error',
  },
  {
    name: 'No bg-zinc-700 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-zinc-700/,
    message: 'Use bg-surface-hover.',
    severity: 'error',
  },
  {
    name: 'No border-zinc-800 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /border-zinc-800/,
    message: 'Use border-border-default.',
    severity: 'error',
  },
  {
    name: 'No border-zinc-700 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /border-zinc-700/,
    message: 'Use border-border-input.',
    severity: 'error',
  },
  {
    name: 'No divide-zinc-800 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /divide-zinc-800/,
    message: 'Use divide-border-default.',
    severity: 'error',
  },
  {
    name: 'No divide-zinc-700 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /divide-zinc-700/,
    message: 'Use divide-border-input.',
    severity: 'error',
  },
  // Text
  {
    name: 'No text-gray-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /text-gray-[2-6]00/,
    message: 'Use text-text-body/label/muted.',
    severity: 'error',
  },
  {
    name: 'No text-zinc-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /text-zinc-[2-6]00/,
    message: 'Use text-text-body/label/muted.',
    severity: 'error',
  },
  {
    name: 'No placeholder-gray-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /placeholder-gray-/,
    message: 'Use placeholder-text-muted.',
    severity: 'error',
  },
  {
    name: 'No placeholder-zinc-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /placeholder-zinc-/,
    message: 'Use placeholder-text-muted.',
    severity: 'error',
  },
  // Brand / Action
  {
    name: 'No bg-orange-600 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-orange-600/,
    message: 'Use bg-primary-600 or Button component.',
    severity: 'error',
  },
  {
    name: 'No bg-blue-600 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-blue-600/,
    message: 'Use bg-format-2v2-600 or Button component.',
    severity: 'error',
  },
  {
    name: 'No bg-indigo-600 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-indigo-600/,
    message: 'Use Button primary.',
    severity: 'error',
  },
  {
    name: 'No text-orange-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /text-orange-[3-6]00/,
    message: 'Use text-primary-*.',
    severity: 'error',
  },
  {
    name: 'No hover:text-orange-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /hover:text-orange-/,
    message: 'Use hover:text-primary-*.',
    severity: 'error',
  },
  {
    name: 'No focus:ring-blue-500 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /focus:ring-blue-500/,
    message: 'Use focus:ring-primary-500.',
    severity: 'error',
  },
  {
    name: 'No focus:ring-indigo-500 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /focus:ring-indigo-500/,
    message: 'Use focus:ring-primary-500.',
    severity: 'error',
  },
  {
    name: 'No focus:ring-orange-500 in routes',
    globs: [ROUTE_SVELTE],
    pattern: /focus:ring-orange-500/,
    message: 'Use focus:ring-primary-500.',
    severity: 'error',
  },
  // Status colors -> semantic tokens
  {
    name: 'No red-* in routes (use danger-*)',
    globs: [ROUTE_SVELTE],
    pattern: /(text|bg|border|ring|divide|shadow|accent)-red-\d/,
    message: 'Use danger-* token.',
    severity: 'error',
  },
  {
    name: 'No hover:*-red-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /hover:(text|bg|border)-red-\d/,
    message: 'Use hover:*-danger-* token.',
    severity: 'error',
  },
  {
    name: 'No green-* in routes (use success-*)',
    globs: [ROUTE_SVELTE],
    pattern: /(text|bg|border|ring|divide|shadow|accent)-green-\d/,
    message: 'Use success-* token.',
    severity: 'error',
  },
  {
    name: 'No hover:*-green-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /hover:(text|bg|border)-green-\d/,
    message: 'Use hover:*-success-* token.',
    severity: 'error',
  },
  {
    name: 'No yellow-* in routes (use warning-*)',
    globs: [ROUTE_SVELTE],
    pattern: /(text|bg|border|ring|divide|shadow|accent)-yellow-\d/,
    message: 'Use warning-* token.',
    severity: 'error',
  },
  {
    name: 'No hover:*-yellow-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /hover:(text|bg|border)-yellow-\d/,
    message: 'Use hover:*-warning-* token.',
    severity: 'error',
  },
  // Banned families
  {
    name: 'No emerald-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /emerald-/,
    message: 'Use success-* tokens.',
    severity: 'error',
  },
  {
    name: 'No amber-* in routes',
    globs: [ROUTE_SVELTE],
    pattern: /amber-/,
    message: 'Use warning-* tokens.',
    severity: 'error',
  },
];

// ---------------------------------------------------------------------------
// Section 3: Component pattern duplication in routes
// ---------------------------------------------------------------------------

const componentPatternChecks: Check[] = [
  {
    name: 'No inline button pattern in routes (solid)',
    globs: [ROUTE_SVELTE],
    pattern: /bg-[a-z]+-600[^"']*\shover:bg-/,
    message: 'Use <Button> component.',
    severity: 'warning',
  },
  {
    name: 'No inline button pattern in routes (soft/outline)',
    globs: [ROUTE_SVELTE],
    pattern: /bg-[a-z]+-500\/\d+[^"']*\shover:bg-[a-z]+-500\/\d+/,
    message: 'Use <Button> component.',
    severity: 'warning',
  },
  {
    name: 'No styled raw <button> in routes',
    globs: [ROUTE_SVELTE],
    pattern: /<button\b[^>]*\bclass\s*=/,
    message: 'Use <Button> component instead of raw <button> with classes.',
    severity: 'warning',
  },
  {
    name: 'No inline card pattern in routes',
    globs: [ROUTE_SVELTE],
    pattern: /<div\b[^>]*class="[^"]*bg-surface-card [^"]*border[^"]*border-default[^"]*rounded/,
    message: 'Use <Card> component.',
    severity: 'warning',
  },
  {
    name: 'No inline badge pattern in routes',
    globs: [ROUTE_SVELTE],
    pattern: /bg-[a-z]+-500\/\d+[^"']*text-[a-z]+-\d+[^"']*rounded-full/,
    message: 'Use <Badge> component.',
    severity: 'warning',
  },
  {
    name: 'No window.confirm() in routes',
    globs: [ROUTE_SVELTE],
    pattern: /[^a-zA-Z']confirm\(/,
    message: 'Use <ConfirmDialog> component.',
    severity: 'warning',
  },
];

// ---------------------------------------------------------------------------
// Section 4: Raw tokens in shared components (non-primitives)
// ---------------------------------------------------------------------------

const UI_PRIMITIVES = [
  'Button.svelte',
  'Card.svelte',
  'Badge.svelte',
  'Dialog.svelte',
  'ConfirmDialog.svelte',
  'FormInput.svelte',
  'FormSelect.svelte',
  'FormError.svelte',
  'DataTable.svelte',
  'Toast.svelte',
  'FilterBar.svelte',
  'SearchInput.svelte',
  'SelectFilter.svelte',
  'Paginator.svelte',
];

const sharedComponentChecks: Check[] = [
  {
    name: 'No bg-zinc-* in shared components',
    globs: [COMPONENT_SVELTE],
    pattern: /bg-zinc-[7-9]00/,
    message: 'Use bg-surface-* token.',
    severity: 'warning',
  },
  {
    name: 'No border-zinc-* in shared components',
    globs: [COMPONENT_SVELTE],
    pattern: /border-zinc-[78]00/,
    message: 'Use border-border-* token.',
    severity: 'warning',
  },
  {
    name: 'No text-gray-* in shared components',
    globs: [COMPONENT_SVELTE],
    pattern: /text-gray-[2-6]00/,
    message: 'Use text-text-* token.',
    severity: 'warning',
  },
  {
    name: 'No text-zinc-* in shared components',
    globs: [COMPONENT_SVELTE],
    pattern: /text-zinc-[2-6]00/,
    message: 'Use text-text-* token.',
    severity: 'warning',
  },
  {
    name: 'No raw status colors in shared components',
    globs: [COMPONENT_SVELTE],
    pattern: /(text|bg|border)-(red|green|yellow)-\d/,
    message: 'Use semantic status tokens.',
    severity: 'warning',
  },
];

// ---------------------------------------------------------------------------
// Section 5: Raw tokens in UI primitives
// ---------------------------------------------------------------------------

const primitiveChecks: Check[] = [
  {
    name: 'No emerald/amber in UI primitives',
    globs: UI_PRIMITIVES.map((f) => `src/lib/components/ui/**/${f}`),
    pattern: /(emerald|amber)-/,
    message: 'Banned color families.',
    severity: 'error',
  },
];

// ---------------------------------------------------------------------------
// Section 6: File assertions (infrastructure)
// ---------------------------------------------------------------------------

const fileAssertions: FileAssertion[] = [
  {
    name: '@theme block in app.css',
    path: 'src/app.css',
    shouldExist: true,
    message: 'Missing app.css',
    contentPattern: /@theme/,
    contentMessage: 'Missing @theme block — no design tokens defined.',
  },
  {
    name: 'Button.svelte exists',
    path: 'src/lib/components/ui/Button.svelte',
    shouldExist: true,
    message: 'Required component missing.',
  },
  {
    name: 'Card.svelte exists',
    path: 'src/lib/components/ui/Card.svelte',
    shouldExist: true,
    message: 'Required component missing.',
  },
  {
    name: 'Badge.svelte exists',
    path: 'src/lib/components/ui/Badge.svelte',
    shouldExist: true,
    message: 'Required component missing.',
  },
  {
    name: 'ConfirmDialog.svelte exists',
    path: 'src/lib/components/ui/ConfirmDialog.svelte',
    shouldExist: true,
    message: 'Required component missing.',
  },
  {
    name: 'FormDialog.svelte deleted',
    path: 'src/lib/components/ui/FormDialog.svelte',
    shouldExist: false,
    message: 'Dead code — delete this file.',
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';

async function collectFiles(globs: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const pattern of globs) {
    const glob = new Glob(pattern);
    for await (const path of glob.scan({ cwd: ROOT, absolute: true })) {
      if (!seen.has(path)) {
        seen.add(path);
        files.push(path);
      }
    }
  }
  return files;
}

function isPrimitive(filePath: string): boolean {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || '';
  return UI_PRIMITIVES.includes(name);
}

async function runCheck(check: Check, filterPrimitives?: 'exclude' | 'only'): Promise<Violation[]> {
  const violations: Violation[] = [];
  const files = await collectFiles(check.globs);

  for (const filePath of files) {
    if (filterPrimitives === 'exclude' && isPrimitive(filePath)) continue;
    if (filterPrimitives === 'only' && !isPrimitive(filePath)) continue;

    const content = await Bun.file(filePath).text();
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (check.pattern.test(lines[i])) {
        violations.push({
          file: relative(ROOT, filePath).replace(/\\/g, '/'),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }

  return violations;
}

function printSection(title: string) {
  console.log(`\n  ${CYAN}--- ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}${RESET}`);
}

function printCheckResult(name: string, violations: Violation[], severity: Severity) {
  if (violations.length === 0) {
    console.log(`  ${GREEN}✓${RESET} ${name}`);
    return;
  }

  const isWarning = severity === 'warning';
  const icon = isWarning ? `${YELLOW}⚠${RESET}` : `${RED}✗${RESET}`;
  const label = isWarning ? 'warning' : 'violation';
  console.log(
    `  ${icon} ${name} ${DIM}(${violations.length} ${label}${violations.length !== 1 ? 's' : ''})${RESET}`,
  );

  for (const v of violations) {
    console.log(`    ${DIM}${v.file}:${v.line}${RESET} ${v.text}`);
  }
}

async function main() {
  let errorCount = 0;
  let warningCount = 0;
  let passCount = 0;

  console.log(`\n${BOLD}Architecture & UI Boundary Check${RESET}`);

  // --- File assertions ---
  printSection('Infrastructure');
  for (const a of fileAssertions) {
    const fullPath = join(ROOT, a.path);
    const exists = existsSync(fullPath);

    if (a.shouldExist && !exists) {
      errorCount++;
      console.log(`  ${RED}✗${RESET} ${a.name} ${DIM}— ${a.message}${RESET}`);
      continue;
    }
    if (!a.shouldExist && exists) {
      errorCount++;
      console.log(`  ${RED}✗${RESET} ${a.name} ${DIM}— ${a.message}${RESET}`);
      continue;
    }
    if (a.contentPattern && exists) {
      const content = await Bun.file(fullPath).text();
      if (!a.contentPattern.test(content)) {
        errorCount++;
        console.log(`  ${RED}✗${RESET} ${a.name} ${DIM}— ${a.contentMessage || a.message}${RESET}`);
        continue;
      }
    }
    passCount++;
    console.log(`  ${GREEN}✓${RESET} ${a.name}`);
  }

  // --- Pattern checks by section ---
  const sections: Array<{ title: string; checks: Check[]; filter?: 'exclude' | 'only' }> = [
    { title: 'Architecture Boundaries', checks: architectureChecks },
    { title: 'Banned Raw Palette in Routes', checks: paletteChecks },
    { title: 'Component Pattern Duplication', checks: componentPatternChecks },
    { title: 'Raw Tokens in Shared Components', checks: sharedComponentChecks, filter: 'exclude' },
    { title: 'Raw Tokens in UI Primitives', checks: primitiveChecks },
  ];

  for (const section of sections) {
    printSection(section.title);
    for (const check of section.checks) {
      const violations = await runCheck(check, section.filter);

      if (violations.length === 0) {
        passCount++;
      } else if (check.severity === 'warning') {
        warningCount += violations.length;
      } else {
        errorCount += violations.length;
      }

      printCheckResult(check.name, violations, check.severity);
    }
  }

  // --- Summary ---
  console.log(`\n${'─'.repeat(60)}`);
  if (errorCount === 0 && warningCount === 0) {
    console.log(`${GREEN}All ${passCount} checks passed.${RESET}\n`);
  } else {
    const parts: string[] = [];
    if (errorCount > 0)
      parts.push(`${RED}${errorCount} error${errorCount !== 1 ? 's' : ''}${RESET}`);
    if (warningCount > 0)
      parts.push(`${YELLOW}${warningCount} warning${warningCount !== 1 ? 's' : ''}${RESET}`);
    if (passCount > 0) parts.push(`${GREEN}${passCount} passed${RESET}`);
    console.log(`${parts.join(', ')}\n`);
  }

  if (errorCount > 0) process.exit(1);
}

main();
