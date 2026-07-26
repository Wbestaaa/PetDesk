# PetDesk

PetDesk 是一款面向 Windows 11 的自定义桌宠与轻量效率工具。桌宠运行在透明、无边框、可置顶的窗口中；控制中心提供桌宠工坊、番茄专注、Todo、提醒、习惯打卡和外观设置。

## 当前功能

- 透明桌宠窗口：拖动、置顶、托盘、隐藏、鼠标穿透、开机启动。
- 动作状态机：待机、走动、眨眼、伸懒腰、玩耍、喂食、读书、睡觉、庆祝与提醒。
- 桌宠工坊：上传 PNG/JPG/WEBP；离线转换为像素风；可选 AI 转为 Q 版、写实或水彩风。
- 专注计时：15/25/50 分钟，暂停、重置、完成统计、桌宠陪读与系统通知。
- Todo：优先级、完成、删除和统计。
- 提醒与闹钟：一次性提醒、每天重复、桌宠气泡和 Windows 通知。
- 习惯：每日打卡与累计次数。
- 本地持久化：数据保存在 Electron 的 `userData` 目录，不上传到服务器。

## 在 Windows 11 上运行

1. 安装 [Node.js LTS](https://nodejs.org/)。
2. 解压工程，双击 `Start-PetDesk.cmd`（推荐）或 `开始使用.bat`。它会在首次启动时安装运行组件，然后打开 PetDesk。

也可以在文件夹内打开 PowerShell，手动执行：

   ```powershell
   npm install
   npm start
   ```

## 打包为安装程序

```powershell
npm run pack:win
```

也可以直接双击 `Build-Windows.cmd`（推荐）或 `构建Windows安装包.bat`。完成后到 `dist` 文件夹中找到：

- `PetDesk-0.1.1-setup-x64.exe`：安装版。
- `PetDesk-0.1.1-portable-x64.exe`：免安装版。

## 启用 AI 图片风格转换

像素风转换不需要联网。Q 版、写实和水彩转换调用 OpenAI Images API，因此需要单独的 API Key，API 使用量不包含在 ChatGPT 订阅中。

在 Windows“系统属性 → 高级 → 环境变量”中新建用户变量：

```text
变量名：OPENAI_API_KEY
变量值：你的 API Key
```

重新登录 Windows 或重启 PetDesk 后生效。不要把 API Key 写入源码、截图或提交到 Git。

## 使用方式

- 拖动桌宠：按住桌宠周围或身体移动。
- 双击桌宠：打开控制中心。
- 右键桌宠：喂食、玩耍、陪伴专注、睡觉。
- 托盘图标：重新显示桌宠、快速开始专注或退出。
- 如果开启“鼠标穿透”后无法点击桌宠，请通过系统托盘打开控制中心并关闭该选项。

## 开发说明

项目没有前端框架和远程运行时依赖，界面由原生 HTML/CSS/JavaScript 实现。Electron 主进程负责窗口、托盘、系统通知、定时器、文件选择和本地数据；渲染进程仅通过受限的 preload API 访问这些能力。

```text
PetDesk/
├─ main.js              Electron 主进程
├─ preload.js           安全 IPC 桥
├─ src/
│  ├─ panel.*           控制中心
│  ├─ pet.*             透明桌宠和动作绘制
│  └─ state.js          默认数据与闹钟计算
└─ tests/state.test.js  状态逻辑测试
```

## 后续可扩展方向

- 多帧 Sprite Sheet 导入、动作区域自动切分和动作编辑器。
- 日历同步、天气、音乐控制、剪贴板快捷操作。
- 成就、金币、装扮商店与桌宠成长系统。
- 多显示器边界行走、窗口边缘攀爬、鼠标追逐和物理碰撞。
- 本地语音提醒、语音命令和聊天能力。

## 隐私提示

本地功能不需要登录。只有主动点击 AI 风格转换时，选中的图片及提示词才会发送给所配置的 AI API。请不要上传无权处理或包含敏感信息的图片。
