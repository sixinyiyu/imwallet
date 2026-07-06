# IMWallet 项目规范

## ⛔ 严禁规则

### 1. 禁止自动 push 代码

**`git push` 是绝对禁止的操作，除非用户明确要求！**

- 代码修改完成后，只能执行 `git add` + `git commit`，**绝不能**执行 `git push`
- 只有当用户明确说"推送"、"push"、"提交到远程"等指令时，才允许执行 `git push`
- 每次完成 commit 后，必须告知用户"代码已提交到本地，请确认是否需要 push"
- 违反此规则视为严重失误

### 2. 禁止提交敏感信息

- 数据库密码、API Key、私钥等敏感信息必须模糊化处理（如 `****`）后才能提交
- 通过环境变量覆盖的配置项，config.toml 中只保留占位符

## 📋 工作流程

### 代码修改流程

1. 分析需求 → 制定计划 → 实施修改
2. 修改完成后：`cargo check` / `cargo fmt` / `cargo clippy` / `npx tsc --noEmit` 等验证
3. 验证通过后：`git add` + `git commit`（仅本地提交）
4. **告知用户提交结果，等待用户确认是否 push**
5. 用户明确要求时才执行 `git push`

### 技术栈

- **后端**: Rust (axum + rbatis + PostgreSQL)
- **前端**: React Native + Expo (TypeScript)
- **配置**: config.toml (后端) + app.json/eas.json (前端)

## 📱 Expo 规范

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.
