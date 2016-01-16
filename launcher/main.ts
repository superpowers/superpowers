/// <reference path="../typings/tsd.d.ts" />

import * as electron from "electron";

import * as _ from "lodash";
import * as async from "async";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as mkdirp from "mkdirp";

const { superpowers: { appApiVersion: appApiVersion } } = JSON.parse(fs.readFileSync(`${__dirname}/../package.json`, { encoding: "utf8" }));

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: GitHubElectron.BrowserWindow;

electron.app.on("window-all-closed", function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") electron.app.quit();
});

electron.app.on("ready", function() {
  mainWindow = new electron.BrowserWindow({
    title: "Superpowers", icon: `${__dirname}/public/images/icon.png`,
    width: 800, height: 480,
    frame: false, resizable: false
  });
  if (process.platform !== "darwin") mainWindow.setMenuBarVisibility(false);
  else setupOSXAppMenu();
  mainWindow.loadURL(`file://${__dirname}/public/index.html`);
  mainWindow.on("closed", function() { mainWindow = null; });
});

function setupOSXAppMenu() {
  const template: GitHubElectron.MenuItemOptions[] = [
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
        { label: "Select All", accelerator: "CmdOrCtrl+A", role: "selectall" },
      ]
    },
    {
      label: "Window",
      role: "window",
      submenu: [
        { label: "Minimize", accelerator: "CmdOrCtrl+M", role: "minimize" },
        { label: "Close", accelerator: "CmdOrCtrl+W", role: "close" },
        { type: "separator" },
        { label: "Bring All to Front", role: "front" }
      ]
    },
    {
      label: "Help",
      role: "help",
      submenu: [
        { label: "Website", click: function() { electron.shell.openExternal("http://superpowers-html5.com"); } },
        { label: "Documentation", click: function() { electron.shell.openExternal("http://docs.superpowers-html5.com"); } },
      ]
    },
  ];

  const appName = electron.app.getName();
  template.unshift({
      label: appName,
      role: null,
      submenu: [
        { label: `About ${appName}`, role: "about" },
        { type: "separator" },
        { label: "Services", role: "services", submenu: [] },
        { type: "separator" },
        { label: `Hide ${appName}`, accelerator: "Command+H", role: "hide" },
        { label: "Hide Others", accelerator: "Command+Shift+H", role: "hideothers" },
        { label: "Show All", role: "unhide" },
        { type: "separator" },
        { label: "Quit", accelerator: "Command+Q", click: () => { electron.app.quit(); } },
    ]
  });

  const menu = electron.Menu.buildFromTemplate(template);
  electron.Menu.setApplicationMenu(menu);
}

interface OpenServer { window: GitHubElectron.BrowserWindow; address: string; closed: boolean; }
const openServersById: { [id: string]: OpenServer } = {};
electron.ipcMain.on("new-server-window", (event: Event, address: string) => {
  const openServer = {
    window: new electron.BrowserWindow({
      title: "Superpowers", icon: `${__dirname}/public/images/icon.png`,
      width: 1000, height: 600,
      minWidth: 800, minHeight: 480,
      frame: false
    }),
    address,
    closed: false
  };
  openServer.window.setMenuBarVisibility(false);
  openServersById[openServer.window.id] = openServer;

  openServer.window.on("close", () => {
    openServer.closed = true;
    openServer.window.webContents.removeAllListeners();
    delete openServersById[openServer.window.id];
  });

  const status = `Connecting to ${openServer.address}...`;
  openServer.window.loadURL(`file://${__dirname}/public/connectionStatus.html?status=${encodeURIComponent(status)}&address=${encodeURIComponent(openServer.address)}`);

  openServer.window.webContents.addListener("did-finish-load", onServerWindowLoaded);
  function onServerWindowLoaded(event: Event) {
    openServer.window.webContents.removeListener("did-finish-load", onServerWindowLoaded);
    connect(openServersById[openServer.window.id]);
  }
});

function connect(openServer: OpenServer) {
  http.get(`http://${openServer.address}/superpowers.json`, (res) => {
    let content = "";
    res.on("data", (chunk: string) => { content += chunk; });

    res.on("end", () => {
      let serverInfo: { version: string; appApiVersion: number; } = null;
      if (res.statusCode === 200) {
        try { serverInfo = JSON.parse(content); } catch (err) { /* Ignore */ }
      }

      if (serverInfo == null) {
        showError(`The server at ${openServer.address} doesn't seem to be running Superpowers.`);
        return;
      }

      if (serverInfo.appApiVersion !== appApiVersion) {
        showError(`The server at ${openServer.address} runs an incompatible version of Superpowers ` +
        `(got app API version ${serverInfo.appApiVersion}, expected ${appApiVersion}).`);
        return;
      }

      openServer.window.loadURL(`http://${openServer.address}`);
      openServer.window.webContents.addListener("did-finish-load", onServerLoaded);
      openServer.window.webContents.addListener("did-fail-load", onServerFailed);
    });
  })
  .on("error", (err: Error) => {
    showError(`Could not connect to ${openServer.address} (${err.message}).`);
    // TODO: Add help link!
  });

  function onServerLoaded(event: Event) {
    openServer.window.webContents.removeListener("did-finish-load", onServerLoaded);
    openServer.window.webContents.removeListener("did-fail-load", onServerFailed);
  }

  function onServerFailed(event: Event) {
    openServer.window.webContents.removeListener("did-finish-load", onServerLoaded);
    openServer.window.webContents.removeListener("did-fail-load", onServerFailed);

    showError(`Could not connect to ${openServer.address}.`);
    // TODO: Add help link!
  }

  function showError(error: string) {
    // NOTE: As of Electron v0.35.1, if we don't wrap the call to loadUrl
    // in a callback, the app closes unexpectedly most of the time.
    setTimeout(() => {
      if (openServer.closed) return;
      openServer.window.loadURL(`file://${__dirname}/public/connectionStatus.html?status=${encodeURIComponent(error)}&address=${encodeURIComponent(openServer.address)}&reload=true`);
    }, 0);
  }
}

