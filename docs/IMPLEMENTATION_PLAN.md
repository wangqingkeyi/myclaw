# Personal AI Assistant Framework — Implementation Plan

> 基于 `docs/TECHNICAL_SPEC.md` 第 22 章 “Implementation Phases” 细化。目标是先打通最小可运行链路（MVP），再按 Phase 2/3 扩展高级能力。

---

## 1. 规划目标与范围

- **目标**：在最短路径内交付可运行、可验收、可扩展的个人 AI 助手框架。
- **策略**：
  1. 先完成 **MVP 主链路**：`CLI message -> Permission -> Tool -> Event -> SQLite -> Response`。
  2. 再按 Technical Spec 的演进方向推进 Phase 2/3 能力。
  3. 所有后续模块必须与 MVP 的接口契约兼容，避免重构式返工。

---

## 2. MVP 定义（Phase 1 重排）

### 2.1 MVP 最小模块

MVP 包含以下 6 个核心模块（与建议一致）：

1. **Config Loader**
2. **EventBus**
3. **Tool System**
4. **Permission Engine**
5. **Orchestrator**
6. **SQLite Storage**（最小落库能力，提前并入 MVP）

> 说明：Technical Spec 原始 Phase 1 未强制 SQLite 持久化；本计划将 SQLite 的“事件/消息最小落库”前移到 MVP，以满足可审计与重启后可追踪的底线能力。

### 2.2 MVP 非目标（明确不做）

- 不做 Telegram/Slack/WeChat 多渠道。
- 不做 Scheduler。
- 不做 Plugin 动态扩展加载。
- 不做 Container Isolation。
- 不做并发队列与复杂 steering。

---

## 3. MVP 模块设计与验收

以下每个模块均给出：**输入/输出接口、依赖、DoD、验收方式**。

### 3.1 Config Loader

**输入接口**
- 文件输入：`config/app.yml`（或 `.json`，二选一）
- 环境变量：`APP_ENV`、`LLM_PROVIDER`、`LLM_MODEL`、`SQLITE_PATH`（允许覆盖文件配置）

**输出接口**
- 导出统一配置对象 `AppConfig`（已完成 schema 校验与默认值填充）。
- 对外 API：`loadConfig(): AppConfig`

**依赖**
- `zod`（schema 校验）
- `yaml`（若使用 yml）

**DoD**
- 缺失必填项时启动失败并输出可读错误。
- 支持默认值（如默认 `channel=cli`）。
- 支持环境变量覆盖。

**验收方式**
- 用 3 组配置样例跑启动：合法配置、缺失字段、错误类型。
- 期望：合法通过；非法均在启动期报错且包含字段路径。

---

### 3.2 EventBus

**输入接口**
- `emit(eventName, payload)`
- `on(eventName, handler)`
- `off(eventName, handler)`

**输出接口**
- 支持同步/异步订阅处理。
- 提供基础事件目录（至少）：
  - `message.inbound`
  - `permission.checked`
  - `tool.before`
  - `tool.after`
  - `tool.denied`
  - `message.outbound`
  - `storage.persisted`

**依赖**
- 无强依赖（可基于 Node 内置 `EventEmitter` 或轻量封装）

**DoD**
- 事件按触发顺序可观测。
- 任一 handler 异常不会导致进程崩溃（错误被记录并继续后续流程）。

**验收方式**
- 为一次完整请求注册监听器并记录事件序列。
- 断言事件至少包含：`message.inbound -> permission.checked -> tool.before/after -> storage.persisted -> message.outbound`。

---

### 3.3 Tool System

**输入接口**
- `defineTool(meta, handler)` 定义工具。
- `scanTools(dir)` 扫描 `tools/` 并注册。
- `executeTool(name, args, context)`（仅供 orchestrator 内部调用）。

**输出接口**
- 标准化工具描述：名称、参数 schema、能力标签、风险级别。
- 统一执行结果：`{ ok: boolean, data?: any, error?: string }`

**依赖**
- `zod`（参数校验）
- EventBus（发出 tool.before/after/denied 事件）

**DoD**
- 工具参数在执行前完成校验。
- 工具执行前必须经过权限判定。
- 工具异常可捕获并返回结构化错误，不中断主进程。

**验收方式**
- 用 `read`（安全）与 `bash`（高风险）两类工具做对比。
- 验证 allow/deny/ask 三种权限路径都能进入对应分支并产生日志事件。

---

### 3.4 Permission Engine

**输入接口**
- 权限文件：`config/permissions.yml`
- 判定请求：`check({ actor, groupId, tool, args, channel })`

**输出接口**
- 判定结果：`allow | ask | deny`
- 判定原因：`reason`（规则命中信息）

**依赖**
- `yaml`（规则加载）
- Tool metadata（风险级别/标签）

**DoD**
- 至少支持基于 `toolName` 与 `riskLevel` 的规则匹配。
- `ask` 分支在 CLI 可交互确认。
- 结果必须发出 `permission.checked` 事件。

**验收方式**
- 配置白名单、黑名单和 ask 策略各一条。
- 对同一用户触发 3 次工具请求，断言分别得到 allow/deny/ask。

---

### 3.5 Orchestrator

**输入接口**
- 频道输入（MVP 仅 CLI）：`onMessage(message)`
- 依赖注入：`config, eventBus, permissionEngine, toolSystem, storage`

**输出接口**
- 驱动主流程：接收消息、调用 agent、处理工具请求、输出回复。
- 对外暴露：`start()`、`stop()`。

**依赖**
- Config Loader
- EventBus
- Permission Engine
- Tool System
- SQLite Storage
- pi-mono Agent（LLM 与 agent loop）

