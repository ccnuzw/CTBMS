# CTBMS - 企业管理系统

> **C**omprehensive **T**eam **B**usiness **M**anagement **S**ystem  
> 基于 Turborepo + React + NestJS + Prisma 的全栈企业管理平台

---

## 🚀 技术栈

| 层级 | 技术 | 说明 |
|:---|:---|:---|
| **Monorepo** | Turborepo + pnpm | 多包管理 |
| **前端** | React 18 + Vite + Ant Design 5 | 现代化 UI |
| **后端** | NestJS + Prisma | RESTful API |
| **数据库** | PostgreSQL | 关系型数据库 |
| **类型共享** | Zod + TypeScript | 前后端类型统一 |

---

## 📦 项目结构

```
/
├── apps
│   ├── web          # 前端 (React + Vite)
│   └── api          # 后端 (NestJS)
├── packages
│   ├── types        # 共享 Zod Schema 和 TypeScript 类型
│   ├── tsconfig     # 共享 TS 配置
│   └── eslint-config# 共享 Lint 配置
└── package.json
```

---

## ✨ 功能模块

### 🏢 组织架构管理
- **组织管理**：多层级公司/分公司结构
- **部门管理**：树形部门结构，支持多级嵌套
- **用户管理**：员工信息管理（用户名、姓名、性别、生日、电话、头像）
- **角色管理**：动态角色定义，支持多角色分配

### 📊 信息采集
- **分类管理**：信息分类树形结构
- **标签管理**：灵活的标签系统
- **信息采集**：富文本编辑、文件附件上传

### 📈 数据仪表盘
- 可视化统计图表
- 关键指标展示

---

## 🛠️ 快速开始

### 环境要求
- Node.js 18+
- pnpm 9+
- PostgreSQL 14+

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

复制 `apps/api/.env.example` 为 `apps/api/.env`，配置数据库连接：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ctbms_dev"
```

### 数据库初始化

```bash
# 运行数据库迁移
cd apps/api
npx prisma migrate dev

# 初始化系统数据（创建管理员角色和用户）
psql $DATABASE_URL -f prisma/seed.sql
```

### 启动开发服务器

```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm dev:web   # 前端 http://localhost:5173
pnpm dev:api   # 后端 http://localhost:3000
```

---

## 🔐 系统初始化

首次部署需初始化系统数据（管理员角色和用户）。

### 方式一：浏览器访问（推荐）

启动后端服务后，浏览器访问：

```
http://localhost:3000/init
```

成功后返回：
```json
{
  "success": true,
  "message": "系统初始化成功",
  "data": {
    "roles": ["系统管理员", "普通员工"],
    "adminUser": "admin"
  }
}
```

### 方式二：命令行 SQL

```bash
psql $DATABASE_URL -f apps/api/prisma/seed.sql
```

### 初始化数据

| 类型 | 名称 | 代码 | 说明 |
|:---|:---|:---|:---|
| 角色 | 系统管理员 | `SUPER_ADMIN` | 系统内置，不可删除 |
| 角色 | 普通员工 | `STAFF` | 系统内置，不可删除 |
| 用户 | admin | - | 默认管理员账号 |

> **注意**：生产环境部署后请立即修改默认管理员信息！

---

## 📝 开发规范

详见 [WORKFLOW_RULES.md](./WORKFLOW_RULES.md)

### 关键原则
- **单一事实来源**：共享类型定义在 `packages/types`
- **严格使用 pnpm**：禁止 npm/yarn
- **Ant Design Token**：禁止硬编码颜色
- **ProComponents 优先**：表格使用 ProTable，表单使用 ProForm

---

## 📄 License

MIT
