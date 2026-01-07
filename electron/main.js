const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hiddenInset', // Mac style integrated title bar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, '../public/icon.png') // We'll need an icon later
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // win.webContents.openDevTools(); // Optional: Open DevTools
  } else {
    // In production, load the built index.html
    win.loadFile(path.join(__dirname, '../dist/index.html'));
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
