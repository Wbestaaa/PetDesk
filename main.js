const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  Notification,
  screen,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_STATE, normalizeState, nextDueAlarm } = require("./src/state");

let petWindow;
let panelWindow;
let tray;
let appState;
let statePath;
let scheduler;

const isDev = process.argv.includes("--dev");

function loadState() {
  statePath = path.join(app.getPath("userData"), "petdesk-state.json");
  try {
    appState = normalizeState(JSON.parse(fs.readFileSync(statePath, "utf8")));
  } catch {
    appState = structuredClone(DEFAULT_STATE);
  }
}

function persistState() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(appState, null, 2), "utf8");
}

function broadcastState() {
  for (const win of [petWindow, panelWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("state:changed", appState);
  }
}

function updateState(updater) {
  const updated = typeof updater === "function" ? updater(structuredClone(appState)) : updater;
  appState = normalizeState(updated);
  persistState();
  applyWindowSettings();
  scheduleNextAlarm();
  broadcastState();
  return appState;
}

function petBounds() {
  const display = screen.getPrimaryDisplay().workArea;
  const size = Math.round(260 * appState.settings.petScale);
  const saved = appState.runtime.petPosition;
  return {
    width: size,
    height: size,
    x: Number.isFinite(saved?.x) ? saved.x : display.x + display.width - size - 28,
    y: Number.isFinite(saved?.y) ? saved.y : display.y + display.height - size - 18,
  };
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    ...petBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    alwaysOnTop: appState.settings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow.setAlwaysOnTop(appState.settings.alwaysOnTop, "floating");
  petWindow.loadFile(path.join(__dirname, "src", "pet.html"));
  petWindow.once("ready-to-show", () => petWindow.showInactive());
  petWindow.on("moved", () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    appState.runtime.petPosition = petWindow.getPosition().reduce(
      (result, value, index) => ({ ...result, [index === 0 ? "x" : "y"]: value }),
      {}
    );
    persistState();
  });
  petWindow.on("closed", () => {
    petWindow = null;
  });
  if (isDev) petWindow.webContents.openDevTools({ mode: "detach" });
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show();
    panelWindow.focus();
    return;
  }
  panelWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    title: "PetDesk",
    backgroundColor: "#f4f2ec",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  panelWindow.loadFile(path.join(__dirname, "src", "panel.html"));
  panelWindow.once("ready-to-show", () => panelWindow.show());
  panelWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      panelWindow.hide();
    }
  });
  if (isDev) panelWindow.webContents.openDevTools({ mode: "detach" });
}

function trayIcon() {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" rx="18" fill="#24332d"/>
    <path d="M18 25L15 11l14 9h6l14-9-3 14c5 4 8 10 8 16 0 12-9 18-22 18S10 53 10 41c0-6 3-12 8-16z" fill="#F2A65A"/>
    <circle cx="25" cy="37" r="3" fill="#24332d"/><circle cx="41" cy="37" r="3" fill="#24332d"/>
    <path d="M29 45q4 4 8 0" stroke="#24332d" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function createTray() {
  tray = new Tray(trayIcon().resize({ width: 20, height: 20 }));
  tray.setToolTip("PetDesk");
  const refreshMenu = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开控制中心", click: createPanelWindow },
        {
          label: petWindow?.isVisible() ? "隐藏桌宠" : "显示桌宠",
          click: () => (petWindow?.isVisible() ? petWindow.hide() : petWindow?.showInactive()),
        },
        { type: "separator" },
        {
          label: "开始 25 分钟专注",
          click: () => startFocus(25 * 60),
        },
        { label: "让桌宠休息", click: () => petWindow?.webContents.send("pet:action", "sleep") },
        { type: "separator" },
        {
          label: "退出 PetDesk",
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ])
    );
  };
  refreshMenu();
  tray.on("click", createPanelWindow);
  tray.on("right-click", refreshMenu);
}

function applyWindowSettings() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petBounds();
  petWindow.setAlwaysOnTop(appState.settings.alwaysOnTop, "floating");
  petWindow.setSize(bounds.width, bounds.height);
  petWindow.setIgnoreMouseEvents(Boolean(appState.settings.clickThrough), { forward: true });
}

function notify(title, body, action = "celebrate") {
  if (Notification.isSupported()) new Notification({ title, body, silent: !appState.settings.sound }).show();
  petWindow?.webContents.send("pet:speak", { text: body, action });
}

