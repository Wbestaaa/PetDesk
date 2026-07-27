# PetDesk 标准动作模式 v1

这份规范让内置绘制宠物、单张图片宠物、AI 生成九动作包和未来的 Sprite Sheet 角色包使用同一套动作指令。运行时代码位于 `src/pet-actions.js`，此文档说明角色素材如何与它对接。

## 九类动作

| 动作组 | 必备动作 | 可选动作 | 典型触发 |
| --- | --- | --- | --- |
| `idle` 待机 | `idle`、`blink` | `pet`、`stretch` | 启动、空闲、单击 |
| `locomotion` 移动 | `walk` | `run`、`jump` | 自主活动、追随 |
| `emotion` 情绪 | `happy` | `shy`、`sad`、`angry`、`surprised` | 状态与对话 |
| `interact` 互动 | `play` | `pet`、`wave` | 用户点击、菜单 |
| `feed` 进食 | `feed` | `drink` | 喂食、喝水 |
| `work` 学习与工作 | `study` | `write`、`type` | 专注开始 |
| `rest` 休息 | `sleep` | `nap`、`yawn` | 休息、夜间 |
| `celebrate` 庆祝 | `celebrate` | `dance`、`confetti` | 完成专注或任务 |
| `alert` 提醒 | `alert` | `alarm`、`nudge` | 闹钟、待办提醒 |

角色缺少可选动作时，运行时会回退到同组的必备动作；缺少整个动作组时回退到 `idle`。

## 16 方向

方向按从右侧开始顺时针排列：

`E, ENE, NE, NNE, N, NNW, NW, WNW, W, WSW, SW, SSW, S, SSE, SE, ESE`

角色包可以只提供 `E/W` 或八方向，未提供的方向由最近方向或水平镜像补齐。完整 16 方向适合有屏幕行走和追随鼠标需求的角色。

## 推荐角色包结构

```text
my-pet/
├─ manifest.json
├─ portrait.png
└─ sprites/
   ├─ idle/
   │  ├─ S.png
   │  └─ E.png
   ├─ locomotion/
   │  ├─ walk-S.png
   │  └─ walk-E.png
   └─ celebrate/
      └─ celebrate-S.png
```

`manifest.json` 示例：

```json
{
  "schemaVersion": 1,
  "id": "my-pet",
  "name": "我的桌宠",
  "actionPattern": "petdesk-standard-v1",
  "sprite": {
    "frameWidth": 256,
    "frameHeight": 256,
    "framesPerSecond": 12
  },
  "fallbacks": {
    "run": "walk",
    "dance": "celebrate",
    "write": "study"
  }
}
```

内置动作素材还可以在 `actions` 中直接映射独立图片，并通过 `speech` 为每个动作提供角色专属回复：

```json
{
  "actions": {
    "idle": "actions/idle.webp",
    "pet": "actions/pet.webp",
    "study": "actions/study.webp"
  },
  "speech": {
    "pet": ["收到摸摸，今天的心情加一朵小花。"],
    "study": ["书翻开了，我安静陪读。"]
  }
}
```

运行时会读取当前角色的 `manifest.json`，预载动作素材，优先使用角色专属回复，再补充通用及时间、待办、天气等情境回复。当前版本也让单张自定义图片读取动作模式的分类、默认时长和动画类；Sprite Sheet 导入器可在后续版本按照此规范扩展，而无需更改专注、提醒、互动等业务指令。

## AI 九动作包

桌宠工坊会让图片编辑模型一次生成 3×3 动作表，固定顺序为：

```text
idle       walk        pet
stretch    play        study
sleep      celebrate   alert
```

主进程随后把动作表切成九张 PNG、从图像边界连通区域中移除纯色背景，并保存为：

```text
userData/pets/<pet-id>/
├─ manifest.json
└─ actions/
   ├─ idle.png
   ├─ walk.png
   ├─ pet.png
   ├─ stretch.png
   ├─ play.png
   ├─ study.png
   ├─ sleep.png
   ├─ celebrate.png
   └─ alert.png
```

自定义动作包不会把九张图片全部写进普通状态文件；渲染进程只通过受限 IPC 按当前角色读取素材。删除动作包时，整个 `<pet-id>` 文件夹会先移入系统回收站。

## 正反馈触发原则

桌宠反馈分为三层：动作和台词提供即时反馈，默契提示展示本次奖励，控制中心的默契等级保存长期进度。低成本互动只增加少量默契并设置冷却；完成待办、习惯或专注等真实行为获得更多奖励。预览动作不计奖励，以避免重复点击动作实验室刷取进度。
