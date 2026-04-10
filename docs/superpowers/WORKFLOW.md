# WoClaw Superpowers Workflow

本目录遵循 [Superpowers](https://github.com/obra/superpowers) 开发方法论。

## 目录结构

```
docs/superpowers/
├── specs/          # 设计文档 (design documents)
│   └── YYYY-MM-DD-<topic>-design.md
└── plans/          # 实施计划 (implementation plans)
    └── YYYY-MM-DD-<feature-name>.md
```

## 开发流程

### 1. 🔍 Brainstorming（设计探索）

**触发：** "help me plan [功能]"

**流程：**
1. 探索项目上下文（文件、文档、最近提交）
2. 一次问一个问题，澄清需求
3. 提出 2-3 个方案及其权衡
4. 分段展示设计，获得用户批准
5. 写入 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`

**硬性门控：** 在设计批准前，**禁止**写代码！

### 2. 📋 Writing Plans（实施计划）

**触发：** 设计批准后

**原则：**
- 每个任务 2-5 分钟可完成
- 每个任务有精确的文件路径、完整代码、验证步骤
- DRY、YAGNI、TDD

**输出：** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

### 3. 🧪 Test-Driven Development（TDD）

**强制规则：**

```
无失败的测试 → 不写生产代码
```

**循环：**
1. **RED** — 写一个失败的测试
2. **GREEN** — 写最小代码让它通过
3. **REFACTOR** — 重构优化

### 4. 🤖 Subagent-Driven Development（子 Agent 驱动）

**触发：** 有多个独立任务时

**流程：**
1. 为每个任务 dispatch 一个 fresh subagent
2. 两阶段审查：spec 合规 → 代码质量
3. 完成后合并到主分支

### 5. 🔍 Systematic Debugging（系统调试）

**触发：** "debug this issue" / "it's not working"

**4 阶段：**
1. 观察 → 收集症状
2. 形成假设 → 列出可能原因
3. 验证/排除 → 测试每个假设
4. 解决 → 修复根因

## WoClaw 开发检查清单

新功能开发前：
- [ ] brainstorming 完成
- [ ] 设计文档已写入 `docs/superpowers/specs/`
- [ ] 用户已批准设计
- [ ] writing-plans 已创建任务列表
- [ ] 所有任务遵循 TDD

代码审查前：
- [ ] requesting-code-review skill 已执行
- [ ] 关键问题已解决

功能完成后：
- [ ] verification-before-completion 已执行
- [ ] 测试全部通过
- [ ] finishing-a-development-branch 已执行

## 示例：规划 WoClaw v1.0 TLS 支持

```
You: help me add TLS support to WoClaw Hub

Assistant: I'm using the brainstorming skill...
→ What protocol versions do you need? (TLS 1.2 / 1.3)
→ Self-hosted or bring-your-own-cert?
→ Performance constraints?
→ ...

[after approval] Design saved to: docs/superpowers/specs/2026-04-10-tls-support-design.md

I'm using the writing-plans skill...
→ Task 1: Add TLS config options to config schema
→ Task 2: Implement cert/key file loading
→ Task 3: Add TLS test fixtures
→ Task 4: Implement HTTPS server wrapper
→ Task 5: Add integration tests
→ ...

Now executing with subagent-driven-development...
```
