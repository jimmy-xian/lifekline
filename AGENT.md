# AGENT.md

## 项目概览

这是一个以 `Vite + React 19 + TypeScript + FastAPI` 为主的前后端项目，用于把八字命理分析结果可视化为人生 K 线图。当前主链路是：

1. `components/BaziForm.tsx` 收集四柱、大运、推演范围、模型配置与 Debug 开关。
2. `services/geminiService.ts` 负责：
   - 计算大运顺逆
   - 拼接 Prompt
   - 按“单次查询最大年限”拆分多个年龄段请求
   - 请求 `/api/chat`
   - 合并分段 `chartPoints`
   - 解析并校验模型返回
3. `backend/main.py` 将请求转发到 OpenAI 兼容接口模型，并返回 `{ result: string }`。
4. 前端将模型返回的 JSON 映射为：
   - `components/LifeKLineChart.tsx` 的 K 线图数据
   - `components/AnalysisResult.tsx` 的命理报告
   - `App.tsx` 中的 Debug 面板

默认把这个仓库视为“小型单页应用 + 一个本地 FastAPI 代理后端”。

## 当前运行模型

- 前端：`Vite`
- 后端：`FastAPI`
- 模型协议：OpenAI 兼容接口
- 前端请求路径：固定 `/api/chat`
- Vite 开发时通过代理把 `/api/*` 转发到本地 `8000` 端口

本地常用命令：

- 安装前端依赖：`npm install`
- 启动前端：`npm run dev`
- 启动后端：`npm run dev:backend`
- 构建前端：`npm run build`
- 安装后端依赖：`pip install -r backend/requirements.txt`

## 目录与职责

- `App.tsx`: 页面编排、加载/错误状态、结果展示、Debug 面板
- `components/BaziForm.tsx`: 表单输入、前端校验、顺逆行提示、Debug 开关
- `components/LifeKLineChart.tsx`: Recharts K 线图与 tooltip
- `components/AnalysisResult.tsx`: 命理总评与分项卡片
- `services/geminiService.ts`: Prompt 生成、分段请求、结果解析、合并、调试信息收集
- `constants.ts`: 系统提示词与状态开关
- `types.ts`: 表单、图表、报告、Debug 的共享类型
- `backend/main.py`: FastAPI 入口与 OpenAI 兼容接口转发
- `backend/requirements.txt`: 后端依赖
- `vite.config.ts`: 前端开发代理与构建配置
- `README.md`: 面向用户的启动说明

## 当前仓库的真实状态

后续 agent 动手前，先注意这些现状：

- 模型配置字段 `modelName`、`apiBaseUrl`、`apiKey` 现在是真正生效的，不再是遗留 UI。
- 当前不是单次请求全量固定实现，而是支持按年龄段分段请求：
  - `yearLimit`：总推演年限
  - `maxYearsPerRequest`：单次查询最大年限
- 例如 `yearLimit=30` 且 `maxYearsPerRequest=10` 时，会拆成：
  - `1-10`
  - `11-20`
  - `21-30`
- 当前服务层已采用“1.5 方案”：
  - 第一步先做一次总纲推演
  - 第二步把总纲摘要作为固定依据，注入后续每个年龄分段
  - 最终分析报告优先取总纲结果，`chartPoints` 来自分段合并
- Debug 模式开启后，页面会显示：
  - 提交给后端的请求体
  - 后端原始响应
  - 模型原始文本
  - 清洗后的文本
  - 解析错误
- 后端日志已具备基础链路追踪能力，但前端页面还没有显示“当前推演到第几段”的进度文案。

## 当前已知问题

这是当前最需要注意的部分：

- 模型输出稳定性仍然一般，尤其在：
  - 年限较长时
  - 要求 JSON 严格格式时
  - 同时要求详细流年 `reason` 时
- 分段请求虽然降低了单次输出长度，但仍可能出现：
  - 某一段只返回部分年份
  - `age` 不连续
  - 返回合法 JSON，但缺少 `chartPoints`
  - 第一段总评与后续分段风格不完全一致
