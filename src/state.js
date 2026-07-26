const DEFAULT_STATE = {
  settings: {
    activePet: "momo",
    petType: "cat",
    petName: "桃桃",
    petScale: 1,
    alwaysOnTop: true,
    clickThrough: false,
    sound: true,
    startup: false,
    theme: "sage",
    primaryColor: "#f29d62",
    bodyColor: "#f2a65a",
    accentColor: "#fff0d6",
    interactionFrequency: "normal",
  },
  runtime: { petPosition: null, petVisible: true },
  customPets: [],
  todos: [
    { id: "welcome-1", title: "体验一次 25 分钟专注", done: false, priority: "high", due: "" },
    { id: "welcome-2", title: "摸摸桌宠，看看它的反应", done: false, priority: "normal", due: "" },
  ],
  alarms: [],
  focus: {
    running: false,
    startedAt: null,
    endsAt: null,
    duration: 25 * 60,
    remaining: 25 * 60,
    sessions: 0,
    totalMinutes: 0,
  },
  weather: {
    location: null,
    updatedAt: null,
    current: null,
    days: [],
    timezone: null,
  },
  habits: [
    { id: "water", title: "喝水", streak: 0, checkedDate: "" },
    { id: "stretch", title: "拉伸", streak: 0, checkedDate: "" },
  ],
  stats: { interactions: 0, completedTodos: 0 },
};

function normalizeState(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    ...structuredClone(DEFAULT_STATE),
    ...source,
    settings: { ...DEFAULT_STATE.settings, ...(source.settings || {}) },
    runtime: { ...DEFAULT_STATE.runtime, ...(source.runtime || {}) },
    focus: { ...DEFAULT_STATE.focus, ...(source.focus || {}) },
    weather: { ...DEFAULT_STATE.weather, ...(source.weather || {}) },
    stats: { ...DEFAULT_STATE.stats, ...(source.stats || {}) },
    todos: Array.isArray(source.todos) ? source.todos : structuredClone(DEFAULT_STATE.todos),
    alarms: Array.isArray(source.alarms) ? source.alarms : [],
    habits: Array.isArray(source.habits) ? source.habits : structuredClone(DEFAULT_STATE.habits),
    customPets: Array.isArray(source.customPets) ? source.customPets : [],
  };
}

function clampFocusMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return 25;
  return Math.min(240, Math.max(1, Math.round(minutes)));
}

function parseTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function nextDueAlarm(alarms, now) {
  const candidates = [];
  for (const alarm of alarms || []) {
    if (!alarm.enabled) continue;
    let at;
    if (alarm.datetime) {
      at = new Date(alarm.datetime);
    } else {
      const time = parseTime(alarm.time);
      if (!time) continue;
      at = new Date(now);
      at.setHours(time.hours, time.minutes, 0, 0);
      if (at <= now) at.setDate(at.getDate() + 1);
    }
    if (!Number.isNaN(at.getTime()) && at > now) candidates.push({ alarm, at });
  }
  candidates.sort((a, b) => a.at - b.at);
  return candidates[0] || null;
}

module.exports = { DEFAULT_STATE, clampFocusMinutes, normalizeState, nextDueAlarm };
