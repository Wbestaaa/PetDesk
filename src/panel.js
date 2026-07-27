let state;
let currentPage = "home";
let pickedImage;
let selectedStyle = "pixel";
let selectedSubjectType = "auto";
let builderName = "我的伙伴";
let builderDescription = "";
let aiConfig;
let aiStatus = "";
let actionGeneration = { running: false, progress: 0, message: "" };
let timerInterval;
let weatherLoading = false;
const pageTitles = {
  home: "早上好，今天想完成什么？",
  pets: "打造属于你的桌面伙伴",
  focus: "把注意力留给重要的事",
  todos: "清空脑海，一件件完成",
  alarms: "让提醒温柔地准时出现",
  habits: "小习惯会长成大变化",
  weather: "出门前，先看看今天的天空",
  settings: "按照你的方式陪伴",
};
const petCatalog = window.PetCatalog;
const BOND_XP_PER_LEVEL = 40;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => structuredClone(value);
const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

function bondTitle(level) {
  if (level >= 5) return "毕业搭档";
  if (level === 4) return "亲密伙伴";
  if (level === 3) return "很有默契";
  if (level === 2) return "逐渐熟悉";
  return "刚刚认识";
}

function bondProgress(companion = {}) {
  const xp = Math.max(0, Number(companion.bondXp) || 0);
  return {
    level: Math.max(1, Math.floor(xp / BOND_XP_PER_LEVEL) + 1),
    points: xp % BOND_XP_PER_LEVEL,
    percent: ((xp % BOND_XP_PER_LEVEL) / BOND_XP_PER_LEVEL) * 100,
  };
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

async function save(next = state) {
  state = await window.petdesk.replaceState(next);
  render();
}

function taskItem(task) {
  return `<div class="list-item ${task.done ? "done" : ""}" data-id="${task.id}">
    <button class="check" data-check>${task.done ? "✓" : ""}</button>
    <span class="priority ${task.priority || ""}"></span>
    <div class="item-main"><span class="item-title">${escapeHtml(task.title)}</span>
      <div class="item-meta">${task.due ? `截止 ${escapeHtml(task.due)}` : task.priority === "high" ? "优先处理" : "暂无截止时间"}</div>
    </div>
    <button class="delete" data-delete title="删除">×</button>
  </div>`;
}

function alarmItem(alarm) {
  const when = alarm.datetime
    ? new Date(alarm.datetime).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : alarm.time;
  return `<div class="list-item" data-id="${alarm.id}">
    <div class="stat-icon">⏰</div>
    <div class="item-main"><span class="item-title">${escapeHtml(alarm.label || "提醒")}</span>
      <div class="item-meta">${escapeHtml(when || "")} · ${alarm.repeat ? "每天重复" : "仅一次"}</div>
    </div>
    <label class="switch"><input data-alarm-toggle type="checkbox" ${alarm.enabled ? "checked" : ""}><span class="slider"></span></label>
    <button class="delete" data-alarm-delete>×</button>
  </div>`;
}

function homeTemplate() {
  const open = state.todos.filter((item) => !item.done);
  const progress = state.todos.length ? Math.round((state.todos.filter((item) => item.done).length / state.todos.length) * 100) : 0;
  const custom = state.customPets.find((item) => item.id === state.settings.activePet);
  const builtInPortrait = petCatalog.findBuiltInPet(state.settings.activePet) || petCatalog.findBuiltInPet("momo");
  const portrait = custom
    ? `<img src="${custom.dataUrl}" alt="${escapeHtml(custom.name)}">`
    : builtInPortrait.icon
      ? `<img src="${builtInPortrait.icon}" alt="${builtInPortrait.name}">`
      : `<span class="hero-emoji">${builtInPortrait.emoji}</span>`;
  const weather = state.weather?.current;
  const weatherLocation = state.weather?.location;
  const bond = bondProgress(state.companion);
  return `<div class="grid two">
    <div class="card hero-card">
      <div>
        <small style="color:#f4b57f">YOUR GENTLE COMPANION</small>
        <h2>${escapeHtml(state.settings.petName)}已经准备好陪你开始今天</h2>
        <p>把任务分成一个个小步骤。专注的时候，它会安静看书；完成的时候，它会和你一起庆祝。</p>
        <div class="hero-actions"><button class="button orange" data-start-focus>开始专注</button><button class="button ghost" style="color:#fff;border-color:#708279" data-pet-play data-reward="play">和它玩一会儿</button></div>
        <div class="bond-mini">
          <div><b>默契 Lv.${bond.level} · ${bondTitle(bond.level)}</b><span>${bond.points}/${BOND_XP_PER_LEVEL}</span></div>
          <i><span style="width:${bond.percent}%"></span></i>
          <small>互动获得即时反馈，完成待办和专注会成长得更快。</small>
        </div>
      </div>
      <div class="pet-portrait"><span class="orb"></span>${portrait}</div>
    </div>
    <div class="grid">
      <div class="card"><div class="card-head"><h3>今日进度</h3><small>${progress}%</small></div>
        <div style="height:8px;border-radius:8px;background:#e6e5df;overflow:hidden"><div style="height:100%;width:${progress}%;background:var(--orange);border-radius:8px"></div></div>
        <p class="muted" style="font-size:11px;margin:13px 0 0">${open.length ? `还有 ${open.length} 件事，慢慢来。` : "今天的待办已经完成啦！"}</p>
      </div>
      <div class="card"><div class="stat"><span class="stat-icon">◷</span><div><b>${state.focus.totalMinutes}</b><small>累计专注分钟</small></div></div></div>
    </div>
  </div>
  <div class="grid three" style="margin-top:18px">
    <div class="card"><div class="stat"><span class="stat-icon">✓</span><div><b>${state.stats.completedTodos}</b><small>已完成任务</small></div></div></div>
    <div class="card"><div class="stat"><span class="stat-icon">☀</span><div><b>${state.focus.sessions}</b><small>专注次数</small></div></div></div>
    <div class="card"><div class="stat"><span class="stat-icon">↗</span><div><b>${state.habits.reduce((sum, habit) => sum + habit.streak, 0)}</b><small>习惯累计打卡</small></div></div></div>
  </div>
  <div class="card weather-strip" style="margin-top:18px">
    <div class="weather-strip-main">
      <span class="weather-icon">${weather?.icon || "☁️"}</span>
      <div><small>今日天气${weatherLocation ? ` · ${escapeHtml(weatherLocation.name)}` : ""}</small>
      <b>${weather ? `${weather.temperature}° · ${escapeHtml(weather.label)}` : "设置城市后查看天气"}</b></div>
    </div>
    <div class="weather-strip-detail">${weather ? `体感 ${weather.apparentTemperature}° · 湿度 ${weather.humidity}% · 风速 ${weather.windSpeed} km/h` : "只在你主动查询时联网，不读取系统定位"}</div>
    <button class="button ghost small" data-goto="weather">${weather ? "查看预报" : "设置城市"}</button>
  </div>
  <div class="grid two" style="margin-top:18px">
    <div class="card"><div class="card-head"><h3>接下来</h3><button class="link" data-goto="todos">查看全部</button></div>
      <div class="list">${open.slice(0, 4).map(taskItem).join("") || `<div class="empty">没有待办，去和桌宠玩一会儿吧。</div>`}</div>
    </div>
    <div class="card"><div class="card-head"><h3>快速行动</h3></div>
      <div class="grid"><button class="button ghost" data-pet-action="stretch">让桌宠伸懒腰</button><button class="button ghost" data-pet-action="sleep">进入安静休息</button><button class="button ghost" data-goto="alarms">添加一个提醒</button></div>
    </div>
  </div>`;
}

function petsTemplate() {
  const builtIns = petCatalog.BUILT_IN_PETS;
  const activeBuiltIn = petCatalog.findBuiltInPet(state.settings.activePet);
  const activeCustom = state.customPets.find((pet) => pet.id === state.settings.activePet);
  const activePet = activeBuiltIn || {
    name: activeCustom?.name || state.settings.petName,
    note: `${activeCustom?.style || "图片"} · ${activeCustom?.kind === "action-art" ? "九动作套装" : "自定义"}`,
    description: activeCustom?.kind === "action-art"
      ? "由你的原图生成并透明化的九动作桌宠，可完整响应拖动、专注、庆祝与提醒。"
      : "使用你上传并保存的专属桌宠形象。",
    tags: activeCustom?.kind === "action-art" ? ["自定义角色", "9 个动作", "透明背景"] : ["自定义角色", "单图动画"],
    icon: activeCustom?.dataUrl,
    kind: "custom",
    type: activeCustom?.subjectType,
  };
  const builtInCards = builtIns.map((pet) => `<div class="pet-option ${state.settings.activePet === pet.id ? "active" : ""}"
    data-select-pet="${pet.id}" data-pet-type="${pet.type}" data-pet-name="${pet.name}" data-body="${pet.body || ""}" data-accent="${pet.accent || ""}">
    ${state.settings.activePet === pet.id ? `<span class="selected-mark">使用中</span>` : ""}
    <div class="preview">${pet.icon ? `<img src="${pet.icon}" alt="${pet.name}">` : `<span class="procedural-pet">${pet.emoji}</span>`}</div>
    <b>${pet.name}</b><small>${pet.note}</small>
    <div class="pet-card-tags">${pet.tags.slice(0, 2).map((tag) => `<span>${tag}</span>`).join("")}</div></div>`).join("");
  const customCards = state.customPets.map((pet) => `<div class="pet-option custom-option ${state.settings.activePet === pet.id ? "active" : ""}"
    data-select-pet="${pet.id}" data-pet-name="${escapeHtml(pet.name)}" data-pet-type="${escapeHtml(pet.subjectType || "custom")}">
    ${state.settings.activePet === pet.id ? `<span class="selected-mark">使用中</span>` : ""}
    <button class="custom-pet-delete" data-delete-custom="${pet.id}" title="删除“${escapeHtml(pet.name)}”" aria-label="删除“${escapeHtml(pet.name)}”">×</button>
    <div class="preview"><img src="${pet.dataUrl}" alt="${escapeHtml(pet.name)}"></div>
    <b>${escapeHtml(pet.name)}</b><small>${escapeHtml(pet.style)} · ${pet.kind === "action-art" ? "九动作" : "单图"}</small>
    <div class="pet-card-tags"><span>${pet.kind === "action-art" ? "完整动作" : "基础动画"}</span><span>可删除</span></div>
  </div>`).join("");
  const actionButtons = [
    ["idle", "🌿", "待机", "呼吸与陪伴"], ["walk", "🚶", "行走", "拖动与巡视"],
    ["pet", "🫳", "抚摸", "点击反馈"], ["stretch", "↗", "伸懒腰", "久坐放松"],
    ["play", "🪶", "玩耍", "短暂休息"], ["study", "📖", "读书", "专注陪伴"],
    ["sleep", "🌙", "睡觉", "安静模式"], ["celebrate", "🎉", "庆祝", "任务完成"],
    ["alert", "🔔", "提醒", "闹钟触发"],
  ];
  const activeVisual = activePet.icon
    ? `<img src="${activePet.icon}" alt="${escapeHtml(activePet.name)}">`
    : `<span class="procedural-pet">${activePet.emoji || "🐾"}</span>`;
  const petPronoun = activePet.type === "human" ? "她" : "它";
  const bond = bondProgress(state.companion);
  const aiReady = Boolean(aiConfig?.configured);
  const generation = actionGeneration.running || actionGeneration.message
    ? `<div class="generation-progress ${actionGeneration.running ? "running" : "complete"}">
      <div><b>${escapeHtml(actionGeneration.message || "准备生成")}</b><span>${Math.round(actionGeneration.progress || 0)}%</span></div>
      <i><span style="width:${Math.max(0, Math.min(100, actionGeneration.progress || 0))}%"></span></i>
      <small>${actionGeneration.running ? "请不要关闭应用；完成后会自动保存并启用。" : "你可以在“我的桌宠”中选择、预览或删除。"}</small>
    </div>`
    : "";
  return `<div class="card pet-profile">
    <div class="pet-profile-visual">${activeVisual}</div>
    <div class="pet-profile-copy">
      <small>CURRENT COMPANION</small>
      <h2>${escapeHtml(activePet.name)}</h2>
      <b>${escapeHtml(activePet.note || "")}</b>
      <p>${escapeHtml(activePet.description || "")}</p>
      <div class="profile-tags">${(activePet.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="bond-progress">
        <div><b>默契 Lv.${bond.level} · ${bondTitle(bond.level)}</b><span>${bond.points}/${BOND_XP_PER_LEVEL}</span></div>
        <i><span style="width:${bond.percent}%"></span></i>
        <small>今日获得 ${state.companion?.todayPoints || 0} 点默契</small>
      </div>
      <div class="profile-actions"><button class="button" data-pet-action="pet" data-reward="pet">摸摸${petPronoun}</button><button class="button ghost" data-pet-random data-reward="random">随机互动</button></div>
    </div>
    <div class="interaction-cheatsheet">
      <b>桌面交互</b>
      <span><i>单击</i> 抚摸回应</span><span><i>拖动</i> 行走与换位</span>
      <span><i>快速放手</i> 惊喜庆祝</span><span><i>右键</i> 完整动作菜单</span>
      <span class="reward-rule"><i>正反馈</i> 完成任务与专注增加默契</span>
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h2>我的桌宠</h2><p class="muted" style="font-size:11px;margin:6px 0 0">选择当前出现在桌面的伙伴</p></div></div>
    <div class="pet-grid">
      ${builtInCards}
      ${customCards}
    </div>
  </div>
  <div class="card" style="margin-top:18px"><div class="card-head"><div><h3>动作实验室</h3><p class="muted action-subtitle">点击动作会唤醒隐藏桌宠并立即预览</p></div><small>由角色 manifest 决定素材与回退</small></div>
    <div class="action-lab">${actionButtons.map(([name, icon, label, hint]) => `<button class="action-button" data-pet-action="${name}"><span>${icon}</span><b>${label}</b><small>${hint}</small></button>`).join("")}</div>
  </div>
  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h2>桌宠工坊</h2><p class="muted" style="font-size:11px;margin:6px 0 0">上传照片，制作像素、Q版、写实或水彩风伙伴</p></div></div>
    <div class="builder">
      <div class="upload-zone" id="uploadZone">${pickedImage ? `<img src="${pickedImage.resultDataUrl || pickedImage.dataUrl}" alt="预览">` : `<span style="font-size:38px">＋</span><b>选择一张图片</b><small>PNG / JPG / WEBP</small>`}</div>
      <div class="grid">
        <label class="field-label">桌宠名字<input id="petNameInput" class="field" value="${escapeHtml(builderName)}" maxlength="20"></label>
        <label class="field-label">原图主体
          <select id="subjectType"><option value="auto" ${selectedSubjectType === "auto" ? "selected" : ""}>自动保留原主体</option><option value="human" ${selectedSubjectType === "human" ? "selected" : ""}>人物（绝不动物化）</option><option value="animal" ${selectedSubjectType === "animal" ? "selected" : ""}>动物（保留品种特征）</option></select>
        </label>
        <div class="style-options">
          <button class="style-option ${selectedStyle === "pixel" ? "active" : ""}" data-style="pixel"><b>像素风 · 本地</b><small>离线完成，硬边像素与有限色盘</small></button>
          <button class="style-option ${selectedStyle === "chibi" ? "active" : ""}" data-style="chibi"><b>Q版 · AI</b><small>大头短身、表情鲜明的可爱角色</small></button>
          <button class="style-option ${selectedStyle === "realistic" ? "active" : ""}" data-style="realistic"><b>写实 · AI</b><small>保留外观特征，生成精致桌宠肖像</small></button>
          <button class="style-option ${selectedStyle === "watercolor" ? "active" : ""}" data-style="watercolor"><b>水彩 · AI</b><small>柔和手绘质感与干净轮廓</small></button>
        </div>
        <label class="field-label">补充描述（可选）<textarea id="styleDescription" rows="3" placeholder="例如：保留长黑发、学士帽和花束">${escapeHtml(builderDescription)}</textarea></label>
        <div class="builder-actions">
          <button class="button" id="transformImage" ${pickedImage || actionGeneration.running ? "" : "disabled"} ${actionGeneration.running ? "disabled" : ""}>生成单图预览</button>
          <button class="button orange" id="generateActionPack" ${pickedImage && aiReady && !actionGeneration.running ? "" : "disabled"}>一键生成完整九动作</button>
          <button class="button ghost" id="savePet" ${pickedImage?.resultDataUrl && !actionGeneration.running ? "" : "disabled"}>仅保存单图</button>
        </div>
        ${generation}
        <div class="ai-builder-note ${aiReady ? "ready" : ""}">
          <span>${aiReady ? "✓ AI 图片服务已配置" : "尚未配置 AI 图片服务"}</span>
          <button class="link" data-goto="settings">${aiReady ? "查看设置" : "现在配置"}</button>
          <small>像素单图预览可离线完成；九动作会调用一次图片编辑 API，费用与 ChatGPT 订阅分开计算。</small>
        </div>
      </div>
    </div>
  </div>`;
}

function focusTemplate() {
  const duration = state.focus.duration || 1500;
  const customMinutes = Math.round(duration / 60);
  return `<div class="focus-layout">
    <div class="card timer-card">
      <div>
        <div class="presets"><button data-preset="900" class="${duration === 900 ? "active" : ""}">15 分钟</button><button data-preset="1500" class="${duration === 1500 ? "active" : ""}">25 分钟</button><button data-preset="3000" class="${duration === 3000 ? "active" : ""}">50 分钟</button></div>
        <div class="custom-focus">
          <label for="customFocusMinutes">自定义</label>
          <input id="customFocusMinutes" type="number" min="1" max="240" step="1" value="${customMinutes}" aria-label="自定义专注分钟数">
          <span>分钟</span>
          <button class="button ghost small" id="applyCustomFocus">应用</button>
        </div>
        <div class="timer-ring" id="timerRing"><div class="timer-content"><strong id="timerText">25:00</strong><span>${state.focus.running ? "保持专注，桌宠正陪着你" : "准备好就开始"}</span></div></div>
        <div class="timer-controls">${state.focus.running ? `<button class="button ghost" id="pauseFocus">暂停</button>` : `<button class="button orange" id="startFocus">开始专注</button>`}<button class="button ghost" id="resetFocus">重置</button></div>
      </div>
    </div>
    <div class="grid">
      <div class="card"><div class="card-head"><h3>专注统计</h3></div><div class="grid">
        <div class="stat"><span class="stat-icon">◷</span><div><b>${state.focus.sessions}</b><small>完成次数</small></div></div>
        <div class="stat"><span class="stat-icon">☀</span><div><b>${state.focus.totalMinutes}</b><small>累计分钟</small></div></div>
      </div></div>
      <div class="card"><h3>陪伴模式</h3><p class="muted" style="font-size:11px;line-height:1.7">专注开始后，桌宠会进入读书动作并减少主动说话。完成时会弹出系统通知并庆祝。</p><button class="button ghost" data-pet-action="study">预览读书动作</button></div>
    </div>
  </div>`;
}

function weatherTemplate() {
  const weather = state.weather || {};
  const current = weather.current;
  const location = weather.location;
  const locationLabel = location
    ? [location.name, location.admin1, location.country].filter(Boolean).join(" · ")
    : "";
  const updated = weather.updatedAt
    ? new Date(weather.updatedAt).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";
  const days = (weather.days || []).map((day, index) => {
    const label = index === 0 ? "今天" : new Date(`${day.date}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short" });
    return `<div class="forecast-day"><small>${label}</small><span>${day.icon}</span><b>${day.max}° / ${day.min}°</b><em>${escapeHtml(day.label)} · 降水 ${day.rainChance}%</em></div>`;
  }).join("");
  return `<div class="weather-page">
    <div class="card weather-hero ${current?.isDay === false ? "night" : ""}">
      <div class="weather-search">
        <label class="field-label">城市或邮政编码
          <div class="search-row"><input id="weatherCity" class="field" placeholder="例如：北京、上海、东京" value="${escapeHtml(location?.name || "")}">
          <button class="button orange" id="searchWeather" ${weatherLoading ? "disabled" : ""}>${weatherLoading ? "查询中…" : "查询天气"}</button></div>
        </label>
      </div>
      ${current ? `<div class="current-weather">
        <span class="current-weather-icon">${current.icon}</span>
        <div><small>${escapeHtml(locationLabel)}</small><strong>${current.temperature}°</strong><h2>${escapeHtml(current.label)}</h2></div>
        <div class="weather-metrics"><span><b>${current.apparentTemperature}°</b>体感</span><span><b>${current.humidity}%</b>湿度</span><span><b>${current.windSpeed}</b>km/h 风速</span></div>
      </div>` : `<div class="weather-empty"><span>🌤️</span><h2>先设置你关心的城市</h2><p>PetDesk 不读取系统定位；输入城市后才会向天气服务查询。</p></div>`}
    </div>
    ${days ? `<div class="card"><div class="card-head"><h3>未来四天</h3><div class="weather-updated">${updated ? `更新于 ${updated}` : ""}<button class="link" id="refreshWeather">刷新</button></div></div><div class="forecast-grid">${days}</div></div>` : ""}
    <p class="weather-credit">天气数据：Open-Meteo · 地点数据：GeoNames。网络异常时不会影响待办、专注等本地功能。</p>
  </div>`;
}

function todosTemplate() {
  return `<div class="card">
    <div class="quick-add"><input id="todoInput" class="field" placeholder="输入一件要完成的事…"><select id="todoPriority"><option value="normal">普通</option><option value="high">优先</option></select><button class="button" id="addTodo">添加</button></div>
    <div class="card-head"><h3>全部任务</h3><small>${state.todos.filter((item) => !item.done).length} 项未完成</small></div>
    <div class="list">${state.todos.map(taskItem).join("") || `<div class="empty">写下第一件想完成的事吧。</div>`}</div>
  </div>`;
}

function alarmsTemplate() {
  return `<div class="grid two">
    <div class="card">
      <div class="card-head"><h3>新建提醒</h3></div>
      <div class="grid">
        <label class="field-label">名称<input id="alarmLabel" class="field" placeholder="例如：起来喝水"></label>
        <label class="field-label">日期与时间<input id="alarmDatetime" class="field" type="datetime-local"></label>
        <label class="field-label">备注<textarea id="alarmNote" rows="3" placeholder="桌宠提醒时会说这句话"></textarea></label>
        <label class="setting-row"><div><b>每天重复</b><small>忽略日期，只按所选时间重复</small></div><span class="switch"><input id="alarmRepeat" type="checkbox"><span class="slider"></span></span></label>
        <button class="button" id="addAlarm">保存提醒</button>
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>提醒列表</h3><small>${state.alarms.filter((item) => item.enabled).length} 个启用</small></div>
      <div class="list">${state.alarms.map(alarmItem).join("") || `<div class="empty">暂时没有提醒。</div>`}</div>
    </div>
  </div>`;
}

function habitsTemplate() {
  const emojis = { water: "💧", stretch: "🌿" };
  return `<div class="habit-grid">${state.habits.map((habit) => `<div class="card habit-card" data-id="${habit.id}">
    <span class="emoji">${emojis[habit.id] || "⭐"}</span><div><h3>${escapeHtml(habit.title)}</h3><p class="muted" style="font-size:10px">累计打卡</p><strong>${habit.streak}</strong></div>
    <button class="button ${habit.checkedDate === today() ? "ghost" : ""}" data-habit ${habit.checkedDate === today() ? "disabled" : ""}>${habit.checkedDate === today() ? "今天已完成 ✓" : "今天打卡"}</button>
  </div>`).join("")}
  <div class="card habit-card"><span class="emoji">＋</span><div><h3>新习惯</h3><p class="muted" style="font-size:10px">添加一个每天坚持的小目标</p></div><div class="quick-add" style="grid-template-columns:1fr auto;margin:0"><input id="habitInput" class="field" placeholder="习惯名称"><button id="addHabit" class="button">添加</button></div></div>
  </div>`;
}

function switchRow(key, title, desc) {
  return `<label class="setting-row"><div><b>${title}</b><small>${desc}</small></div><span class="switch"><input data-setting="${key}" type="checkbox" ${state.settings[key] ? "checked" : ""}><span class="slider"></span></span></label>`;
}

function settingsTemplate() {
  const activeBuiltIn = petCatalog.findBuiltInPet(state.settings.activePet);
  const supportsColorControls = activeBuiltIn?.kind === "procedural";
  const currentAi = aiConfig || {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-2",
    configured: false,
    source: "none",
    storageProtected: false,
  };
  const aiSource = currentAi.source === "app"
    ? "已由 Windows 安全存储保护"
    : currentAi.source === "environment"
      ? "正在兼容读取环境变量，可在这里迁移"
      : "尚未连接";
  const appearanceControls = supportsColorControls
    ? `<label class="setting-row"><div><b>毛色</b><small>内置动态桌宠颜色</small></div><input data-color-setting="bodyColor" class="color-input" type="color" value="${state.settings.bodyColor}"></label>
      <label class="setting-row"><div><b>腹部与脚垫</b><small>内置动态桌宠辅助色</small></div><input data-color-setting="accentColor" class="color-input" type="color" value="${state.settings.accentColor}"></label>`
    : `<div class="setting-row locked-style"><div><b>角色原生配色</b><small>${activeBuiltIn?.name || "自定义角色"}使用自己的动作素材，颜色不会被全局设置覆盖</small></div><span>已锁定</span></div>`;
  return `<div class="settings-grid">
    <div class="card ai-settings-card span-two">
      <div class="card-head"><div><h3>AI 图片服务</h3><p class="muted">在应用内完成连接，用于人物卡通化和九动作生成</p></div><span class="ai-status ${currentAi.configured ? "ready" : ""}">${currentAi.configured ? "已配置" : "未配置"}</span></div>
      <div class="ai-config-grid">
        <label class="field-label">API URL<input id="aiBaseUrl" class="field" value="${escapeHtml(currentAi.baseUrl)}" placeholder="https://api.openai.com/v1" spellcheck="false"></label>
        <label class="field-label">图片模型<input id="aiModel" class="field" value="${escapeHtml(currentAi.model)}" placeholder="gpt-image-2" spellcheck="false"></label>
        <label class="field-label span-two">API Key<input id="aiApiKey" class="field" type="password" value="" placeholder="${currentAi.configured ? "已安全保存；留空表示不修改" : "输入 API Key"}" autocomplete="new-password" spellcheck="false"></label>
      </div>
      <div class="ai-config-footer">
        <div><b>${escapeHtml(aiSource)}</b><small>远程地址必须使用 HTTPS。使用第三方兼容地址时，你的 API Key 和原图会发送给该服务商。</small>${aiStatus ? `<em>${escapeHtml(aiStatus)}</em>` : ""}</div>
        <div><button class="button" id="saveAiConfig">保存配置</button><button class="button orange" id="testAiConfig">保存并测试</button><button class="button ghost" id="clearAiConfig" ${currentAi.source === "app" ? "" : "disabled"}>清除</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>桌面行为</h3></div>
      <div class="setting-row"><div><b>桌宠显示状态</b><small>${state.runtime.petVisible ? "当前显示在桌面上" : "当前已隐藏，可随时恢复"}</small></div><button class="button ghost small" data-toggle-pet>${state.runtime.petVisible ? "隐藏" : "显示"}</button></div>
      ${switchRow("alwaysOnTop", "始终置顶", "让桌宠保持在其他窗口上方")}
      ${switchRow("clickThrough", "鼠标穿透", "临时忽略鼠标；可从托盘恢复")}
      ${switchRow("autonomousRoaming", "自主走动", "空闲时偶尔在屏幕底部换个位置")}
      ${switchRow("hoverReaction", "悬停反应", "鼠标靠近时主动玩耍")}
      ${switchRow("showActionLabel", "动作提示", "动作开始时显示名称，反馈更加明显")}
      ${switchRow("startup", "开机启动", "登录 Windows 后自动运行")}
      ${switchRow("sound", "通知声音", "闹钟和完成提醒播放系统声音")}
    </div>
    <div class="card"><div class="card-head"><h3>外观</h3></div>
      <label class="setting-row"><div><b>桌宠名字</b><small>显示在问候与通知中</small></div><input data-text-setting="petName" class="field" style="width:130px" value="${escapeHtml(state.settings.petName)}"></label>
      <label class="setting-row"><div><b>显示大小</b><small>${Math.round(state.settings.petScale * 100)}%</small></div><input data-range-setting="petScale" type="range" min=".65" max="1.45" step=".05" value="${state.settings.petScale}"></label>
      ${appearanceControls}
    </div>
    <div class="card"><div class="card-head"><h3>互动频率</h3></div>
      <label class="field-label">桌宠主动说话<select data-select-setting="interactionFrequency"><option value="quiet" ${state.settings.interactionFrequency === "quiet" ? "selected" : ""}>安静</option><option value="normal" ${state.settings.interactionFrequency === "normal" ? "selected" : ""}>适中</option><option value="chatty" ${state.settings.interactionFrequency === "chatty" ? "selected" : ""}>活泼</option></select></label>
      <p class="muted" style="font-size:10px;line-height:1.7">专注期间始终自动切换为安静模式，避免分散注意力。</p>
    </div>
    <div class="card"><div class="card-head"><h3>数据与应用</h3></div><p class="muted" style="font-size:11px;line-height:1.7">任务、提醒、习惯和桌宠设置保存在本机应用数据目录。卸载前可自行备份。</p><button class="button danger" id="quitApp">退出 PetDesk</button></div>
  </div>`;
}

function render() {
  $("#home").innerHTML = homeTemplate();
  $("#pets").innerHTML = petsTemplate();
  $("#focus").innerHTML = focusTemplate();
  $("#todos").innerHTML = todosTemplate();
  $("#alarms").innerHTML = alarmsTemplate();
  $("#habits").innerHTML = habitsTemplate();
  $("#weather").innerHTML = weatherTemplate();
  $("#settings").innerHTML = settingsTemplate();
  syncPetVisibilityButton();
  updateTimer();
}

function syncPetVisibilityButton() {
  const visible = state?.runtime?.petVisible !== false;
  const button = $("#togglePet");
  const text = $("#petVisibilityText");
  if (!button || !text) return;
  button.classList.toggle("hidden-state", !visible);
  text.textContent = visible ? "桌宠已显示" : "显示桌宠";
  button.title = visible ? "隐藏桌宠（隐藏后可从此处或托盘恢复）" : "显示桌宠";
  button.setAttribute("aria-label", button.title);
}

function navigate(page) {
  currentPage = page;
  $$("#nav button").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $$(".page").forEach((element) => element.classList.toggle("active", element.id === page));
  $("#pageTitle").textContent = pageTitles[page];
}

function updateTimer() {
  clearInterval(timerInterval);
  const tick = async () => {
    const total = state.focus.duration || 1500;
    const remaining = state.focus.running && state.focus.endsAt
      ? Math.max(0, Math.ceil((state.focus.endsAt - Date.now()) / 1000))
      : state.focus.remaining ?? total;
    const text = $("#timerText");
    if (text) text.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    const ring = $("#timerRing");
    if (ring) ring.style.setProperty("--progress", `${Math.max(0, Math.min(360, ((total - remaining) / total) * 360))}deg`);
    if (state.focus.running && remaining === 0) {
      clearInterval(timerInterval);
      await window.petdesk.completeFocus();
    }
  };
  tick();
  timerInterval = setInterval(tick, 500);
}

function localPixelate(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const size = 512;
      const small = 48;
      const source = document.createElement("canvas");
      source.width = small;
      source.height = small;
      const sourceCtx = source.getContext("2d");
      sourceCtx.imageSmoothingEnabled = true;
      sourceCtx.drawImage(image, 0, 0, small, small);
      const pixels = sourceCtx.getImageData(0, 0, small, small);
      for (let index = 0; index < pixels.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          pixels.data[index + channel] = Math.round(pixels.data[index + channel] / 32) * 32;
        }
      }
      sourceCtx.putImageData(pixels, 0, 0);
      const output = document.createElement("canvas");
      output.width = size;
      output.height = size;
      const outputCtx = output.getContext("2d");
      outputCtx.imageSmoothingEnabled = false;
      outputCtx.clearRect(0, 0, size, size);
      outputCtx.drawImage(source, 0, 0, size, size);
      resolve(output.toDataURL("image/png"));
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function builderValues() {
  builderName = $("#petNameInput")?.value.trim().slice(0, 20) || builderName;
  builderDescription = $("#styleDescription")?.value || builderDescription;
  selectedSubjectType = $("#subjectType")?.value || selectedSubjectType;
  return {
    name: builderName || "我的伙伴",
    description: builderDescription.trim(),
    subjectType: selectedSubjectType,
    style: selectedStyle,
  };
}

async function persistAiForm(shouldTest = false) {
  const baseUrl = $("#aiBaseUrl")?.value.trim();
  const model = $("#aiModel")?.value.trim();
  const apiKey = $("#aiApiKey")?.value.trim();
  aiStatus = shouldTest ? "正在安全保存并检查连接…" : "正在安全保存…";
  try {
    aiConfig = await window.petdesk.saveAiConfig({ baseUrl, model, apiKey });
    if (shouldTest) {
      const result = await window.petdesk.testAiConfig();
      aiStatus = result.message;
      toast("AI 图片服务连接成功");
    } else {
      aiStatus = aiConfig.configured ? "配置已保存，可以生成九动作。" : "URL 与模型已保存，请继续填写 API Key。";
      toast("AI 配置已保存");
    }
  } catch (error) {
    aiStatus = error.message || "AI 配置失败";
    toast(aiStatus);
  }
  render();
  navigate("settings");
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, .pet-option, .upload-zone");
  if (!target) return;
  if (target.dataset.page) navigate(target.dataset.page);
  if (target.dataset.goto) navigate(target.dataset.goto);
  if (target.dataset.petAction) {
    if (state.runtime.petVisible === false) await window.petdesk.setPetVisibility(true);
    await window.petdesk.petAction(target.dataset.petAction);
    if (target.dataset.reward) {
      const reward = await window.petdesk.rewardCompanion(target.dataset.reward);
      if (reward?.awarded) toast(reward.leveledUp ? `默契升级到 Lv.${reward.level}` : `默契 +${reward.points}`);
    }
  }
  if (target.dataset.petRandom !== undefined) {
    if (state.runtime.petVisible === false) await window.petdesk.setPetVisibility(true);
    const choices = ["pet", "play", "stretch", "walk", "celebrate"];
    await window.petdesk.petAction(choices[Math.floor(Math.random() * choices.length)]);
    if (target.dataset.reward) {
      const reward = await window.petdesk.rewardCompanion("random");
      if (reward?.awarded) toast(reward.leveledUp ? `默契升级到 Lv.${reward.level}` : `默契 +${reward.points}`);
    }
  }
  if (target.dataset.startFocus !== undefined) { navigate("focus"); window.petdesk.startFocus(1500); }
  if (target.dataset.petPlay !== undefined) {
    await window.petdesk.petAction("play");
    const reward = await window.petdesk.rewardCompanion("play");
    if (reward?.awarded) toast(`默契 +${reward.points}`);
  }
  if (target.dataset.selectPet) {
    const next = clone(state);
    next.settings.activePet = target.dataset.selectPet;
    if (target.dataset.petName) next.settings.petName = target.dataset.petName;
    if (target.dataset.petType) {
      next.settings.petType = target.dataset.petType;
      next.settings.petName = target.dataset.petName;
      if (target.dataset.body) next.settings.bodyColor = target.dataset.body;
      if (target.dataset.accent) next.settings.accentColor = target.dataset.accent;
    }
    await save(next);
    toast("已切换桌宠");
  }
  if (target.dataset.deleteCustom) {
    try {
      const result = await window.petdesk.deleteCustomPet(target.dataset.deleteCustom);
      if (result.deleted) {
        state = await window.petdesk.getState();
        render();
        navigate("pets");
        toast("自定义桌宠已移入回收站");
      }
    } catch (error) {
      toast(error.message || "删除失败");
    }
  }
  if (target.id === "uploadZone") {
    try {
      pickedImage = await window.petdesk.pickImage();
      if (pickedImage) render();
    } catch (error) {
      toast(error.message || "图片读取失败");
    }
  }
  if (target.dataset.style) {
    selectedStyle = target.dataset.style;
    $$(".style-option").forEach((button) => button.classList.toggle("active", button.dataset.style === selectedStyle));
  }
  if (target.id === "transformImage" && pickedImage) {
    const values = builderValues();
    target.disabled = true;
    target.textContent = "正在生成…";
    try {
      pickedImage.resultDataUrl = selectedStyle === "pixel"
        ? await localPixelate(pickedImage.dataUrl)
        : await window.petdesk.aiTransform({ sourcePath: pickedImage.path, ...values });
      render();
      toast("预览生成完成");
    } catch (error) {
      toast(error.message || "生成失败");
      target.disabled = false;
      target.textContent = "生成预览";
    }
  }
  if (target.id === "savePet" && pickedImage?.resultDataUrl) {
    const values = builderValues();
    await window.petdesk.saveCustomImage({ dataUrl: pickedImage.resultDataUrl, ...values });
    pickedImage = null;
    builderName = "我的伙伴";
    builderDescription = "";
    render();
    toast("桌宠已保存并启用");
  }
  if (target.id === "generateActionPack" && pickedImage) {
    const values = builderValues();
    actionGeneration = { running: true, progress: 4, message: "正在启动九动作生成流程" };
    render();
    navigate("pets");
    try {
      const result = await window.petdesk.generateActionPack({ sourcePath: pickedImage.path, ...values });
      state = await window.petdesk.getState();
      pickedImage = null;
      builderName = "我的伙伴";
      builderDescription = "";
      actionGeneration = { running: false, progress: 100, message: `${result.name}的九动作已生成并启用` };
      render();
      navigate("pets");
      toast("完整九动作已生成并启用");
    } catch (error) {
      actionGeneration = { running: false, progress: 0, message: error.message || "九动作生成失败" };
      render();
      navigate("pets");
      toast(actionGeneration.message);
    }
  }
  if (target.id === "saveAiConfig") await persistAiForm(false);
  if (target.id === "testAiConfig") await persistAiForm(true);
  if (target.id === "clearAiConfig") {
    const result = await window.petdesk.clearAiConfig();
    aiConfig = result.config;
    if (result.cleared) {
      aiStatus = "应用内 AI 配置已清除。";
      toast("AI 配置已清除");
    }
    render();
    navigate("settings");
  }
  if (target.id === "addTodo") {
    const title = $("#todoInput").value.trim();
    if (!title) return toast("先写下任务内容");
    const next = clone(state);
    next.todos.unshift({ id: id(), title, done: false, priority: $("#todoPriority").value, due: "" });
    await save(next);
  }
  if (target.dataset.check !== undefined) {
    const itemId = target.closest("[data-id]").dataset.id;
    const next = clone(state);
    const task = next.todos.find((item) => item.id === itemId);
    let completed = false;
    if (task) {
      task.done = !task.done;
      if (task.done) {
        completed = true;
        next.stats.completedTodos += 1;
        window.petdesk.petAction("celebrate");
      }
    }
    await save(next);
    if (completed) {
      const reward = await window.petdesk.rewardCompanion("todo");
      if (reward?.awarded) toast(`任务完成 · 默契 +${reward.points}`);
    }
  }
  if (target.dataset.delete !== undefined) {
    const itemId = target.closest("[data-id]").dataset.id;
    await save({ ...clone(state), todos: state.todos.filter((item) => item.id !== itemId) });
  }
  if (target.id === "addAlarm") {
    const value = $("#alarmDatetime").value;
    if (!value) return toast("请选择提醒时间");
    const date = new Date(value);
    const next = clone(state);
    next.alarms.push({
      id: id(), label: $("#alarmLabel").value.trim() || "PetDesk 提醒", note: $("#alarmNote").value.trim(),
      datetime: $("#alarmRepeat").checked ? "" : date.toISOString(), time: value.slice(-5), repeat: $("#alarmRepeat").checked, enabled: true,
    });
    await save(next);
    toast("提醒已保存");
  }
  if (target.dataset.alarmDelete !== undefined) {
    const itemId = target.closest("[data-id]").dataset.id;
    await save({ ...clone(state), alarms: state.alarms.filter((item) => item.id !== itemId) });
  }
  if (target.dataset.preset) {
    const seconds = Number(target.dataset.preset);
    const next = clone(state);
    next.focus.duration = seconds;
    next.focus.remaining = seconds;
    next.focus.running = false;
    next.focus.endsAt = null;
    await save(next);
  }
  if (target.id === "applyCustomFocus") {
    const minutes = Math.min(240, Math.max(1, Math.round(Number($("#customFocusMinutes").value) || 25)));
    const next = clone(state);
    next.focus.duration = minutes * 60;
    next.focus.remaining = minutes * 60;
    next.focus.running = false;
    next.focus.endsAt = null;
    await save(next);
    toast(`已设置 ${minutes} 分钟专注`);
  }
  if (target.id === "startFocus") await window.petdesk.startFocus(state.focus.remaining || state.focus.duration);
  if (target.id === "pauseFocus") await window.petdesk.pauseFocus();
  if (target.id === "resetFocus") {
    const next = clone(state);
    next.focus.running = false;
    next.focus.endsAt = null;
    next.focus.remaining = next.focus.duration;
    await save(next);
    window.petdesk.petAction({ action: "idle", silent: true });
  }
  if (target.dataset.habit !== undefined) {
    const habitId = target.closest("[data-id]").dataset.id;
    const next = clone(state);
    const habit = next.habits.find((item) => item.id === habitId);
    let checked = false;
    if (habit && habit.checkedDate !== today()) {
      checked = true;
      habit.checkedDate = today();
      habit.streak += 1;
    }
    await save(next);
    window.petdesk.petAction("celebrate");
    if (checked) {
      const reward = await window.petdesk.rewardCompanion("habit");
      if (reward?.awarded) toast(`打卡完成 · 默契 +${reward.points}`);
    }
  }
  if (target.id === "addHabit") {
    const title = $("#habitInput").value.trim();
    if (!title) return;
    const next = clone(state);
    next.habits.push({ id: id(), title, streak: 0, checkedDate: "" });
    await save(next);
  }
  if (target.id === "searchWeather" || target.id === "refreshWeather") {
    const query = target.id === "searchWeather" ? $("#weatherCity").value.trim() : "";
    if (target.id === "searchWeather" && query.length < 2) return toast("请输入至少两个字符的城市名");
    weatherLoading = true;
    render();
    navigate("weather");
    try {
      state.weather = await window.petdesk.loadWeather(query);
      toast(`已更新 ${state.weather.location.name} 天气`);
    } catch (error) {
      toast(error.message || "天气查询失败，请稍后重试");
    } finally {
      weatherLoading = false;
      render();
      navigate("weather");
    }
  }
  if (target.dataset.togglePet !== undefined) {
    const visible = await window.petdesk.togglePet();
    toast(visible ? "桌宠已显示" : "桌宠已隐藏，可用这里或托盘恢复");
  }
  if (target.id === "quitApp") window.petdesk.quit();
});

document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.id === "subjectType") selectedSubjectType = target.value;
  if (target.dataset.alarmToggle !== undefined) {
    const itemId = target.closest("[data-id]").dataset.id;
    const next = clone(state);
    const alarm = next.alarms.find((item) => item.id === itemId);
    if (alarm) alarm.enabled = target.checked;
    await save(next);
  }
  if (target.dataset.setting) {
    const key = target.dataset.setting;
    const next = clone(state);
    next.settings[key] = target.checked;
    if (key === "startup") next.settings.startup = await window.petdesk.setStartup(target.checked);
    await save(next);
  }
  if (target.dataset.textSetting) {
    const next = clone(state);
    next.settings[target.dataset.textSetting] = target.value.trim() || "桃桃";
    await save(next);
  }
  if (target.dataset.rangeSetting) {
    const next = clone(state);
    next.settings[target.dataset.rangeSetting] = Number(target.value);
    await save(next);
  }
  if (target.dataset.colorSetting) {
    const next = clone(state);
    next.settings[target.dataset.colorSetting] = target.value;
    await save(next);
  }
  if (target.dataset.selectSetting) {
    const next = clone(state);
    next.settings[target.dataset.selectSetting] = target.value;
    await save(next);
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "petNameInput") builderName = event.target.value;
  if (event.target.id === "styleDescription") builderDescription = event.target.value;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.target.id === "customFocusMinutes") {
    event.preventDefault();
    $("#applyCustomFocus").click();
  }
  if (event.target.id === "weatherCity") {
    event.preventDefault();
    $("#searchWeather").click();
  }
  if (event.target.id === "todoInput") {
    event.preventDefault();
    $("#addTodo").click();
  }
});

$("#nav").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) navigate(button.dataset.page);
});
$("#togglePet").addEventListener("click", async () => {
  const visible = await window.petdesk.togglePet();
  toast(visible ? "桌宠已显示" : "桌宠已隐藏，可点击此按钮或托盘图标恢复");
});
window.petdesk.onState((next) => { state = next; render(); });
window.petdesk.onActionPackProgress((next) => {
  actionGeneration = {
    running: !["complete", "error"].includes(next.stage),
    progress: next.progress,
    message: next.message,
  };
  render();
  navigate("pets");
});

Promise.all([window.petdesk.getState(), window.petdesk.getAiConfig()]).then(([initial, initialAiConfig]) => {
  state = initial;
  aiConfig = initialAiConfig;
  const date = new Date();
  $("#eyebrow").textContent = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  render();
  const weatherAge = Date.now() - new Date(state.weather?.updatedAt || 0).getTime();
  if (state.weather?.location && weatherAge > 30 * 60 * 1000) {
    window.petdesk.loadWeather("").catch(() => {});
  }
});
