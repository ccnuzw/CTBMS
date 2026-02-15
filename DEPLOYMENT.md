# 部署指南

本指南说明如何使用 Docker Compose 在 VPS 上部署 CTBMS 应用程序。

## 先决条件 (Prerequisites)

- 一台 VPS (推荐 Ubuntu 20.04/22.04)
- **必须安装 Docker Compose V2** (命令是 `docker compose`，不是 `docker-compose`)
  - 验证方法: 输入 `docker compose version`，如果显示版本号则正常。
  - 安装方法(Ubuntu): `sudo apt-get update && sudo apt-get install docker-compose-plugin`
- VPS 上必须要安装 Git (`sudo apt-get install git`)
- 确保你的 VPS 能够访问你的代码仓库 (GitHub/GitLab)

## 设置步骤 (Setup Steps)

### 1. 传输文件
在 VPS 上克隆你的代码仓库。
```bash
# 进入你想要的目录 (例如 /opt)
cd /opt

# 克隆代码 (由于是公开库，直接 HTTPS 克隆即可)
git clone https://github.com/your-username/ctbms.git

# 进入项目目录
cd ctbms
```

### 2. 配置环境变量
在 VPS 上，进入项目目录并创建一个 `.env` 文件。
`docker-compose-full.yml` 需要以下变量：

推荐：在项目根目录创建一个 `.env` 文件：
```env
POSTGRES_USER=ctbms_prod
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=ctbms_prod
GEMINI_API_KEY=your_google_key
```

### 3. 构建并启动

```bash
docker compose -f docker-compose-full.yml up -d --build
```

### 4. 数据库迁移
**前提**：容器必须处于运行状态 (`docker ps` 能看到 `ctbms_api`)。
**执行目录**：VPS 的任意目录均可 (因为 `docker exec` 是针对全局容器的命令)。

您需要执行数据库迁移和初始化数据：

```bash
# 运行数据库迁移 (创建表结构)
# 注意：必须指定 @5.22.0 版本，避免 npx 自动下载不兼容的 v7 版本
docker exec -it ctbms_api npx prisma@5.22.0 migrate deploy

# 填充种子数据 (可选/初始化时使用)
# 直接运行编译后的 JS 文件 (最稳定，无需 ts-node)
docker exec -it -w /app/apps/api ctbms_api node dist/prisma/seed.js
```

### 5. 访问应用程序
- **前端页面**: http://your-vps-ip:8000
- **后端 API**: http://your-vps-ip:8000/api

#### 常用管理命令 (Management Commands)

- **重启所有服务**:
  ```bash
  docker compose -f docker-compose-full.yml restart
  ```

- **仅启动服务** (如果已停止):
  ```bash
  docker compose -f docker-compose-full.yml start
  ```

- **重启 Nginx 代理** (修改配置后):
  ```bash
  docker compose -f docker-compose-full.yml restart proxy
  ```

## 维护 (Maintenance)

- **查看日志**: 
  ```bash
  docker compose -f docker-compose-full.yml logs -f
  ```
- **停止服务**: 
  ```bash
  docker compose -f docker-compose-full.yml down
  ```
- **更新代码**: 
  ```bash
  # 务必在 VPS 的项目目录内执行 (例如 /opt/ctbms)
  
  # 拉取最新代码 (如果是 master 分支)
  git pull origin master
  
  # 重新构建并重启
  docker compose -f docker-compose-full.yml up -d --build
  ```

## 工作流上线门禁 (Workflow Go-Live Gate)

在合并到 `main` 或执行生产发布前，建议至少通过以下门禁：

```bash
pnpm type-check
pnpm workflow:smoke:gate
pnpm workflow:execution:baseline:gate -- --days=7 --report-file=../../logs/workflow-execution-baseline-report.json
pnpm workflow:execution:baseline:report:validate -- --report-file=logs/workflow-execution-baseline-report.json --summary-json-file=logs/workflow-execution-baseline-validation.json --require-gate-pass --require-gate-evaluated
pnpm workflow:execution:baseline:reference -- --mode=ensure --current-report=logs/workflow-execution-baseline-report.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json
pnpm workflow:execution:baseline:trend -- --current-report=logs/workflow-execution-baseline-report.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-trend.json --require-reference
pnpm workflow:execution:baseline:reference -- --mode=promote --current-report=logs/workflow-execution-baseline-report.json --reference-report=logs/workflow-execution-baseline-reference.json --summary-json-file=logs/workflow-execution-baseline-reference-operation.json
pnpm workflow:ci:step-summary -- --execution-baseline-report-file=logs/workflow-execution-baseline-report.json --execution-baseline-validation-file=logs/workflow-execution-baseline-validation.json --execution-baseline-reference-operation-file=logs/workflow-execution-baseline-reference-operation.json --execution-baseline-trend-file=logs/workflow-execution-baseline-trend.json > logs/workflow-ci-step-summary.md
pnpm workflow:ci:step-summary:validate -- --summary-file=logs/workflow-ci-step-summary.md --summary-json-file=logs/workflow-ci-step-summary-validation.json
```

