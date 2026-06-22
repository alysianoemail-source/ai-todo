# AI Todo 项目总结

---

## 一、产品迭代闭环

### 1. 时间线与版本

| 阶段 | 时间 | 版本 | 核心变化 |
|------|------|------|----------|
| MVP | 第1周 | v1 | 纯前端单页，localStorage 本地存储，手动输入 todo |
| AI 接入实验 | 第2-3天 | v2-v6 | 依次尝试 Groq → OpenRouter → Gemini SDK，均因 CORS/模型名/付费等阻塞 |
| AI 接入落地 | 第4天 | v7 | 用户发现 DeepSeek 原生支持浏览器 CORS，前端直连成功 |
| 安全架构 | 第5天 | v8 | Key 迁移到 Vercel Serverless Function（`/api/chat`），前端不再暴露 |
| 稳定性修复 | 第5-6天 | v9-v15 | 修复 recluster 崩溃、confirmSummary 不回显、Service Worker 缓存污染 |

### 2. 迭代逻辑

```
手动输入 → AI 提取 → 预览确认 → 持久化存储
```

核心假设：用户输入混乱文本 → AI 拆解为可执行条目 → 人工确认后入库。

每一轮迭代围绕一个卡点：
- 第1轮：AI 能不能被浏览器调用？（CORS 问题）
- 第2轮：Key 能不能安全藏起来？（Vercel 代理）
- 第3轮：确认后数据能不能写入？（recluster 崩溃 → 降级为 `location.reload()` 强制刷新）

### 3. 指标变化

| 指标 | v1（手动输入） | v15（AI 提取） |
|------|---------------|---------------|
| 输入门槛 | 需主动拆句、去噪、结构化 | 任意碎片文本直接粘贴 |
| 提取准确率 | N/A（无 AI） | AI 提取 3-5 条/次，人工确认后入库 |
| 单次操作耗时 | 30s-2min 逐条输入 | 3s 粘贴 + 2s 确认 |
| 数据安全 | Key 暴露在前端 | Key 仅存 Vercel 环境变量 |

---

## 二、工程优化手段

### 1. 提取管道（准确召回）

前端采用双路策略：

**AI 路径（≥25 字）**：
```
用户文本 → fetch /api/chat → Vercel → DeepSeek → [{"title":"", "estimatedMinutes":30}] → 预览面板
```

**本地降级路径（无网络/AI 不可用）**：
```
用户文本 → 正则分块（句号/换行分离）→ 去噪词过滤 → optimizeTitle 压缩 → 展示
```

key prompt 设计：

> "你是待办提取工具。从混乱文本中提取可执行待办。只返回JSON数组：[{"title":"简短标题","estimatedMinutes":30}]。不要其他内容。"

约束点：
- 强制 JSON 数组输出，降低解析失败率
- 限制标题 15 字，避免 AI 复述原文
- `estimatedMinutes` 给默认值 30，保证结构完整

### 2. 可视化效果

- Todo 按优先级着色（红/橙/绿）
- 动态聚类：基于关键词共现的连通分量算法，自动将相关待办分组
- PWA + Service Worker 离线可用

### 3. 降低模型幻觉

| 手段 | 效果 |
|------|------|
| temperature=0.3 | 降低随机性，输出更稳定 |
| system prompt 强约束 JSON | 降低自由格式输出概率 |
| 正则 `content.match(/\[[\s\S]*\]/)` 提取 | 容错处理 AI 额外文字 |
| 前端去重 (`todos.some`) | 防止重复项入库 |
| AI 失败 → 本地降级 | 不因模型错误丢失用户输入 |

---

## 三、架构先进性

### 1. Memory 机制

**三层 memory 叠加**：

```
Cloud Memory（服务端） → 跨会话长期偏好
User Memory（~/.workbuddy/MEMORY.md） → 跨项目偏好
Workspace Memory（.workbuddy/memory/） → 项目内日度工作日志
```

本项目中：
- 用户偏好（简约 UI、动态聚类、Ctrl+Enter 提交）写入 User Memory
- 每次代码修改记录到 Workspace 每日日志
- 跨项目习惯（Web 优先、金融+数据背景）由 Cloud Memory 自动注入

### 2. 自主规划（Plan & React）

虽然 ai-todo 本身是单页应用而非 Agent，但**其调用方 WorkBuddy** 具备完整的 Plan & React 能力：

```
用户指令 → WorkBuddy 理解意图
         → 自主规划步骤（Plan mode）
         → 逐步执行（检索文件、修改代码、部署验证）
         → 根据结果反馈调整（React）
```

本项目全程由 WorkBuddy 自主完成（代码编写、Git 提交、CloudStudio/Vercel 部署），无需用户操作 IDE。

### 3. Vercel Serverless 架构

```
浏览器 index.html
    ↓ POST /api/chat { messages: [...] }
Vercel Serverless Function (api/chat.js)
    ↓ fetch DeepSeek API (with DEEPSEEK_API_KEY from env)
DeepSeek chat/completions
    ↓
JSON 返回前端 → 解析 → 入库
```

Key 零暴露，前端只传 messages，不传 model/headers。

---

## 总结

AI Todo 的核心价值不在任务管理，而在**降低认知摩擦**——把"想做的事"到"能做的事"之间的转换成本降到最低。技术实现上，经历了从 CORS 死局到 Vercel 代理的完整探索，最终定位为：一个极简的输入框 + 一行 AI 调用 = 可执行的待办列表。
