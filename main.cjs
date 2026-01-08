const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const url = require('url');

// 使用 app.isPackaged 替代 electron-is-dev，减少打包后的依赖问题
const isDev = !app.isPackaged;

// 移除原生菜单
Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      devTools: true // 允许在打包后也开启控制台调试（可选，根据需求）
    },
    titleBarStyle: 'hidden',
    frame: false,
    backgroundColor: '#1E1E1E',
  });

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
    // 如果是打包后的环境且加载失败，尝试检查路径
    if (!isDev) {
      dialog.showErrorBox('页面加载失败', `错误代码: ${errorCode}\n错误描述: ${errorDescription}\n尝试加载的URL: ${validatedURL}`);
    }
  });

  // 注册 F12 快捷键
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      win.webContents.toggleDevTools();
    }
  });

  // 优化路径处理，确保在 Windows 上的兼容性
  const indexPaths = [
    path.join(__dirname, 'dist', 'index.html'),
    path.join(__dirname, 'index.html')
  ];

  let startUrl = isDev ? 'http://127.0.0.1:5173' : '';
  
  if (!isDev) {
    // 尝试寻找 index.html
    const existingPath = indexPaths.find(p => {
      try {
        return require('fs').existsSync(p);
      } catch (e) {
        return false;
      }
    });

    if (existingPath) {
      startUrl = url.format({
        pathname: existingPath,
        protocol: 'file:',
        slashes: true
      });
    } else {
      console.error('Could not find index.html in:', indexPaths);
    }
  }

  if (startUrl) {
    win.loadURL(startUrl);
  } else if (!isDev) {
    dialog.showErrorBox('启动错误', '找不到应用程序入口文件 index.html');
  }
}

// 确保只运行一个实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC 通讯逻辑
ipcMain.on('window-min', () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on('window-max', () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window-close', () => BrowserWindow.getFocusedWindow()?.close());
