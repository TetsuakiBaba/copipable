const { app, BrowserWindow, globalShortcut, clipboard, nativeImage, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.on('closed', () => mainWindow = null);
    return mainWindow;
}

app.whenReady().then(() => {
    mainWindow = createWindow();
    // グローバルショートカット登録
    globalShortcut.unregisterAll();
    const keys = [...Array(10).keys()].map(i => String(i));
    // コピー操作: CommandOrControl+0-9 → renderer の onRequestNote 経由でメインに deliver-note が来る
    keys.forEach(key => {
        const accelerator = `CommandOrControl+${key}`;
        const registered = globalShortcut.register(accelerator, () => {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('request-note', key);
            }
        });
        if (!registered) console.warn(`Failed to register global shortcut: ${accelerator}`);
    });
    // ペースト操作: CommandOrControl+Shift+0-9
    keys.forEach(key => {
        const accelerator = `CommandOrControl+Shift+${key}`;
        const registered = globalShortcut.register(accelerator, () => {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('paste-note', key);
            }
        });
        if (!registered) console.warn(`Failed to register global shortcut: ${accelerator}`);
    });
});

// レンダラーからの deliver-note で実際にクリップボードに書き込む
ipcMain.on('deliver-note', (event, key, type, content) => {
    if (type === 'text') {
        clipboard.writeText(content);
    } else if (type === 'image') {
        const img = nativeImage.createFromDataURL(content);
        clipboard.writeImage(img);
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});