说明：
- `workflow:smoke:gate` 用于验证工作流主链路（校验、执行、报告）可用。
- `workflow:execution:baseline:gate` 用于生成执行质量基线，并对成功率/失败率/超时率/p95 延迟做阈值检查。
- `workflow:execution:baseline:report:validate` 用于校验 baseline 报告契约与关键一致性（计数、比率、门禁状态），并输出可归档的 validation json。
- `workflow:execution:baseline:reference` 用于维护参考基线文件：`ensure` 保底（缺失时从当前报告初始化），`promote` 提升（将当前报告升级为新参考）。
- `workflow:execution:baseline:trend` 用于对比当前基线与参考基线（成功率/失败率/超时率/p95），识别是否发生回归；建议使用 `--require-reference` 强制校验。
- `workflow:ci:step-summary:validate` 用于校验 CI 摘要区块完整性（baseline/report/self-check 区块是否齐全），避免门禁通过但摘要缺块。
- trend 默认阈值从 `config/workflow-execution-baseline-thresholds.json` 读取；如需临时调整，可通过 `--max-*-*` 参数覆盖。
- 基线报告默认输出到 `logs/workflow-execution-baseline-report.json`，可作为变更对比依据。
- 如遇本机 turbo/keychain 环境异常，可用 `pnpm workflow:drill:staging:precheck:fast`（分包 type-check）执行同等 staging 预检链路。
- 可用 `pnpm workflow:drill:staging:full` 一键执行“staging 预检 + 回滚验收”整套演练。
- `workflow:drill:staging:full` 会自动生成：
  - `logs/workflow-ci-step-summary.md`
  - `logs/workflow-ci-step-summary-validation.json`
  - `logs/workflow-drill-staging-full-summary.md`
  - `logs/workflow-drill-staging-full-summary.json`
  - `logs/workflow-drill-staging-closeout.md`
  - `logs/workflow-drill-staging-closeout.json`
- 上线前可执行严格收口（要求 CI 证据）：
  - `pnpm workflow:drill:staging:closeout -- --ci-run-url=<workflow-run-url> --ci-run-conclusion=SUCCESS --require-ci-run-url --require-ci-run-success`
- staging 演练记录模板见：`docs/工作流Staging演练记录模板.md`。

## 灰度发布建议 (Canary Window)

1. 发布后先观察 30~60 分钟：
   - 新增执行实例成功率
   - 失败分类中 `TIMEOUT/INTERNAL` 是否异常上升
   - 执行延迟 `p95` 是否明显劣化
2. 若观察窗口内指标超阈值，优先执行回滚流程，不在生产直接热修核心编排逻辑。

## 回滚 Runbook (Rollback)

详细值班与回滚操作模板见：`docs/工作流生产值班与回滚SOP.md`。

### 应用回滚

```bash
# 1) 回到上一个稳定版本（示例：tag 或 commit）
git fetch --all --tags
git checkout <last-stable-tag-or-commit>

# 2) 重新构建并启动
docker compose -f docker-compose-full.yml up -d --build

# 3) 验证服务状态
docker compose -f docker-compose-full.yml ps
docker compose -f docker-compose-full.yml logs -f --tail=200 api
```

### 数据库策略

- 生产数据库迁移默认采用“前向修复”策略：不建议直接回滚历史迁移文件。
- 发布后若出现 schema 兼容问题，建议：
1. 先回滚应用代码到稳定版本。
2. 使用新迁移补丁修复（forward fix），避免手工回退造成数据不一致。
3. 执行 `docker exec -it ctbms_api npx prisma@5.22.0 migrate status` 确认迁移状态。

### 回滚后验收

```bash
pnpm workflow:drill:rollback:verify
```

确认工作流链路恢复、无新增异常后，再恢复常规发布节奏。
