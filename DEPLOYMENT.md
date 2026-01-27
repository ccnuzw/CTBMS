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