const standaloneWindowsById:  { [id: string]: GitHubElectron.BrowserWindow } = {};
electron.ipcMain.on("new-standalone-window", (event: Event, address: string, title: string) => {
  const standaloneWindow = new electron.BrowserWindow({
    title, icon: `${__dirname}/public/images/icon.png`,
    width: 1000, height: 600,
    minWidth: 800, minHeight: 480,
    autoHideMenuBar: true
  });

  const windowId = standaloneWindow.id;
  standaloneWindowsById[windowId] = standaloneWindow;

  standaloneWindow.on("closed", () => { delete standaloneWindowsById[windowId]; });
  standaloneWindow.loadURL(address);
});

electron.ipcMain.on("reconnect", (event: Event, id: string) => { connect(openServersById[id]); });

electron.ipcMain.on("choose-export-folder", (event: { sender: any }) => {
  electron.dialog.showOpenDialog({ properties: ["openDirectory"] }, (directory: string[]) => {
    if (directory == null) return;

    const outputFolder = directory[0];
    let isFolderEmpty = false;
    try { isFolderEmpty = fs.readdirSync(outputFolder).length === 0; }
    catch (e) { event.sender.send("export-folder-failed", `Error while checking if folder was empty: ${e.message}`); return; }
    if (!isFolderEmpty) { event.sender.send("export-folder-failed", "Output folder must be empty."); return; }

    event.sender.send("export-folder-success", outputFolder);
  });
});

interface ExportData {
  projectId: string; buildId: string;
  address: string; mainPort: string; buildPort: string;
  outputFolder: string; files: string[];
}
electron.ipcMain.on("export", (event: { sender: any }, data: ExportData) => {
  const exportWindow = new electron.BrowserWindow({
    title: "Superpowers", icon: `${__dirname}/public/images/icon.png`,
    width: 1000, height: 600,
    minWidth: 800, minHeight: 480
  });
  exportWindow.setMenuBarVisibility(false);
  exportWindow.loadURL(`${data.address}:${data.mainPort}/build.html`);

  const doExport = () => {
    exportWindow.webContents.removeListener("did-finish-load", doExport);
    exportWindow.webContents.send("setText", { title: "Superpowers — Exporting...", text: "Exporting..." });

    exportWindow.setProgressBar(0);
    let progress = 0;
    const progressMax = data.files.length;
    const buildPath = `/builds/${data.projectId}/${data.buildId}`;
    const systemsPath = "/systems/";

    async.eachLimit(data.files, 10, (file: string, cb: (err: Error) => any) => {

      let outputFilename = file;
      if (_.startsWith(outputFilename, buildPath)) {
        // Project build files are served on the build port
        outputFilename = outputFilename.substr(buildPath.length);
        file = `${data.address}:${data.buildPort}${file}`;
      } else {
        // Other files are served on the main port
        file = `${data.address}:${data.mainPort}${file}`;

        if (_.startsWith(outputFilename, systemsPath)) {
          // Output system files at the root
          outputFilename = outputFilename.substr(outputFilename.indexOf("/", systemsPath.length));
        }
      }
      outputFilename = outputFilename.replace(/\//g, path.sep);

      const outputPath = `${data.outputFolder}${outputFilename}`;
      exportWindow.webContents.send("setText", { text: outputPath });

      http.get(file, (response) => {
        mkdirp(path.dirname(outputPath), (err: Error) => {
          const localFile = fs.createWriteStream(outputPath);
          localFile.on("finish", () => {
            progress++;
            exportWindow.setProgressBar(progress / progressMax);
            cb(null);
          });
          response.pipe(localFile);
        });
      }).on("error", cb);
    } , (err: Error) => {
      exportWindow.setProgressBar(-1);
      if (err != null) { alert(err); return; }
      exportWindow.webContents.send("setText", { title: "Superpowers — Exported", text: "Exported to ", showItemInFolder: { text: data.outputFolder, target: data.outputFolder } } );
    });
  };
  exportWindow.webContents.addListener("did-finish-load", doExport);
});

