// Aereluna Note · preload
// The renderer runs with contextIsolation on and nodeIntegration off.
// This is the entire surface it gets — no fs, no require, no ipcRenderer.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aero", {
  isApp: true,
  platform: process.platform,

  // renderer → main : run a named command (file:open, file:save, …)
  command: (name) => ipcRenderer.invoke("aero:command", name),

  // renderer → main : keep the window title, edited dot and proxy icon in sync
  pushState: (state) => ipcRenderer.send("aero:state", state),

  // main → renderer : a menu item was chosen
  onCommand: (cb) => ipcRenderer.on("aero:menu", (_e, name) => cb(name)),

  // main → renderer : a document was loaded, saved or reset
  onDoc: (cb) => ipcRenderer.on("aero:doc", (_e, payload) => cb(payload)),
});
