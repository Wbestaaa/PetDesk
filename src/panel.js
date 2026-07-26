let state;
let currentPage = "home";
let pickedImage;
let selectedStyle = "pixel";
let timerInterval;
const pageTitles = {
  home: "早上好，今天想完成什么？",
  pets: "打造属于你的桌面伙伴",
  focus: "把注意力留给重要的事",
  todos: "清空脑海，一件件完成",
  alarms: "让提醒温柔地准时出现",
  habits: "小习惯会长成大变化",
  settings: "按照你的方式陪伴",
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => structuredClone(value);
const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

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
  return `<div class="grid two">
    <div class="card hero-card">
      <div>
        <small style="color:#f4b57f">YOUR GENTLE COMPANION</small>
        <h2>${escapeHtml(state.settings.petName)}已经准备好陪你开始今天</h2>
        <p>把任务分成一个个小步骤。专注的时候，它会安静看书；完成的时候，它会和你一起庆祝。</p>
        <div class="hero-actions"><button class="button orange" data-start-focus>开始专注</button><button class="button ghost" style="color:#fff;border-color:#708279" data-pet-play>和它玩一会儿</button></div>
      </div>
      <div class="pet-portrait"><span class="orb"></span>${custom ? `<img src="${custom.dataUrl}" alt="">` : `<img src="../assets/mascot.png" alt="桃桃">`}</div>
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
  const builtIns = [
    { id: "momo", type: "cat", name: "桃桃", icon: "../assets/mascot.png", body: "#f2a65a", accent: "#fff0d6", note: "橘猫 · 好奇亲人" },
    { id: "doubao", type: "dog", name: "豆包", emoji: "🐶", body: "#bd7a49", accent: "#f4ddbe", note: "柴犬 · 热情可靠" },
    { id: "yuki", type: "rabbit", name: "雪团", emoji: "🐰", body: "#eee9de", accent: "#f2b8b5", note: "兔子 · 安静敏捷" },
    { id: "foxy", type: "fox", name: "小焰", emoji: "🦊", body: "#e77d3d", accent: "#fff1da", note: "狐狸 · 聪明活泼" },
    { id: "mochi", type: "slime", name: "麻薯", emoji: "🟢", body: "#83b895", accent: "#dff0df", note: "史莱姆 · 软弹治愈" },
  ];
  const builtInCards = builtIns.map((pet) => `<div class="pet-option ${state.settings.activePet === pet.id ? "active" : ""}"
    data-select-pet="${pet.id}" data-pet-type="${pet.type}" data-pet-name="${pet.name}" data-body="${pet.body}" data-accent="${pet.accent}">
    <div class="preview">${pet.icon ? `<img src="${pet.icon}" alt="${pet.name}">` : `<span class="procedural-pet">${pet.emoji}</span>`}</div>
    <b>${pet.name}</b><small>${pet.note}</small></div>`).join("");
  const customCards = state.customPets.map((pet) => `<div class="pet-option ${state.settings.activePet === pet.id ? "active" : ""}" data-select-pet="${pet.id}">
    <div class="preview"><img src="${pet.dataUrl}" alt=""></div><b>${escapeHtml(pet.name)}</b><small>${escapeHtml(pet.style)} · 自定义</small></div>`).join("");
  return `<div class="card">
    <div class="card-head"><div><h2>我的桌宠</h2><p class="muted" style="font-size:11px;margin:6px 0 0">选择当前出现在桌面的伙伴</p></div></div>
    <div class="pet-grid">
      ${builtInCards}
      ${customCards}
    </div>
  </div>
  <div class="card" style="margin-top:18px">
    <div class="card-head"><div><h2>桌宠工坊</h2><p class="muted" style="font-size:11px;margin:6px 0 0">上传照片，制作像素、Q版、写实或水彩风伙伴</p></div></div>
    <div class="builder">
      <div class="upload-zone" id="uploadZone">${pickedImage ? `<img src="${pickedImage.resultDataUrl || pickedImage.dataUrl}" alt="预览">` : `<span style="font-size:38px">＋</span><b>选择一张图片</b><small>PNG / JPG / WEBP</small>`}</div>
      <div class="grid">
        <label class="field-label">桌宠名字<input id="petNameInput" class="field" value="我的伙伴" maxlength="20"></label>
        <div class="style-options">
          <button class="style-option ${selectedStyle === "pixel" ? "active" : ""}" data-style="pixel"><b>像素风 · 本地</b><small>离线完成，硬边像素与有限色盘</small></button>
          <button class="style-option ${selectedStyle === "chibi" ? "active" : ""}" data-style="chibi"><b>Q版 · AI</b><small>大头短身、表情鲜明的可爱角色</small></button>
          <button class="style-option ${selectedStyle === "realistic" ? "active" : ""}" data-style="realistic"><b>写实 · AI</b><small>保留外观特征，生成精致桌宠肖像</small></button>
          <button class="style-option ${selectedStyle === "watercolor" ? "active" : ""}" data-style="watercolor"><b>水彩 · AI</b><small>柔和手绘质感与干净轮廓</small></button>
        </div>
        <label class="field-label">补充描述（可选）<textarea id="styleDescription" rows="3" placeholder="例如：保留蓝色项圈，表情开心"></textarea></label>
        <div style="display:flex;gap:9px"><button class="button" id="transformImage" ${pickedImage ? "" : "disabled"}>生成预览</button><button class="button orange" id="savePet" ${pickedImage?.resultDataUrl ? "" : "disabled"}>保存并使用</button></div>
        <small class="muted">像素风无需联网；AI 风格需要在系统环境变量中设置 OPENAI_API_KEY，API 费用与 ChatGPT 订阅分开计算。</small>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:18px"><div class="card-head"><h3>动作实验室</h3><small>立即预览桌宠动作</small></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px">${["idle","walk","stretch","play","feed","study","sleep","celebrate","alert"].map((name) => `<button class="button ghost small" data-pet-action="${name}">${name}</button>`).join("")}</div>
  </div>`;
}

function focusTemplate() {
  const duration = state.focus.duration || 1500;
  return `<div class="focus-layout">
    <div class="card timer-card">
      <div>
        <div class="presets"><button data-preset="1500" class="${duration === 1500 ? "active" : ""}">25 分钟</button><button data-preset="3000" class="${duration === 3000 ? "active" : ""}">50 分钟</button><button data-preset="900" class="${duration === 900 ? "active" : ""}">15 分钟</button></div>
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
  return `<div class="settings-grid">
    <div class="card"><div class="card-head"><h3>桌面行为</h3></div>
      ${switchRow("alwaysOnTop", "始终置顶", "让桌宠保持在其他窗口上方")}
      ${switchRow("clickThrough", "鼠标穿透", "临时忽略鼠标；可从托盘恢复")}
      ${switchRow("startup", "开机启动", "登录 Windows 后自动运行")}
      ${switchRow("sound", "通知声音", "闹钟和完成提醒播放系统声音")}
    </div>
    <div class="card"><div class="card-head"><h3>外观</h3></div>
      <label class="setting-row"><div><b>桌宠名字</b><small>显示在问候与通知中</small></div><input data-text-setting="petName" class="field" style="width:130px" value="${escapeHtml(state.settings.petName)}"></label>
      <label class="setting-row"><div><b>显示大小</b><small>${Math.round(state.settings.petScale * 100)}%</small></div><input data-range-setting="petScale" type="range" min=".65" max="1.45" step=".05" value="${state.settings.petScale}"></label>
      <label class="setting-row"><div><b>毛色</b><small>内置动态桌宠颜色</small></div><input data-color-setting="bodyColor" class="color-input" type="color" value="${state.settings.bodyColor}"></label>
      <label class="setting-row"><div><b>腹部与脚垫</b><small>内置动态桌宠辅助色</small></div><input data-color-setting="accentColor" class="color-input" type="color" value="${state.settings.accentColor}"></label>
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
  $("#settings").innerHTML = settingsTemplate();
  updateTimer();
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

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, .pet-option, .upload-zone");
  if (!target) return;
  if (target.dataset.page) navigate(target.dataset.page);
  if (target.dataset.goto) navigate(target.dataset.goto);
  if (target.dataset.petAction) window.petdesk.petAction(target.dataset.petAction);
  if (target.dataset.startFocus !== undefined) { navigate("focus"); window.petdesk.startFocus(1500); }
  if (target.dataset.petPlay !== undefined) window.petdesk.petAction("play");
  if (target.dataset.selectPet) {
    const next = clone(state);
    next.settings.activePet = target.dataset.selectPet;
    if (target.dataset.petType) {
      next.settings.petType = target.dataset.petType;
      next.settings.petName = target.dataset.petName;
      next.settings.bodyColor = target.dataset.body;
      next.settings.accentColor = target.dataset.accent;
    }
    await save(next);
    toast("已切换桌宠");
  }
  if (target.id === "uploadZone") {
    pickedImage = await window.petdesk.pickImage();
    if (pickedImage) render();
  }
  if (target.dataset.style) {
    selectedStyle = target.dataset.style;
    $$(".style-option").forEach((button) => button.classList.toggle("active", button.dataset.style === selectedStyle));
  }
  if (target.id === "transformImage" && pickedImage) {
    target.disabled = true;
    target.textContent = "正在生成…";
    try {
      pickedImage.resultDataUrl = selectedStyle === "pixel"
        ? await localPixelate(pickedImage.dataUrl)
        : await window.petdesk.aiTransform({ sourcePath: pickedImage.path, style: selectedStyle, description: $("#styleDescription").value });
      render();
      toast("预览生成完成");
    } catch (error) {
      toast(error.message || "生成失败");
      target.disabled = false;
      target.textContent = "生成预览";
    }
  }
  if (target.id === "savePet" && pickedImage?.resultDataUrl) {
    await window.petdesk.saveCustomImage({ dataUrl: pickedImage.resultDataUrl, name: $("#petNameInput").value, style: selectedStyle });
    pickedImage = null;
    render();
    toast("桌宠已保存并启用");
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
    if (task) {
      task.done = !task.done;
      if (task.done) { next.stats.completedTodos += 1; window.petdesk.petAction("celebrate"); }
    }
    await save(next);
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
  if (target.id === "startFocus") await window.petdesk.startFocus(state.focus.remaining || state.focus.duration);
  if (target.id === "pauseFocus") await window.petdesk.pauseFocus();
  if (target.id === "resetFocus") {
    const next = clone(state);
    next.focus.running = false;
    next.focus.endsAt = null;
    next.focus.remaining = next.focus.duration;
    await save(next);
  }
  if (target.dataset.habit !== undefined) {
    const habitId = target.closest("[data-id]").dataset.id;
    const next = clone(state);
    const habit = next.habits.find((item) => item.id === habitId);
    if (habit && habit.checkedDate !== today()) { habit.checkedDate = today(); habit.streak += 1; }
    await save(next);
    window.petdesk.petAction("celebrate");
  }
  if (target.id === "addHabit") {
    const title = $("#habitInput").value.trim();
    if (!title) return;
    const next = clone(state);
    next.habits.push({ id: id(), title, streak: 0, checkedDate: "" });
    await save(next);
  }
  if (target.id === "quitApp") window.petdesk.quit();
});

document.addEventListener("change", async (event) => {
  const target = event.target;
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

$("#nav").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (button) navigate(button.dataset.page);
});
$("#hidePet").addEventListener("click", () => window.petdesk.hidePet());
window.petdesk.onState((next) => { state = next; render(); });

window.petdesk.getState().then((initial) => {
  state = initial;
  const date = new Date();
  $("#eyebrow").textContent = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toUpperCase();
  render();
});
