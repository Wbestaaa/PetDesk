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
    idle: [
      "今天也一起加油吧。",
      "需要我陪你专注吗？",
      "记得喝水～",
      "摸摸我会有惊喜。",
      "先完成最小的一步，也算向前走。",
      "盯着屏幕久了，看看远处吧。",
      "我会待在这里，不催你。",
      "要不要把脑海里的事写进待办？",
      "现在的节奏刚刚好。",
    ],
    feed: [
      "好吃！能量满格。",
      "再来一块也不是不可以。",
      "咔嚓咔嚓，谢谢你！",
      "饼干要慢慢吃，工作也要慢慢做。",
      "这一块分你一半……好吧，一小半。",
      "吃饱了，我可以继续陪你啦。",
    ],
    play: [
      "抓到你啦！",
      "再玩一会儿嘛。",
      "羽毛往左边跑了！",
      "这次我一定能扑到。",
      "活动一下，脑袋也会更清醒。",
      "玩够这一轮，我们再继续做事。",
    ],
    study: [
      "我会安静陪着你。",
      "这一小段专注完成再休息。",
      "书已经翻开啦，开始吧。",
      "把通知放一边，我们只做这一件事。",
      "遇到难点先记下来，不必立刻解决全部。",
      "保持这个节奏，你做得很好。",
    ],
    sleep: [
      "晚安……Zzz",
      "先充一会儿电。",
      "我眯一小会儿，有事叫我。",
      "休息不是偷懒，是补充能量。",
      "屏幕也该喘口气啦。",
      "等我醒来，我们再继续。",
    ],
    celebrate: [
      "完成啦，太棒了！",
      "今天又向前一步。",
      "这件事值得庆祝一下！",
      "看吧，你真的做到了。",
      "给自己一个小小的肯定吧。",
      "进度增加，开心也增加！",
    ],
    alert: [
      "时间到啦！",
      "这是你设置的提醒哦。",
      "叮——别让重要的事溜走。",
      "先看一下提醒，再决定下一步。",
      "到时间啦，需要我继续陪你吗？",
      "暂停一下，这里有一条提醒。",
    ],
    pet: [
      "呼噜呼噜～",
      "这里再摸一下。",
      "被你发现我在偷懒啦。",
      "摸摸收到，心情加一。",
      "再摸一下也可以哦。",
      "我会好好陪着你的。",
    ],
    stretch: [
      "伸个懒腰，肩膀也放松一下。",
      "手腕转一转，脖子也轻轻动一动。",
      "坐久了，我们站起来十秒吧。",
      "呼——拉伸以后舒服多了。",
      "别忘了放松紧绷的肩膀。",
    ],
    walk: [
      "我去附近转一圈～",
      "换个位置，也换换心情。",
      "巡视桌面中，请稍等。",
      "这里的风景好像不错。",
      "走几步，再回来陪你。",
    ],
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
