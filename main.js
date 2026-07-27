// Aereluna Note · Electron main process
// Owns the window, the native menu bar, real file I/O and PDF export.
// The renderer (AerelunaNote.html) stays a plain, sandboxed web page.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const IS_MAC = process.platform === "darwin";
const PAGE = "AerelunaNote.html";

/** @type {BrowserWindow|null} */
let win = null;

/** Mirror of the renderer's document state, pushed on every change. */
let docState = { dirty: false, name: "Untitled.md", path: null };

/** Set once the user has agreed to discard, or after a successful save. */
let allowClose = false;

/** A file passed on the command line or by Finder before the window exists. */
let pendingOpenPath = null;

/* ------------------------------------------------------------------ */
/* Window                                                              */
/* ------------------------------------------------------------------ */

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    backgroundColor: "#133450",   // matches the dark theme so launch does not flash
    title: "Aereluna Note",
    show: false,
    // The page draws its own Aero title bar, so keep the real traffic lights
    // floating on top of it rather than stacking two bars.
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    trafficLightPosition: IS_MAC ? { x: 13, y: 11 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, PAGE));

  win.once("ready-to-show", () => {
    win.show();
    if (pendingOpenPath) {
      loadPath(pendingOpenPath);
      pendingOpenPath = null;
    }
  });

  // The app is offline by design: refuse in-window navigation entirely and
  // hand any real link to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  win.on("close", async (e) => {
    if (allowClose || !docState.dirty) return;
    e.preventDefault();
    if (await confirmDiscard("Closing")) {
      allowClose = true;
      win.close();
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

/* ------------------------------------------------------------------ */
/* Document helpers                                                    */
/* ------------------------------------------------------------------ */

const content = () =>
  win.webContents.executeJavaScript('document.getElementById("editor").value');

const send = (payload) => {
  if (win && !win.isDestroyed()) win.webContents.send("aero:doc", payload);
};

const baseName = (p) => path.basename(p);

/** True when it is safe to throw the current document away. */
async function confirmDiscard(context) {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: `Do you want to save the changes made to “${docState.name}”?`,
    detail: `Your changes will be lost if you don't save them. (${context})`,
  });
  if (response === 2) return false;   // Cancel
  if (response === 1) return true;    // Don't Save
  return await doSave();              // Save — only continue if it succeeded
}

async function loadPath(p) {
  try {
    const text = await fs.readFile(p, "utf-8");
    docState = { dirty: false, name: baseName(p), path: p };
    send({ type: "load", path: p, name: baseName(p), content: text });
    applyWindowState();
    app.addRecentDocument(p);
  } catch (err) {
    dialog.showErrorBox("Could not open file", `${p}\n\n${err.message}`);
  }
}

