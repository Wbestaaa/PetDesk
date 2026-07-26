const assert = require("node:assert/strict");
const {
  applyCompanionReward,
  clampFocusMinutes,
  normalizeState,
  nextDueAlarm,
} = require("../src/state");

const normalized = normalizeState({ settings: { petName: "Test" }, todos: [] });
assert.equal(normalized.settings.petName, "Test");
assert.equal(normalized.settings.alwaysOnTop, true);
assert.deepEqual(normalized.todos, []);
assert.equal(normalized.runtime.petVisible, true);
assert.deepEqual(normalized.weather.days, []);
assert.equal(normalized.settings.autonomousRoaming, true);
assert.equal(normalized.settings.hoverReaction, true);
assert.equal(normalized.settings.showActionLabel, true);
assert.equal(normalized.companion.level, 1);
assert.equal(normalized.companion.bondXp, 0);
assert.equal(clampFocusMinutes("90"), 90);
assert.equal(clampFocusMinutes(0), 1);
assert.equal(clampFocusMinutes(999), 240);
assert.equal(clampFocusMinutes("not-a-number"), 25);

const firstReward = applyCompanionReward(normalized.companion, "pet", new Date(2026, 6, 26, 10, 0));
assert.equal(firstReward.reward.points, 2);
assert.equal(firstReward.companion.bondXp, 2);
assert.equal(firstReward.companion.todayPoints, 2);
const levelReward = applyCompanionReward({ bondXp: 39, level: 1 }, "play", new Date(2026, 6, 26, 10, 1));
assert.equal(levelReward.reward.leveledUp, true);
assert.equal(levelReward.reward.level, 2);
assert.equal(levelReward.reward.progress, 2);
const ignoredReward = applyCompanionReward(normalized.companion, "unknown", new Date(2026, 6, 26, 10, 2));
assert.equal(ignoredReward.reward.awarded, false);

const now = new Date(2026, 6, 26, 10, 0, 0);
const due = nextDueAlarm(
  [
    { id: "late", enabled: true, datetime: new Date(2026, 6, 26, 15, 0).toISOString() },
    { id: "early", enabled: true, datetime: new Date(2026, 6, 26, 11, 0).toISOString() },
    { id: "off", enabled: false, datetime: new Date(2026, 6, 26, 10, 30).toISOString() },
  ],
  now
);
assert.equal(due.alarm.id, "early");

const repeating = nextDueAlarm([{ id: "daily", enabled: true, time: "09:30", repeat: true }], now);
assert.equal(repeating.at.getDate(), 27);

console.log("state tests passed");
