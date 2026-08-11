const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// During `expo export` / `eas update`, Metro's hasher needs access to pnpm
// store files whose SHA-1 it can't compute unless they're in a watched folder.
// During the dev server we must NOT watch the whole pnpm store — Replit temp
// files in other workspace dirs cause inotify watch-limit crashes.
// Detect the export mode by checking the process argv.
// expo export  → argv contains 'export'
// expo export:embed (EAS build) → argv contains 'export:embed'
const isExportMode = process.argv.some((a) => a === 'export' || a === 'export:embed');

config.watchFolders = isExportMode
  ? [
      path.resolve(workspaceRoot, 'lib'),
      path.resolve(workspaceRoot, 'node_modules', '.pnpm'),
    ]
  : [
      path.resolve(workspaceRoot, 'lib'),
    ];

// Resolve packages from both the artifact's own node_modules and the root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// When `expo export` (used by `eas update`) runs, Metro resolves the app
// entry from the workspace root instead of projectRoot. pnpm symlink targets
// stored as relative paths then point to the wrong location.
// This custom resolver intercepts any module Metro can't find through its
// normal paths and retries the lookup anchored to the app's own node_modules.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Try default resolution first (works for the dev server).
  try {
    const result = originalResolveRequest
      ? originalResolveRequest(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
    if (result) return result;
  } catch {
    // fall through to manual retry below
  }

  // Fallback: resolve using absolute node_modules paths so that pnpm symlinks
  // are followed correctly regardless of Metro's perceived project root.
  const searchBases = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ];
  for (const base of searchBases) {
    try {
      const resolved = require.resolve(moduleName, { paths: [base] });
      return { filePath: resolved, type: 'sourceFile' };
    } catch {
      // not found in this base; try next
    }
  }

  // Nothing worked — re-throw to get Metro's normal error message.
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
