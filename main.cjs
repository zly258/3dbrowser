const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// 移除原生菜单
Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // 允许加载本地资源
      devTools: isDev // 仅在开发模式下允许控制台
    },
    titleBarStyle: 'hiddenInset', // macOS 风格交通灯
    frame: process.platform === 'darwin' ? true : false, // Windows/Linux 使用无边框
    backgroundColor: '#1E1E1E',
    icon: path.join(__dirname, 'public/favicon.ico')
  });

  // 处理窗口控制
  ipcMain.on('window-min', () => win.minimize());
  ipcMain.on('window-max', () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });
  ipcMain.on('window-close', () => win.close());

  // 使用 127.0.0.1 替代 localhost 避免 host 劫持或解析问题
  const startUrl = isDev 
    ? 'http://127.0.0.1:5173' 
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  win.loadURL(startUrl);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
