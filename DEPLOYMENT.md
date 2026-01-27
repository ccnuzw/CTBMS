# 部署指南

本指南说明如何使用 Docker Compose 在 VPS 上部署 CTBMS 应用程序。

## 先决条件 (Prerequisites)

- 一台 VPS (推荐 Ubuntu 20.04/22.04)
- VPS 上必须要安装 Docker 和 Docker Compose
- VPS 上必须要安装 Git (`sudo apt-get install git`)
- 确保你的 VPS 能够访问你的代码仓库 (GitHub/GitLab)

## 设置步骤 (Setup Steps)

### 1. 传输文件
在 VPS 上克隆你的代码仓库。
```bash
# 进入你想要的目录 (例如 /opt)
cd /opt

# 克隆代码 (请替换为你的仓库地址)
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
运行以下命令以构建并启动容器：

```bash
docker-compose -f docker-compose-full.yml up -d --build
```

### 4. 数据库迁移
容器成功启动后，您需要执行数据库迁移和初始化数据。

```bash
# 运行数据库迁移 (创建表结构)
docker exec -it ctbms_api npx prisma migrate deploy

# 填充种子数据 (可选/初始化时使用)
docker exec -it ctbms_api npx prisma db seed
```

### 5. 访问应用程序
- **前端页面**: http://your-vps-ip:8000
- **后端 API**: http://your-vps-ip:8000/api

## 维护 (Maintenance)

- **查看日志**: 
  ```bash
  docker-compose -f docker-compose-full.yml logs -f
  ```
- **停止服务**: 
  ```bash
  docker-compose -f docker-compose-full.yml down
  ```
- **更新代码**: 
  ```bash
  # 拉取最新代码
  git pull origin main
  
  # 重新构建并重启
  docker-compose -f docker-compose-full.yml up -d --build
  ```
