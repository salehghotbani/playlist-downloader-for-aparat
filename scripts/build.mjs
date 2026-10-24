import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const targets = ['firefox', 'chrome', 'edge'];
const files = [
  'app.html', 'app.css', 'app.js', 'api.js', 'background.js', 'boot.js',
  'downloads.js', 'i18n.js', 'lib.js', '_locales', 'locales', 'icons', 'fonts',
];

export async function buildExtensions({ target = 'all', outputRoot = resolve(projectRoot, 'dist') } = {}) {
  if (target !== 'all' && !targets.includes(target)) throw new Error(`Unknown browser: ${target}`);
  const base = JSON.parse(await readFile(resolve(projectRoot, 'manifest.json'), 'utf8'));
  const chromium = JSON.parse(await readFile(resolve(projectRoot, 'manifests/chromium.json'), 'utf8'));
  const outputs = [];
  for (const browser of target === 'all' ? targets : [target]) {
    const manifest = structuredClone(base);
    if (browser !== 'firefox') {
      Object.assign(manifest, chromium);
      delete manifest.browser_specific_settings;
    }
    const root = resolve(outputRoot);
    const directory = resolve(root, browser);
    // Only replace a known generated browser folder directly inside the output root.
    if (dirname(directory) !== root || directory === projectRoot) throw new Error('Unsafe build path');
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    for (const file of files) await cp(resolve(projectRoot, file), resolve(directory, file), { recursive: true });
    await writeFile(resolve(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    outputs.push(directory);
  }
  return outputs;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    for (const directory of await buildExtensions({ target: process.argv[2] ?? 'all' })) console.log(directory);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
