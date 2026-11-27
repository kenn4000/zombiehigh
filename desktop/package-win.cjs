'use strict';

// Build an unpacked Steam depot, not an installer. Windows x64 only.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const electronVersion = '45.5.0';
const output = path.join(root, 'build', 'steam');
const runtimeDir = path.join(output, 'electron-runtime');
const depot = path.join(output, 'ZombieHigh-win32-x64');
const staged = path.join(depot, 'resources', 'app');

function npm(args, cwd, env = process.env) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error('Run using npm run desktop:build');
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('npm ' + args.join(' ') + ' failed: ' + result.status);
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Use a Windows x64 machine or the Windows GitHub Actions workflow.');
}
// Compile the exact existing engine and UI; do not change browser build scripts.
npm(['run', 'build'], root, { ...process.env, NODE_ENV: 'production' });
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(path.join(runtimeDir, 'package.json'), JSON.stringify({ name: 'zombie-high-electron-runtime', version: '1.0.0', private: true }));
npm(['install', '--no-save', '--no-package-lock', 'electron@' + electronVersion], runtimeDir, {
  ...process.env, npm_config_ignore_scripts: 'false'
});
// Electron may defer binary download until the CLI is first invoked.
const electronModule = path.join(runtimeDir, 'node_modules', 'electron');
const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_SKIP_BINARY_DOWNLOAD;
delete electronEnv.npm_config_ignore_scripts;
if (!fs.existsSync(path.join(electronModule, 'dist', 'electron.exe'))) {
  const install = spawnSync(process.execPath, [path.join(electronModule, 'install.js')], {cwd: electronModule, env: electronEnv, stdio:'inherit'});
  if (install.status !== 0 || install.error) throw new Error('Electron binary install failed: ' + (install.error || install.status));
}
fs.cpSync(path.join(electronModule, 'dist'), depot, { recursive: true });
fs.renameSync(path.join(depot, 'electron.exe'), path.join(depot, 'ZombieHigh.exe'));
if (fs.existsSync(path.join(depot, 'electron_wer.dll'))) {
  fs.renameSync(path.join(depot, 'electron_wer.dll'), path.join(depot, 'ZombieHigh_wer.dll'));
}
fs.rmSync(path.join(depot, 'resources', 'default_app.asar'), { force: true });
fs.mkdirSync(staged, { recursive: true });
const copy = (src, dest) => fs.cpSync(src, dest, { recursive: true, filter: file => !file.endsWith('.map') });
copy(path.join(root, 'build', 'server'), path.join(staged, 'build', 'server'));
copy(path.join(root, 'dist'), path.join(staged, 'dist'));
copy(path.join(root, 'public'), path.join(staged, 'public'));
fs.mkdirSync(path.join(staged, 'desktop'));
for (const name of ['main.cjs', 'local-server.cjs']) {
  fs.copyFileSync(path.join(__dirname, name), path.join(staged, 'desktop', name));
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
manifest.main = 'desktop/main.cjs';
manifest.productName = 'Zombie High';
manifest.private = true;
fs.writeFileSync(path.join(staged, 'package.json'), JSON.stringify(manifest, null, 2));
fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(staged, 'package-lock.json'));
if (process.env.ZOMBIEHIGH_SERVER_URL) fs.writeFileSync(path.join(staged,'desktop','online-origin.json'),JSON.stringify({url:process.env.ZOMBIEHIGH_SERVER_URL}));
npm(['ci', '--omit=dev'], staged, { ...process.env, NODE_ENV: 'production' });
console.log('Steam depot candidate: ' + depot);