- 当前已经进入“总纲推演 + 分段推演”的双阶段结构，但仍有这些风险：
  - 总纲与分段之间仍可能出现轻微口径漂移
  - 分段流年质量依旧受模型单次输出稳定性影响
  - 如果总纲本身判断偏了，后续所有分段都会沿着这个偏差展开

如果用户说“输出结果还是不太对”，优先先查：

1. Debug 面板里的原始返回是否完整
2. 是哪一段年龄范围先开始跑偏
3. 偏差是格式错误，还是命理内容错误
4. 是否需要把总评与分段推演彻底拆开

## 默认工作方式

- 优先做小而准的修改，不要先做架构重写。
- 保持中文产品语境，新增文案优先与现有 UI 风格一致。
- 如果改了 `UserInput`、`AnalysisData`、`KLinePoint`、`DebugInfo`，同步检查表单、服务层、图表层、结果层。
- 如果改了 Prompt 结构，必须同步检查：
  - `constants.ts`
  - `services/geminiService.ts`
  - 前端解析逻辑
- 如果改了 `/api/chat` 的返回格式，必须同步检查前端的 `jsonResponse.result` 读取逻辑。
- 如果改了 OpenAI 兼容请求体，必须确认 DeepSeek 等兼容服务仍可调用。

## Prompt 与模型返回

- `generateLifeAnalysis` 的核心仍然是：让模型返回严格 JSON。
- 返回文本可能被包在 ```` ```json ```` 代码块里，前端会先清理再解析。
- 当前服务层会校验：
  - `chartPoints` 是否存在
  - 分段条数是否正确
  - `age` 是否连续
- 若校验失败，会抛出更具体的错误并在 Debug 模式下暴露原始内容。

## 图表约定

- `KLinePoint` 的 `open/close/high/low/score` 默认都是 `0-100`。
- `LifeKLineChart.tsx` 使用 `bodyRange + shape` 自绘 K 线，不是标准金融组件。
- `daYun` 用于分段和参考线，不要误替换成流年干支。
- 图表标题会按 `chartData.length` 动态显示当前结果年数。

## 表单与类型

- `startAge`、`yearLimit`、`maxYearsPerRequest` 在输入态都是字符串，服务层里再 `parseInt`。
- 性别枚举值是英文：`Male` / `Female`，UI 文案是中文。
- `debugMode` 是可选布尔值，开启后会把完整调试信息展示在页面中。

## 修改前后的检查清单

- 需求影响的是 UI、Prompt、API、数据结构，还是分段策略
- `types.ts` 是否仍与调用链一致
- `/api/chat` 输入输出是否仍与前端匹配
- 分段合并后 `chartPoints` 是否仍连续
- 图表 tooltip 和分析卡片是否仍能消费返回数据
- Debug 模式是否还能正确显示每一段原始内容

## 验证建议

- UI、Prompt、类型改动：优先执行 `npm run build`
- 后端改动：至少执行 `python -m py_compile backend/main.py`
- 改 `/api/chat` 或分段逻辑：至少手工做一次请求路径、返回格式、合并结果核对
- 只改文档：检查 Markdown 结构和路径即可

## 如果本地联调失败，先确认

- FastAPI 后端是否启动
- `backend/requirements.txt` 是否已安装
- `apiBaseUrl`、`modelName`、`apiKey` 是否与上游兼容服务匹配
- 当前分段范围是否过大，导致模型输出失稳
- 是否开启 Debug 模式来查看具体原始返回

## 给未来 agent 的建议

- 这个仓库最大的难点不是代码量，而是“大模型输出稳定性”和“分段策略设计”。
- 不要只看前端报错文案，要优先看 Debug 面板里的原始内容。
- 当前实现已经不是“单次全量请求”的简单模式，改动服务层时务必确认不会破坏分段合并逻辑。
- 如果后续要继续提升准确性和一致性，优先优化“总纲如何表达为稳定约束”，而不是简单继续加长 Prompt。