**DoD**
- 能稳定处理单会话串行请求。
- 任何子模块错误能转换为用户可读错误，不导致进程退出。
- 每条消息都有完整 traceId（或 messageId）贯穿日志与事件。

**验收方式**
- 执行最小 E2E 用例（见第 4 节），验证流程闭环。

---

### 3.6 SQLite Storage（MVP 最小落库）

**输入接口**
- `saveInboundMessage(record)`
- `saveEvent(record)`
- `saveOutboundMessage(record)`
- `getConversation(sessionId, limit)`（可选）

**输出接口**
- SQLite 表最小集合：
  - `messages_inbound`
  - `events`
  - `messages_outbound`

**依赖**
- `better-sqlite3`

**DoD**
- 启动时自动建表/迁移（最小 schema）。
- 写入失败可重试或返回错误并记日志。
- 可通过 SQL 查询到一条消息完整链路（入站、权限、工具、出站）。

**验收方式**
- 跑完 E2E 后执行 SQL：
  - 验证入站消息存在。
  - 验证至少一条权限事件与工具事件存在。
  - 验证出站消息存在且 `correlation_id` 可关联。

---

## 4. 最小端到端验收用例（MVP Gate）

### 4.1 用例名称
**CLI 单通道消息处理闭环**

### 4.2 前置条件
- 仅启用 CLI channel。
- 注册 1 个低风险工具（示例：`read` 或 `echo`）。
- 权限策略配置：该工具对当前 actor 为 `allow`。
- SQLite 数据库可写。

### 4.3 流程步骤
1. 用户在 CLI 输入消息（例如：`列出当前目录文件`）。
2. Orchestrator 接收并发出 `message.inbound`。
3. Agent 请求调用工具。
4. Permission Engine 执行判定并返回 `allow`，发出 `permission.checked`。
5. Tool System 执行工具，发出 `tool.before` 和 `tool.after`。
6. Storage 将关键事件与消息写入 SQLite，发出 `storage.persisted`。
7. Orchestrator 输出最终回复到 CLI，并发出 `message.outbound`。

### 4.4 验收标准（全部满足）
- CLI 能看到最终响应文本。
- 过程中存在权限判定记录（非绕过）。
- 工具调用事件完整（before/after 或 denied）。
- SQLite 可查询到该请求的入站、事件、出站全链路记录。
- 全链路使用同一个 `correlation_id` 可追踪。

---

## 5. 里程碑与阶段拆分

> 继承 Technical Spec 的阶段思想，但将 MVP 作为独立 Gate。

### Phase 1（MVP）: 最小闭环可运行

**范围**
- Config Loader / EventBus / Tool System / Permission Engine / Orchestrator / SQLite minimal storage
- 单通道 CLI

**出口标准（Exit Criteria）**
- 第 4 节 E2E 用例通过。
- 关键路径具备基础自动化测试（至少单测 + 一条集成用例）。

---

### Phase 2: Scheduler + Plugin（建立扩展能力）

**新增能力**
- Scheduler（cron/interval 任务触发）
- Plugin System（插件扫描、生命周期、Hook）
- 与存储集成：任务定义与执行记录持久化

**前置依赖**
- MVP 已稳定：事件、权限、工具执行契约冻结（v1）。
- SQLite schema 支持新增表并向后兼容。

**兼容策略**
- 插件只通过 EventBus/PluginAPI 扩展，不允许直接侵入 Orchestrator 私有状态。
- Scheduler 触发的“系统消息”复用与 CLI 消息同一处理管线（同权限检查与事件审计），避免“双轨逻辑”。

**阶段验收**
- 可创建一个定时任务并自动触发一次工具调用。
- 插件可订阅工具/权限事件并输出审计日志。

---

### Phase 3: Container Isolation（可选高安全模式）

**新增能力**
- 工具执行容器化（如 Docker/Firecracker 抽象层）。
- 按工具风险级别选择隔离策略：`none | process | container`。

**前置依赖**
- Phase 2 的 Plugin/Scheduler 已在统一事件链路下运行。
- Tool System 已支持执行器抽象（Executor Interface）。

**兼容策略**
- 默认保持 `mode: none`（向后兼容本地执行）。
- 引入 `ToolExecutor` 抽象：
  - `LocalExecutor`（现有实现）
  - `ContainerExecutor`（新增实现）
- 对上层 Orchestrator 保持同一返回结构，不改变业务调用方式。

**阶段验收**
- 同一工具在 `none` 与 `container` 下输出语义一致。
- 容器失败时可降级或明确报错，不影响主进程稳定性。

---

## 6. 风险与缓解

- **风险 1：权限逻辑后置导致审计缺口**  
  缓解：在 Tool System 内强制“先判定后执行”，并通过事件序列校验。

- **风险 2：Scheduler/Plugin 提前引入导致主链路不稳定**  
  缓解：严格 MVP Gate，Phase 2 之前不合入高阶能力。

- **风险 3：Container 模式改变工具行为**  
  缓解：通过统一 Executor 接口与回归用例保证行为等价。

- **风险 4：SQLite schema 快速演进造成迁移成本**  
  缓解：从 MVP 开始引入 migration 版本号与向后兼容字段策略。

---

## 7. 交付清单

- `docs/IMPLEMENTATION_PLAN.md`（本文档）
- MVP 验收用例脚本（建议放入 `tests/e2e/cli_minimal_flow.test.ts`）
- 最小 SQL 校验脚本（建议放入 `scripts/verify_mvp_sqlite.sql`）

