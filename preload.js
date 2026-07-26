const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petdesk", {
  getState: () => ipcRenderer.invoke("state:get"),
  replaceState: (state) => ipcRenderer.invoke("state:replace", state),
  openPanel: () => ipcRenderer.invoke("panel:open"),
  petAction: (action) => ipcRenderer.invoke("pet:action", action),
  setPetVisibility: (visible) => ipcRenderer.invoke("pet:visibility", visible),
  togglePet: () => ipcRenderer.invoke("pet:toggle"),
  quit: () => ipcRenderer.invoke("app:quit"),
  startFocus: (seconds) => ipcRenderer.invoke("focus:start", seconds),
  pauseFocus: () => ipcRenderer.invoke("focus:pause"),
  completeFocus: () => ipcRenderer.invoke("focus:complete"),
  pickImage: () => ipcRenderer.invoke("image:pick"),
  saveCustomImage: (data) => ipcRenderer.invoke("image:save-custom", data),
  aiTransform: (data) => ipcRenderer.invoke("image:ai-transform", data),
  setStartup: (enabled) => ipcRenderer.invoke("settings:startup", enabled),
  loadWeather: (query) => ipcRenderer.invoke("weather:load", query),
  onState: (callback) => ipcRenderer.on("state:changed", (_, state) => callback(state)),
  onPetAction: (callback) => ipcRenderer.on("pet:action", (_, action) => callback(action)),
  onPetSpeak: (callback) => ipcRenderer.on("pet:speak", (_, payload) => callback(payload)),
});