function applyWindowState() {
  if (!win || win.isDestroyed()) return;
  win.setTitle(docState.name + (docState.dirty ? " — edited" : "") + " — Aereluna Note");
  if (IS_MAC) {
    win.setDocumentEdited(docState.dirty);
    win.setRepresentedFilename(docState.path || "");
  }
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function doNew() {
  if (docState.dirty && !(await confirmDiscard("New document"))) return;
  docState = { dirty: false, name: "Untitled.md", path: null };
  send({ type: "new", name: "Untitled.md", path: null });
  applyWindowState();
}

async function doOpen() {
  if (docState.dirty && !(await confirmDiscard("Opening a file"))) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Open Markdown Document",
    properties: ["openFile"],
    filters: [
      { name: "Markdown", extensions: ["md", "markdown", "mdown", "txt"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (canceled || !filePaths.length) return;
  await loadPath(filePaths[0]);
}

async function doSave() {
  if (!docState.path) return await doSaveAs();
  try {
    await fs.writeFile(docState.path, await content(), "utf-8");
    docState.dirty = false;
    send({ type: "saved", path: docState.path, name: docState.name });
    applyWindowState();
    app.addRecentDocument(docState.path);
    return true;
  } catch (err) {
    dialog.showErrorBox("Could not save file", err.message);
    return false;
  }
}

async function doSaveAs() {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Save As",
    defaultPath: docState.path || docState.name.replace(/\.(md|markdown|txt)$/i, "") + ".md",
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (canceled || !filePath) return false;
  try {
    await fs.writeFile(filePath, await content(), "utf-8");
    docState = { dirty: false, name: baseName(filePath), path: filePath };
    send({ type: "saved", path: filePath, name: docState.name });
    applyWindowState();
    app.addRecentDocument(filePath);
    return true;
  } catch (err) {
    dialog.showErrorBox("Could not save file", err.message);
    return false;
  }
}

async function doExportPdf() {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Export PDF",
    defaultPath: docState.name.replace(/\.(md|markdown|txt)$/i, "") + ".pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return;
  try {
    // Renders the whole document into the hidden print container, which the
    // @media print stylesheet swaps in for the on-screen split view. That
    // stylesheet is always light, so dark mode never leaks into the PDF.
    await win.webContents.executeJavaScript("window.__preparePrint()");
    const pdf = await win.webContents.printToPDF({
      printBackground: false,
      preferCSSPageSize: true, // honour the @page margins in the stylesheet
      pageSize: "A4",
    });
    await fs.writeFile(filePath, pdf);
    send({ type: "status", message: "Exported " + baseName(filePath) });
    shell.showItemInFolder(filePath);
  } catch (err) {
    dialog.showErrorBox("Could not export PDF", err.message);
  }
}

const COMMANDS = {
  "file:new": doNew,
  "file:open": doOpen,
  "file:save": doSave,
  "file:save-as": doSaveAs,
  "file:pdf": doExportPdf,
};

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

const toRenderer = (name) => () => win && win.webContents.send("aero:menu", name);

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(IS_MAC
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: doNew },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: doOpen },
        ...(IS_MAC
          ? [{ role: "recentDocuments", submenu: [{ role: "clearRecentDocuments" }] }]
          : []),
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: doSave },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: doSaveAs },
        { type: "separator" },
        { label: "Export as PDF…", accelerator: "CmdOrCtrl+P", click: doExportPdf },
        ...(IS_MAC ? [] : [{ type: "separator" }, { role: "quit" }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        // Routed to the renderer's own history stack — the native undo role
        // would only see the textarea's stack, which our edits invalidate.
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: toRenderer("edit:undo") },
        { label: "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: toRenderer("edit:redo") },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Format",
      submenu: [
        { label: "Bold", accelerator: "CmdOrCtrl+B", click: toRenderer("format:bold") },
        { label: "Italic", accelerator: "CmdOrCtrl+I", click: toRenderer("format:italic") },
        { label: "Underline", accelerator: "CmdOrCtrl+U", click: toRenderer("format:underline") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Dark Mode", accelerator: "CmdOrCtrl+Shift+D",
          click: toRenderer("view:toggle-theme") },
        { label: "Reset Split to 61.8%", accelerator: "CmdOrCtrl+0",
          click: toRenderer("view:reset-split") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

ipcMain.handle("aero:command", (_e, name) => {
  const fn = COMMANDS[name];
  return fn ? fn() : undefined;
});

ipcMain.on("aero:state", (_e, state) => {
  docState = {
    dirty: !!state.dirty,
    name: state.name || docState.name,
    path: state.path !== undefined ? state.path : docState.path,
  };
  applyWindowState();
});

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

// Double-clicking a .md file in Finder fires this, possibly before ready.
app.on("open-file", (e, p) => {
  e.preventDefault();
  if (win) loadPath(p);
  else pendingOpenPath = p;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = argv.slice(1).find((a) => /\.(md|markdown|txt)$/i.test(a));
    if (f) loadPath(path.resolve(f));
  });

  app.whenReady().then(() => {
    const f = process.argv.slice(1).find((a) => /\.(md|markdown|txt)$/i.test(a));
    if (f) pendingOpenPath = path.resolve(f);
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (!IS_MAC) app.quit();
});
