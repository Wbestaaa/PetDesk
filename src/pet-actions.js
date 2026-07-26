(function exposePetActionPatterns(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PetActionPatterns = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPetActionPatterns() {
  const DIRECTIONS_16 = Object.freeze([
    "E", "ENE", "NE", "NNE",
    "N", "NNW", "NW", "WNW",
    "W", "WSW", "SW", "SSW",
    "S", "SSE", "SE", "ESE",
  ]);

  const ACTION_PATTERN_V1 = Object.freeze({
    schemaVersion: 1,
    id: "petdesk-standard-v1",
    name: "PetDesk 标准动作模式",
    directions: DIRECTIONS_16,
    groups: {
      idle: {
        label: "待机",
        actions: ["idle", "blink", "pet", "stretch"],
        defaultDurationMs: 3200,
        loop: true,
      },
      locomotion: {
        label: "移动",
        actions: ["walk", "run", "jump"],
        defaultDurationMs: 3400,
        directional: true,
        loop: true,
      },
      emotion: {
        label: "情绪",
        actions: ["happy", "shy", "sad", "angry", "surprised"],
        defaultDurationMs: 2600,
        loop: false,
      },
      interact: {
        label: "互动",
        actions: ["play", "pet", "wave"],
        defaultDurationMs: 3200,
        loop: false,
      },
      feed: {
        label: "进食",
        actions: ["feed", "drink"],
        defaultDurationMs: 3200,
        loop: false,
      },
      work: {
        label: "学习与工作",
        actions: ["study", "write", "type"],
        defaultDurationMs: 25 * 60 * 1000,
        loop: true,
      },
      rest: {
        label: "休息",
        actions: ["sleep", "nap", "yawn"],
        defaultDurationMs: 8000,
        loop: true,
      },
      celebrate: {
        label: "庆祝",
        actions: ["celebrate", "dance", "confetti"],
        defaultDurationMs: 4200,
        loop: false,
      },
      alert: {
        label: "提醒",
        actions: ["alert", "alarm", "nudge"],
        defaultDurationMs: 5600,
        loop: false,
      },
    },
    transitions: {
      launch: "idle",
      focusStart: "study",
      focusPause: "idle",
      focusComplete: "celebrate",
      alarmDue: "alert",
      primaryClick: "pet",
      inactivity: ["idle", "walk", "stretch"],
    },
  });

  const ACTION_LINES = Object.freeze({
    idle: ["今天也一起加油吧。", "需要我陪你专注吗？", "记得喝水～", "摸摸我会有惊喜。"],
    feed: ["好吃！能量满格。", "再来一块也不是不可以。"],
    play: ["抓到你啦！", "再玩一会儿嘛。"],
    study: ["我会安静陪着你。", "这一小段专注完成再休息。"],
    sleep: ["晚安……Zzz", "先充一会儿电。"],
    celebrate: ["完成啦，太棒了！", "今天又向前一步。"],
    alert: ["时间到啦！", "这是你设置的提醒哦。"],
    pet: ["呼噜呼噜～", "这里再摸一下。"],
    stretch: ["伸个懒腰，肩膀也放松一下。"],
    walk: ["我去附近转一圈～"],
  });

  function actionGroup(action) {
    return Object.entries(ACTION_PATTERN_V1.groups)
      .find(([, group]) => group.actions.includes(action))?.[0] || "idle";
  }

  function actionDuration(action) {
    return ACTION_PATTERN_V1.groups[actionGroup(action)].defaultDurationMs;
  }

  function directionFromVector(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return "S";
    const counterClockwiseFromEast = (Math.atan2(-y, x) * 180 / Math.PI + 360) % 360;
    return DIRECTIONS_16[Math.round(counterClockwiseFromEast / 22.5) % 16];
  }

  return {
    ACTION_LINES,
    ACTION_PATTERN_V1,
    DIRECTIONS_16,
    actionDuration,
    actionGroup,
    directionFromVector,
  };
});
