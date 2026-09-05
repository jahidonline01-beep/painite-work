import { app, BrowserWindow, Menu, MenuItem, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (data && typeof data.width === 'number' && typeof data.height === 'number') {
        return data;
      }
    }
  } catch {
    // ignore
  }
  return { width: 1280, height: 800, x: undefined, y: undefined, isMaximized: false };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // silent
  }
}

/** Native Windows-style right-click menu (Cut / Copy / Paste / Select All) */
function attachNativeContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    let hasItems = false;

    if (params.isEditable) {
      menu.append(new MenuItem({
        label: 'Cut',
        role: 'cut',
        enabled: params.editFlags.canCut,
      }));
      menu.append(new MenuItem({
        label: 'Copy',
        role: 'copy',
        enabled: params.editFlags.canCopy,
      }));
      menu.append(new MenuItem({
        label: 'Paste',
        role: 'paste',
        enabled: params.editFlags.canPaste,
      }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Select All',
        role: 'selectAll',
        enabled: params.editFlags.canSelectAll,
      }));
      hasItems = true;
    } else if (params.selectionText && params.selectionText.trim().length > 0) {
      menu.append(new MenuItem({
        label: 'Copy',
        role: 'copy',
      }));
      hasItems = true;
    }

    if (params.linkURL) {
      if (hasItems) menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Copy Link',
        click: () => {
          clipboard.writeText(params.linkURL);
        },
      }));
      hasItems = true;
    }

    if (hasItems) {
      menu.popup({ window: win });
    }
  });
}


// Allow <webview> guests to load external OTP inbox URLs (555api etc.)
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(() => ({ action: 'allow' }));
    contents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(true);
    });
    contents.on('will-navigate', (e, url) => {
      // allow all navigations inside OTP inbox webview
      if (!/^https?:\/\//i.test(url) && url !== 'about:blank') {
        e.preventDefault();
      }
    });
  }
});

function createWindow() {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width: Math.max(280, state.width || 1280),
    height: Math.max(200, state.height || 800),
    x: typeof state.x === 'number' ? state.x : undefined,
    y: typeof state.y === 'number' ? state.y : undefined,
    minWidth: 280,
    minHeight: 200,
    title: 'Painite Work',
    autoHideMenuBar: true,
    backgroundColor: '#07060c',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  // Show when content is ready — no white flash / middle streak
  win.once('ready-to-show', () => {
    if (state.isMaximized) win.maximize();
    win.show();
  });

  const persist = () => saveWindowState(win);
  win.on('resize', persist);
  win.on('move', persist);
  win.on('close', persist);

  const nudgeLayout = () => {
    try {
      win.webContents
        .executeJavaScript("window.dispatchEvent(new Event('pw-layout-refresh'));", true)
        .catch(() => {});
    } catch (_) {}
  };
  win.on('maximize', nudgeLayout);
  win.on('unmaximize', nudgeLayout);

  attachNativeContextMenu(win);

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:3000');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
