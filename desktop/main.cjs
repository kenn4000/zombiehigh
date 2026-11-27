'use strict';

const { app, BrowserWindow, Menu, dialog, session } = require('electron');
const { startLocalServer } = require('./local-server.cjs');
const path = require('node:path');

app.setName('Zombie High');
app.setAppUserModelId('com.zombiehigh.game');
let local;
let stopping = false;
let onlineOrigin;
function readOnlineOrigin() {
  let raw = process.env.ZOMBIEHIGH_SERVER_URL;
  try { raw ||= require('./online-origin.json').url; } catch {}
  if (!raw) return;
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Online server must be a trusted HTTPS origin');
  return u.origin;
}
const prefs = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true };

function isGamePage(raw) {
  try {
    const url = new URL(raw);
    return local && (url.origin === local.origin || url.origin === onlineOrigin)
      && (url.pathname === '/' || /^\/(game|spectator)\/[^/]+\/?$/.test(url.pathname));
  } catch { return false; }
}

app.on('web-contents-created', (_event, contents) => {
  for (const name of ['will-navigate', 'will-redirect']) {
    contents.on(name, (event, url) => {
      if (!isGamePage(event.url || url)) event.preventDefault();
    });
  }
  contents.on('will-attach-webview', event => event.preventDefault());
  // Lobby links intentionally open independent player windows. Only allow local
  // game routes; the existing Vue frontend is otherwise unchanged.
  contents.setWindowOpenHandler(({ url }) => isGamePage(url)
    ? { action: 'allow', overrideBrowserWindowOptions: {
        width: 1440, height: 900, minWidth: 960, minHeight: 600,
        autoHideMenuBar: true, webPreferences: prefs
      } }
    : { action: 'deny' });
});

async function launch() {
  local = await startLocalServer(app.getAppPath());
  onlineOrigin = readOnlineOrigin();
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' && isGamePage(contents.getURL()));
  });
  const window = new BrowserWindow({
    title: 'Zombie High', width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#171717', autoHideMenuBar: true, webPreferences: prefs
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      window.setFullScreen(!window.isFullScreen());
      event.preventDefault();
    }
  });
  const smoke = process.argv.includes('--desktop-smoke');
  if (onlineOrigin && !smoke) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Play',submenu:[
      {label:'Online front desk',click:()=>window.loadURL(onlineOrigin+'/')},
      {label:'Offline front desk',click:()=>window.loadURL(local.origin+'/')},
      {role:'quit'}
    ]}]));
    await window.loadURL(onlineOrigin+'/').catch(()=>window.loadURL(local.origin+'/'));
  } else {
    Menu.setApplicationMenu(null);
    await window.loadURL(local.origin + '/');
  }
  if (process.argv.includes('--desktop-smoke')) {
    // CI verifies the packaged runtime actually mounts the existing Vue lobby.
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
      ready = await window.webContents.executeJavaScript(
        "Boolean(document.querySelector('.lobby .title')) && document.querySelector('.lobby .title').textContent.includes('Zombie High')"
      );
      if (!ready) await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Desktop smoke: Vue lobby failed to mount');
    app.quit();
  }
}

app.whenReady().then(launch).catch(error => {
  console.error(error);
  if (!process.argv.includes('--desktop-smoke')) dialog.showErrorBox('Zombie High could not start', String(error));
  app.exit(1);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (stopping || !local) return;
  event.preventDefault();
  stopping = true;
  // No save semantics are added in this pass; game sessions remain in memory.
  local.close().finally(() => app.exit(0));
});
