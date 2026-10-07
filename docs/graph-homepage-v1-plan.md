# 个人网站 V1 计划：Graph-First Homepage

## Summary
V1 做一个 **以 graph 为首页主体的轻量个人网站**：整体气质参考 [Atomic](https://atomicapp.ai/)、[Cosmograph](https://cosmograph.app/) 和 **Obsidian graph 的简洁性与低干扰感**。技术上采用 **Astro**，只有交互式 graph 区域使用 island hydration；计划重点放在 **feature、design convention、交互规则、内容建模**，不展开完整内容站。

V1 边界：
- 完成首页 graph、timeline、detail panel、基础筛选和导航
- 不在 V1 内规划完整的 paper/project 独立详情页体系
- graph 点击后的主要内容落点是 **侧边 detail panel**

## Key Changes

### 1. 页面与信息架构
- 首页由 4 个部分组成：`intro header`、`interactive graph`、`detail panel`、`minimal controls`
- graph 为首屏主视觉，占页面最大比重
- detail panel 默认收起；点击节点后展开并锁定 focus
- controls 保持极简，只包含：
  - 视图：`All / By Cluster / Over Time`
  - 类型筛选：`Papers + Projects`、`Keywords`
  - 时间模式：`Cumulative`、`Snapshot`
- 不引入复杂 dashboard、密集统计模块、多区块工具面板

### 2. 内容模型与数据约定
V1 使用一个轻量 graph 数据契约，在 Astro build-time 注入到 graph island：

```ts
type NodeType = "anchor" | "keyword"
type AnchorKind = "paper" | "project" | null

interface GraphNode {
  id: string
  label: string
  type: NodeType
  kind: AnchorKind
  cluster: string
  year?: number
  summary?: string
  href?: string | null
  tags?: string[]
  weight?: number
}

interface GraphEdge {
  source: string
  target: string
  strength?: number
  relation?: string
}

interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
```

默认语义：
- `paper` 与 `project` 同层，统一视为 `anchor`
- `keyword/tag` 统一视为下一级 `keyword`
- `cluster` 用于颜色分组，优先来自 `_Wiki` 的 `hyper_tags` 或其上层映射
- `year` 对 `paper/project` 必填；`keyword` 可为空
- `href` 在 V1 可为空；为空时只开 panel，不跳详情页

### 3. Graph 交互特性
- 默认使用 **2D force-directed graph**
- 初始视图展示完整图谱，但只显示少量关键 anchor label
- hover 节点时：
  - 高亮相邻边和相邻节点
  - 非相关节点降透明
  - 邻接 label 临时展开
- click 节点时：
  - 锁定当前节点
  - 打开 detail panel
  - 展示标题、类型、年份、cluster、简述、关联节点
- 支持轻量筛选：
  - 按 cluster
  - 按类型
  - 按时间
- timeline 为底部 scrubber：
  - `Cumulative`：显示截至该年的累积网络
  - `Snapshot`：显示该年附近活跃 anchor 及其直接关联 keyword
- 时间变化时保留空间记忆，避免完全随机重排

### 4. 视觉与设计规范
总体目标：
- 借 **Obsidian** 的克制与简洁
- 借 **Cosmograph** 的清晰和可读布局
- 借 **Atomic** 的精致感与轻氛围
- 不做产品后台，也不做炫技 3D 图

视觉原则：
- 浅色、偏暖灰背景，不用纯白
- 线条极细、半透明、低对比
- 颜色只承担 cluster/type 编码，不做大面积装饰
- UI 外壳尽量隐身，让 graph 自身成为主体
- 默认视图接近 Obsidian graph：疏、淡、静

节点规范：
- `anchor / paper`：中等偏大圆点，实心或细描边
- `anchor / project`：与 paper 同层，用轮廓或填充差异区分，不加重图标语言
- `keyword`：更小、更淡，作为结构节点而非视觉主角
- label 默认只显示：
  - 当前 focus 节点
  - 关键 anchor
  - hover 邻接节点
- cluster 不做厚重气泡；默认只用 **颜色分组 + 布局聚集**
- 如需加强 cluster 边界，只允许非常淡的 haze 或细 hull，不能破坏 Obsidian 式清爽感

排版原则：
- 字体中性、安静、现代，不要过强“未来科技”感
- 页面文案尽量短，像研究地图入口，而不是产品 landing page
- detail panel 信息密度适中，优先 1 段摘要 + 关联项，不堆 metadata

### 5. 动效规范
动效要有，但必须 **像 Obsidian 一样克制**，只用于帮助理解结构，不制造存在感。

允许的动效：
- 首次进入时 graph 从轻微散态缓慢 settle
- hover 时相邻节点与边做柔和 opacity / scale 过渡
- click focus 时镜头或视口做短距离平滑居中
- timeline 拖动时做连续重构和透明度过渡

禁止的动效：
- 大幅弹跳、强 easing、粒子特效、霓虹脉冲
- 高频持续漂浮
- 节点不断自发缩放或闪烁
- 为“酷炫”而存在的 3D 旋转

默认动效节奏：
- 快速 hover 反馈
- 中速 focus 切换
- 慢速初次 settle
- 全站动效统一为“低幅度、低频率、短路径”

兼容要求：
- 支持 `prefers-reduced-motion`
- reduced motion 下保留状态切换，但取消连续位移动画和大部分 layout 过渡

### 6. Astro 与实现约束
- 使用 **Astro** 作为页面壳体与静态内容层
- 只有 graph 区域做 island hydration
- graph 数据在 build-time 注入，不依赖运行时后端
- 技术实现保持轻量：
  - Astro page/layout 负责结构、SEO、静态文本
  - 单个 `GraphIsland` 负责 graph、timeline、panel 状态
- V1 不规划：
  - 实时搜索索引
  - 服务端图分析
  - 用户编辑
  - 复杂 CMS
  - 多页面 graph 应用结构

## Test Plan
- 首屏进入后，用户能快速看懂 graph 是网站主体，而不是背景装饰
- 用户能清楚区分 `paper/project` 和 `keyword`
- cluster 通过颜色与空间分布可感知，但画面仍保持简洁
- timeline 拖动后，研究发展脉络可见，且不会造成布局迷失
- hover、focus、panel 打开关闭行为一致，不丢失上下文
- 动效整体克制，不喧宾夺主；reduced motion 下依然可用
- 桌面端以 graph 为主；移动端可降级为较小画布 + drawer panel
- JS 关闭时首页仍保留 intro 与静态摘要内容，不至于空白

## Assumptions
- V1 只做首页体验，不做完整内容站与独立详情页体系
- `paper` 与 `project` 为同层 anchor；`keyword/tag` 为下一级结构节点
- timeline 是 V1 必选功能
- 数据规模不大，优先优化可读性，不为大图谱做复杂性能设计
- 视觉参考优先级为：`Obsidian 简洁性` → `Cosmograph 可读性` → `Atomic 精致感`
- `_Wiki` 是主要语义来源；若缺少 `paper/project/year` 元数据，初版允许用静态数据文件手工补齐
