const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch only the lib/ packages the mobile app depends on, not the entire root.
// Watching the whole root causes Metro to crash when Replit temp files are
// created/deleted inside .local/ or other non-source directories.
config.watchFolders = [
  path.resolve(workspaceRoot, 'lib'),
];

// Resolve packages from both the artifact's own node_modules and the root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
