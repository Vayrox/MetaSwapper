const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pickFiles: () => ipcRenderer.invoke("pick-files"),
  addFiles: (paths) => ipcRenderer.invoke("add-files", paths),
  getQueue: () => ipcRenderer.invoke("get-queue"),
  getJob: (id) => ipcRenderer.invoke("get-job", id),
  deleteJob: (id) => ipcRenderer.invoke("delete-job", id),
  saveFile: (id) => ipcRenderer.invoke("save-file", id),
  saveAll: () => ipcRenderer.invoke("save-all"),
});
