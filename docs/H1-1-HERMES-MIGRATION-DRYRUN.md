# H1-1: Hermes → WoClaw 迁移可行性分析

> Step 1 of Story H1 — 整理 Hermes dry-run 报告中的可迁移项与缺口

## Hermes 数据源清单

| 数据源 | 路径 | 格式 | 大小估算 | WoClaw 目标 |
|--------|------|------|----------|-------------|
| 会话历史 | `~/.hermes/state.db` | SQLite FTS5 | ~MBs | WoClaw Topics / Memory Pool |
| Agent Memory | `~/.hermes/memories/MEMORY.md` | Markdown | ~KB | WoClaw Memory Pool |
| User Profile | `~/.hermes/memories/USER.md` | Markdown | ~KB | WoClaw Memory Pool |
| Skills | `~/.hermes/skills/*.md` | Markdown | ~KB | WoClaw Hook Scripts |
| Config | `~/.hermes/config.yaml` | YAML | ~KB | 参考文档 |

## ✅ 可迁移项（可直接映射）

### 1. Session History → WoClaw Topics + Memory Pool
- **来源**: `~/.hermes/state.db` (messages_fts FTS5 table)
- **目标**: `POST /topics/<sessionId>` + `POST /memory`
- **映射逻辑**:
  - Hermes session → WoClaw Topic（sessionId = topic name）
  - 每条 message → Topic message
  - Session metadata → Memory entry with tags `hermes:session`, `sessionId:xxx`
- **实现**: `woclaw migrate --framework hermes --session-id <id>`
- **缺口**: 无

### 2. Agent Memory → WoClaw Memory Pool
- **来源**: `~/.hermes/memories/MEMORY.md`
- **目标**: `POST /memory` (key = `hermes:memory:<entry-key>`)
- **映射逻辑**:
  - 每个 Markdown heading (# ## ###) = 一条 Memory entry
  - `label` = heading text
  - `value` = section content
  - `tags` = `["hermes", "memory", "agent"]`
- **实现**: `woclaw migrate --framework hermes --memory`
- **缺口**: Hermes 有 2,200 字符硬限制，WoClaw 无限制；超出部分需要分段写入

### 3. User Profile → WoClaw Memory Pool
- **来源**: `~/.hermes/memories/USER.md`
- **目标**: `POST /memory` (key = `hermes:user:profile`)
- **映射逻辑**:
  - `label` = "Hermes User Profile"
  - `value` = 完整 USER.md 内容
  - `tags` = `["hermes", "user", "profile"]`
- **缺口**: Hermes 1,375 字符限制导致内容不完整；WoClaw 无限制，可完整迁移

### 4. Skills → WoClaw Hook Scripts
- **来源**: `~/.hermes/skills/*.md`
- **目标**: `packages/woclaw-hooks/hermes-*` scripts
- **映射逻辑**:
  - Hermes skill = Markdown 文件含 description + trigger + actions
  - 转换为 shell/Python hook 脚本
  - Hook trigger points: SessionStart, SessionStop
- **实现**: `woclaw migrate --framework hermes --skills`
- **缺口**: Hermes skills 无标准化触发格式；需逐个解析

## ⚠️ 部分可迁移（需适配）

### 5. Session Search → Semantic Recall
- **来源**: Hermes `session_search` tool (FTS5 + Gemini Flash summarization)
- **目标**: WoClaw `GET /memory/recall?q=<query>`
- **缺口**:
  - Hermes  summarization = Gemini Flash 模型压缩，不可在 WoClaw 直接复现
  - WoClaw Semantic Recall（S10）已实现 BM25 + intent 匹配，无 LLM summarization
  - **建议**: WoClaw recall 返回 raw results，不做 summarization

### 6. Skill Self-Creation → 无直接等价
- **来源**: Hermes `learning_loop` 每 15 轮推荐创建 skill
- **目标**: 无
- **缺口**: Hermes 的 skill 自创建是 prompt-based nudging，无结构化数据
- **建议**: 不迁移；WoClaw 通过 `woclaw hook install` 手动管理

## ❌ 不兼容项（无法迁移）

| 项目 | 原因 | 建议 |
|------|------|------|
| Config YAML (`config.yaml`) | WoClaw 使用 JSON/env；YAML 结构不兼容 | 参考文档，不迁移 |
| Hard memory limits | Hermes 硬编码 2,200/1,375 字符；WoClaw 无限制 | 迁移时去限制 |
| External memory plugins | Honcho/Mem0/OpenViking 配置 | 不迁移；WoClaw 用自己的 MCP |
| RL training artifacts | `rl_training_tool.py`, `batch_runner.py` | 与 WoClaw 无关，跳过 |

## 迁移命令设计

```bash
# 完整迁移
woclaw migrate --framework hermes --all

# 分项迁移
woclaw migrate --framework hermes --sessions          # Session history
woclaw migrate --framework hermes --memory           # Agent + User memory
woclaw migrate --framework hermes --skills           # Skills → Hook scripts

# 预览（dry-run）
woclaw migrate --framework hermes --all --dry-run
```

## 实现估算

| 步骤 | 工作量 | 备注 |
|------|--------|------|
| H1-1 分析（本文档）| ✅ 完成 | |
| H1-2 路径映射实现 | ~2h | hermes-migrate.js 参考 S13-4 |
| H1-3 不兼容点记录 | ~1h | docs/HERMES-MIGRATION.md |
