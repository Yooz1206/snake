# Snake · 每日一局

[![CI](https://github.com/Yooo1206/snake/actions/workflows/ci.yml/badge.svg)](https://github.com/Yooo1206/snake/actions/workflows/ci.yml)

**零依赖的贪吃蛇，每天一局。** 没有构建步骤、没有框架、没有追踪——每天同一开局、三次机会、一键生成战绩卡，装到主屏幕后可离线游玩。

[**▶ 在线试玩**](https://yooo1206.github.io/snake/) · [PRD](docs/superpowers/specs/2026-10-20-snake-v1.1-prd.md) · [实施计划](docs/superpowers/plans/2026-10-20-snake-v1.1.md)

---

## 玩什么

| 模式 | 随机性 | 记录 | 分享 |
| :-- | :-- | :-- | :-- |
| **每日挑战** | 日期种子（同一天所有人同一开局） | 今日最佳、剩余次数、连续天数 | 生成 1080×1350 战绩卡 |
| **练习模式** | `Math.random()` | 仅历史最高分 | 不生成每日卡 |

规则：每天 3 次机会；次数用完前每天可重开；连续天数只在当日得分 ≥10 时结算；得分 <10 既不计入也不清零。

## 为什么它不像一个 `setInterval` 玩具

- **规则与渲染分离**：`js/game.js` 是纯状态机，不碰 DOM、不读时钟、不用 `Math.random`——随机源由外部注入，所以每日挑战可以复现。
- **固定步长 + 插值渲染**：逻辑按整格推进，画面在两格之间插值；加速不会让模拟跑偏。
- **输入缓冲**：最多缓存两次转向，反向输入被拒绝，疯狂连按不会自缠。
- **状态机完整**：`ready → running ⇄ paused → countdown → running`，另有 `over` 与 `won`；自动暂停恢复走 3-2-1，倒计时期间输入被忽略且不会死亡。

## 操作

| 动作 | 键盘 | 触屏 |
| :-- | :-- | :-- |
| 转向 / 开始 | `↑ ↓ ← →` 或 `W A S D` | 滑动 |
| 开始 / 暂停 / 继续 | `空格` | 点按棋盘 |
| 重开（练习） | `R` 两次，2 秒内 | — |
| 静音 | `M` | 页脚按钮 |

每日模式里 `R` 只会暂停，不会重开——要开新的一局得先「结束本局」，因为每局都要扣一次机会。

## 架构

```
index.html             结构、overlay、aria-live 区域
manifest.webmanifest   PWA 元数据（192 / 512 / maskable）
sw.js                  预缓存、导航 network-first、静态 cache-first
css/style.css          布局、视觉令牌、44px 触控目标
js/config.js           所有可调参数（棋盘、速度、次数、倒计时、缓存名）
js/game.js             纯规则：移动、碰撞、生长、计分、胜利、倒计时、重开保护
js/rng.js              FNV-1a32 + mulberry32，日期种子
js/daily.js            每日状态、次数、连续天数、7 天清理、损坏恢复
js/copy.js             界面文案（对照 PRD §8.2）
js/controls.js         失焦防抖、倒计时次数上限、倒计时数值
js/share.js            战绩卡绘制 + Web Share / 下载 / 复制（动态加载）
js/ios.js              iOS 安装提示的判定（7 天后、一次、standalone 不出现）
js/pwa.js              SW 注册、更新提示、?sw=off
js/renderer.js         canvas 绘制、插值、粒子、震屏
js/audio.js            WebAudio 合成音效
js/input.js            键盘 + 滑动，空格去重
js/timestep.js         固定步长累加器
js/main.js             胶水层：循环、HUD、模式、overlay
```

## 测试

```bash
node --test              # 67 项：单元 + 尺寸预算
python -m http.server 8123
chrome --headless=new --remote-debugging-port=9333 http://127.0.0.1:8123/
node tools/v11-check.mjs      # 真浏览器：状态机、倒计时、分享卡、离线重载
node tools/device-check.mjs   # 设备矩阵：iPhone / Android / 320px、44px、iOS 提示
```

单测覆盖：种子确定性、同种子同输入逐步一致、不同日期分叉、次数扣减与钳制、连续天数四种情况、损坏 JSON 恢复、7 天清理、`won` 状态、倒计时期间不推进、重开保护两次按压、分享文案与降级链、对比度 ≥4.5:1、首屏体积。

## 性能

| 指标 | 目标 | 现状 |
| :-- | :-- | :-- |
| 首屏 HTML+CSS+JS | ≤ 42KB | **40.0KB（未压缩）/ 12.7KB gzip** |
| 第三方请求 | 0 | 0 |
| 首屏字体 | 0 | 0 |

首屏只包含绘制第一帧真正需要的九个文件：`index.html`、`style.css`、`main`、`game`、`renderer`、`input`、`timestep`、`config`、`rng`。**每日状态、音效、Service Worker、iOS 判定、分享卡**都用动态 `import()` 在首帧之后加载——它们分别只影响次数/天数文案、声音、离线与分享，不参与第一屏的绘制。`test/size.test.js` 会走一遍静态 import 图，超过 42KB 直接让 CI 失败。

## 可访问性（诚实边界）

做到：小字对比度 ≥4.5:1（`--muted` 已改为 `#7a8796`）、所有可点元素 ≥44×44、仅键盘可完成开始/暂停/继续/重开/静音、焦点可见、`aria-live` 播报开始/破纪录/结束/剩余次数、`prefers-reduced-motion` 全面生效。

**不承诺**：贪吃蛇是空间视觉游戏，v1.1 不做「屏幕阅读器完整可玩」。承诺的是状态可听、流程可键盘完成、对比度与触控达标。

**iOS 安装**：Safari 没有 `beforeinstallprompt`，所以不做自定义弹窗；首次访问满 7 天后，ready 态页脚出现一行「分享 → 添加到主屏幕，离线可玩」，只出现一次（`snake:iosTipSeen:v1`），主屏启动（standalone）时不出现。

## 真机验证

自动化到此为止：`tools/device-check.mjs` 是**仿真**（UA + 触控 + 视口），跑四套配置（iPhone 15 / Android / iPhone SE 320px / iPhone 横屏）共 16 条断言，能证明布局、44px、iOS 提示时机与横屏收缩；但证明不了 Safari 分享面板、微信 WebView 降级、安全区与主屏启动。发布前按 [docs/device-checklist.md](docs/device-checklist.md) 走一遍实体设备。

## 本地运行

ES 模块不能从 `file://` 加载，起一个静态服务器即可：

```bash
python -m http.server 8123
# 打开 http://127.0.0.1:8123
```

调试 Service Worker：访问 `?sw=off` 会注销 SW 并清空缓存。

## License

[MIT](LICENSE) © 2026 Yooo1206