function scheduleNextAlarm() {
  clearTimeout(scheduler);
  const due = nextDueAlarm(appState.alarms, new Date());
  if (!due) return;
  const delay = Math.max(250, due.at.getTime() - Date.now());
  scheduler = setTimeout(() => {
    notify(due.alarm.label || "PetDesk 提醒", due.alarm.note || "时间到了，休息一下吧。", "alert");
    if (!due.alarm.repeat) {
      updateState((state) => {
        const alarm = state.alarms.find((item) => item.id === due.alarm.id);
        if (alarm) alarm.enabled = false;
        return state;
      });
    } else {
      scheduleNextAlarm();
    }
  }, Math.min(delay, 2_147_000_000));
}

function startFocus(seconds) {
  const now = Date.now();
  updateState((state) => {
    state.focus.running = true;
    state.focus.startedAt = now;
    state.focus.endsAt = now + seconds * 1000;
    state.focus.duration = seconds;
    return state;
  });
  petWindow?.webContents.send("pet:action", "study");
}

function registerIpc() {
  ipcMain.handle("state:get", () => appState);
  ipcMain.handle("state:replace", (_, state) => updateState(state));
  ipcMain.handle("panel:open", () => createPanelWindow());
  ipcMain.handle("pet:menu", () => createPanelWindow());
  ipcMain.handle("pet:action", (_, action) => petWindow?.webContents.send("pet:action", action));
  ipcMain.handle("pet:hide", () => petWindow?.hide());
  ipcMain.handle("app:quit", () => {
    app.isQuitting = true;
    app.quit();
  });
  ipcMain.handle("focus:start", (_, seconds) => startFocus(seconds));
  ipcMain.handle("focus:pause", () =>
    updateState((state) => {
      if (state.focus.running) {
        state.focus.remaining = Math.max(0, Math.round((state.focus.endsAt - Date.now()) / 1000));
      }
      state.focus.running = false;
      state.focus.endsAt = null;
      return state;
    })
  );
  ipcMain.handle("focus:complete", () => {
    updateState((state) => {
      state.focus.running = false;
      state.focus.endsAt = null;
      state.focus.remaining = state.focus.duration;
      state.focus.sessions += 1;
      state.focus.totalMinutes += Math.round(state.focus.duration / 60);
      return state;
    });
    notify("专注完成", "做得很好！起来活动一下吧。", "celebrate");
  });
  ipcMain.handle("image:pick", async () => {
    const result = await dialog.showOpenDialog(panelWindow, {
      title: "选择宠物图片",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).slice(1).replace("jpg", "jpeg");
    return {
      name: path.basename(filePath),
      path: filePath,
      dataUrl: `data:image/${ext};base64,${fs.readFileSync(filePath).toString("base64")}`,
    };
  });
  ipcMain.handle("image:save-custom", (_, { dataUrl, name, style }) => {
    const matches = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!matches) throw new Error("仅支持 PNG 数据");
    const folder = path.join(app.getPath("userData"), "pets");
    fs.mkdirSync(folder, { recursive: true });
    const id = `pet-${Date.now()}`;
    const filePath = path.join(folder, `${id}.png`);
    fs.writeFileSync(filePath, Buffer.from(matches[1], "base64"));
    updateState((state) => {
      state.customPets.push({ id, name: name || "我的桌宠", style, imagePath: filePath, dataUrl });
      state.settings.activePet = id;
      return state;
    });
    return { id, filePath };
  });
  ipcMain.handle("image:ai-transform", async (_, { sourcePath, style, description }) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("未检测到 OPENAI_API_KEY。请先在 Windows 环境变量中配置后重启 PetDesk。");
    const prompts = {
      chibi: "Transform the subject into a polished cute chibi desktop-pet character with a large expressive head, compact body, clean silhouette and plain neutral background.",
      realistic: "Transform the subject into a charming realistic desktop-pet portrait, preserving identity and key markings, centered with a clean plain background.",
      watercolor: "Transform the subject into a soft hand-painted watercolor desktop-pet illustration, clean silhouette, centered, plain background.",
    };
    const body = new FormData();
    body.set("model", "gpt-image-1.5");
    body.set("prompt", `${prompts[style] || prompts.chibi} ${description || ""}`.trim());
    body.set("size", "1024x1024");
    body.set("image", new Blob([fs.readFileSync(sourcePath)]), path.basename(sourcePath));
    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "AI 图片转换失败");
    const base64 = payload.data?.[0]?.b64_json;
    if (!base64) throw new Error("AI 图片结果为空");
    return `data:image/png;base64,${base64}`;
  });
  ipcMain.handle("settings:startup", (_, enabled) => {
    app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ["--hidden"] });
    return app.getLoginItemSettings().openAtLogin;
  });
}

app.whenReady().then(() => {
  loadState();
  registerIpc();
  createPetWindow();
  createPanelWindow();
  createTray();
  scheduleNextAlarm();
  app.on("activate", createPanelWindow);
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {});
