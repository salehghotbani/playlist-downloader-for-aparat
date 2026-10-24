import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildExtensions } from '../scripts/build.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function outputRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'aparat-build-'));
  t.after(async () => {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unsafe test cleanup path');
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test('builds installable browser-specific folders without shipping development files', async (t) => {
  const root = await outputRoot(t);
  const directories = await buildExtensions({ outputRoot: root });
  assert.equal(directories.length, 3);
  const source = await json(new URL('../manifest.json', import.meta.url));
  const manifests = {};
  for (const browser of ['firefox', 'chrome', 'edge']) {
    const directory = join(root, browser);
    const manifest = manifests[browser] = await json(join(directory, 'manifest.json'));
    assert.equal(manifest.version, source.version);
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.permissions, source.permissions);
    assert.deepEqual(manifest.host_permissions, source.host_permissions);
    assert.deepEqual(manifest.icons, source.icons);
    const paths = [
      ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon),
      ...(manifest.background.scripts ?? [manifest.background.service_worker]),
      'app.html', 'app.js', 'api.js', 'downloads.js', 'lib.js', 'i18n.js', 'boot.js', 'app.css',
      'fonts/Vazirmatn-VariableFont_wght.ttf', 'fonts/OFL.txt',
      'locales/fa.json', 'locales/en.json', '_locales/en/messages.json', '_locales/fa/messages.json',
    ];
    for (const path of paths) assert.ok((await stat(join(directory, path))).isFile(), `${browser}/${path}`);
    const listing = await readdir(directory);
    for (const excluded of ['tests', 'scripts', 'manifests', '.git', 'README.md', 'package.json', 'docs']) {
      assert.ok(!listing.includes(excluded), `${browser}: should not contain ${excluded}`);
    }
  }
  assert.deepEqual(manifests.firefox, source);
  assert.deepEqual(manifests.chrome, manifests.edge);
  assert.deepEqual(manifests.chrome.background, { service_worker: 'background.js' });
  assert.equal(manifests.chrome.minimum_chrome_version, '123');
  assert.equal('browser_specific_settings' in manifests.chrome, false);
});

test('rebuilding one target removes stale generated files and preserves other targets', async (t) => {
  const root = await outputRoot(t);
  await buildExtensions({ outputRoot: root });
  await writeFile(join(root, 'chrome', 'stale.js'), 'old');
  await writeFile(join(root, 'edge', 'keep.txt'), 'keep');
  const outputs = await buildExtensions({ target: 'chrome', outputRoot: root });
  assert.deepEqual(outputs, [join(root, 'chrome')]);
  assert.ok(!(await readdir(outputs[0])).includes('stale.js'));
  assert.equal(await readFile(join(root, 'edge', 'keep.txt'), 'utf8'), 'keep');
});

test('invalid build targets fail without creating output folders', async (t) => {
  const root = await outputRoot(t);
  await assert.rejects(buildExtensions({ target: '../invalid', outputRoot: root }), /Unknown browser/);
  assert.deepEqual(await readdir(root), []);
});
