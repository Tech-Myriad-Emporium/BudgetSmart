// Preload: expose a tiny, safe bridge to the web UI under window.budgetsmart.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("budgetsmart", {
  isDesktop: true,
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  /** Subscribe to menu/tray navigation hints. Returns an unsubscribe fn. */
  onNavigate: (handler) => {
    const listener = (_e, route) => handler(route);
    ipcRenderer.on("navigate", listener);
    return () => ipcRenderer.removeListener("navigate", listener);
  },
  /** Ask the main process to raise an OS notification. */
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
});
