const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bajeti-ota-'));
const domain = process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN;

if (!domain) {
  throw new Error(
    'OTA export check requires EXPO_PUBLIC_DOMAIN or REPLIT_DEV_DOMAIN so the bundle cannot silently contain an empty API URL.',
  );
}

console.log(`Checking Android OTA export in ${outputDir}`);

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'expo',
    'export',
    '--platform',
    'android',
    '--output-dir',
    outputDir,
    '--no-bytecode',
    '--dump-assetmap',
    '--clear',
  ],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      EXPO_PUBLIC_DOMAIN: domain,
      EXPO_PUBLIC_REPL_ID: process.env.EXPO_PUBLIC_REPL_ID || process.env.REPL_ID || 'ota-check',
    },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`Android OTA export failed with exit code ${result.status ?? 'unknown'}.`);
}

const androidBundleDir = path.join(outputDir, '_expo', 'static', 'js', 'android');
const bundles = fs.existsSync(androidBundleDir)
  ? fs.readdirSync(androidBundleDir).filter((name) => name.endsWith('.js'))
  : [];

if (bundles.length === 0) {
  throw new Error(`Android OTA export produced no JavaScript bundle in ${androidBundleDir}.`);
}

for (const bundle of bundles) {
  const size = fs.statSync(path.join(androidBundleDir, bundle)).size;
  if (size < 100_000) {
    throw new Error(`Android OTA bundle ${bundle} is unexpectedly small (${size} bytes).`);
  }
}

for (const requiredFile of ['assetmap.json', 'metadata.json']) {
  if (!fs.existsSync(path.join(outputDir, requiredFile))) {
    throw new Error(`Android OTA export is missing ${requiredFile}.`);
  }
}

console.log(`OTA export check passed: ${bundles.join(', ')}`);