# 数据字典规范（CTBMS）

## 目标
- 统一枚举/标签/状态等**业务编码**，避免多处硬编码导致的不一致。
- 前后端共享标准编码，UI 仅显示 label，不直接硬编码。
- 支持扩展属性（颜色/图标/说明）统一管理。

---

## 数据结构

### DictionaryDomain（字典域）
| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | string | 业务域编码（唯一，主键） |
| `name` | string | 业务域名称 |
| `description` | string? | 业务域说明 |
| `isActive` | boolean | 是否启用 |

### DictionaryItem（字典项）
| 字段 | 类型 | 说明 |
|---|---|---|
| `domainCode` | string | 所属字典域编码 |
| `code` | string | 字典项编码（业务值） |
| `label` | string | 显示名称（面向 UI） |
| `sortOrder` | number | 排序（越小越靠前） |
| `isActive` | boolean | 是否启用 |
| `parentCode` | string? | 父级编码（层级结构） |
| `meta` | JSON? | 扩展属性（颜色、图标等） |

---

## 命名规范

| 类型 | 规范 | 示例 |
|---|---|---|
| **Domain Code** | `UPPER_SNAKE_CASE` | `PRICE_SUB_TYPE`, `USER_STATUS` |
| **Item Code** | `UPPER_SNAKE_CASE`（沿用历史编码） | `ACTIVE`, `PENDING`, `AI_EXTRACTED` |
| **label** | 中文名称 | "在职", "待审核" |
| **meta.color** | Ant Design 预设色或 Tag 状态 | `success`, `warning`, `#1890ff` |
| **meta.icon** | Emoji 或 Ant Design 图标名 | `🏭`, `ShopOutlined` |

---

## 字典域完整清单

以下为当前 **31 个**标准字典域（以 `seed-dictionaries.ts` 为唯一真理来源）：

### 1. 用户/组织相关（4 个）

| 域编码 | 名称 | 用途 | 使用位置 |
|---|---|---|---|
| `USER_STATUS` | 用户状态 | 员工在职/离职等状态 | 用户管理、组织架构 |
| `GENDER` | 性别 | 用户性别选项 | 用户表单 |
| `ENTITY_STATUS` | 通用状态 | 启用/禁用通用状态 | 角色、部门、组织管理 |
| `ORGANIZATION_TYPE` | 组织类型 | 组织分类（总部/分公司等） | 组织管理 |

### 2. 标签/客商相关（4 个）

| 域编码 | 名称 | 用途 | 使用位置 |
|---|---|---|---|
| `TAG_SCOPE` | 标签作用域 | 标签可应用的实体范围 | 标签管理 |
| `INFO_STATUS` | 信息采集状态 | 客商信息采集进度 | 信息采集模块 |
| `ENTERPRISE_TYPE` | 企业类型 | 客商分类（贸易商/加工厂等） | 客商管理、360 视图 |
| `CONTACT_ROLE` | 联系人角色 | 客商联系人职务 | 客商联系人管理 |

### 3. 区域/点位相关（3 个）

| 域编码 | 名称 | 用途 | 使用位置 |
|---|---|---|---|
| `REGION_LEVEL` | 行政区划层级 | 省/市/区/县层级 | 地区选择器 |
| `COLLECTION_POINT_TYPE` | 采集点类型 | 港口/企业/市场等 | 采集点管理、地图 |
| `GEO_LEVEL` | 地理层级 | 地理覆盖范围 | 逻辑规则配置 |

### 4. 价格相关（4 个）

| 域编码 | 名称 | 用途 | 使用位置 |
|---|---|---|---|
| `PRICE_SOURCE_TYPE` | 价格来源类型 | 一线/竞品/官方等 | 价格数据分类 |
| `PRICE_SUB_TYPE` | 价格子类型 | 成交价/报价/开票价等 | 价格录入表单 |
| `COMMODITY` | 主营品种 | 玉米/豆粕等品种 | 品种筛选器 |
| `PRICE_MONITOR_LOCATION` | 价格监控位置 | 监控点位位置 | 价格监控仪表盘 |

### 5. 情报/内容相关（9 个）

| 域编码 | 名称 | 用途 | 使用位置 |
|---|---|---|---|
| `INTEL_CATEGORY` | 情报分类 | 结构化/半结构化/文档 | 情报入库分类 |
| `INTEL_SOURCE_TYPE` | 情报来源类型 | 一线/竞品/官方/研究机构 | 情报来源标注 |
| `CONTENT_TYPE` | 内容类型 | 日报/周报/分析等 | 内容分类 |
| `REPORT_TYPE` | 研报类型 | 政策/市场/产业等 | 研报管理 |
| `REPORT_PERIOD` | 研报周期 | 日报/周报/月报等 | 研报筛选 |
| `INTEL_TASK_TYPE` | 情报任务类型 | 每日日报/市场调研等 | 任务管理 |
| `INTEL_TASK_PRIORITY` | 任务优先级 | 低/中/高/紧急 | 任务列表 |
| `TIME_RANGE` | 时间范围 | 今日/本周/本月等 | 筛选器 |
| `RELATION_TYPE` | 关联类型 | 提及/主体/来源 | 情报关联 |

### 6. 市场分析相关（7 个）

| 域编码 | 名称 | 用途 | 使用位置 |
|---|---|---|---|
| `SENTIMENT` | 情感倾向 | 正面/中性/负面 | 情报标注 |
| `MARKET_SENTIMENT_OVERALL` | 市场情绪（整体） | 看涨/震荡/看跌 | 洞察卡片 |
| `PREDICTION_DIRECTION` | 预测方向 | 涨/跌/稳 | 研报生成 |
| `PREDICTION_TIMEFRAME` | 预测周期 | 短期/中期/长期 | 研报生成 |
| `RISK_LEVEL` | 风险等级 | 低/中/高 | 风险提示 |
| `MARKET_TREND` | 市场趋势 | 上涨/下跌/震荡 | 行情分析 |
| `QUALITY_LEVEL` | 质量等级 | A/B/C 等 | 情报质量评估 |

---

## 不纳入字典的枚举

以下枚举因**与代码逻辑强耦合**或**仅技术内部使用**，改为前端常量管理：

| 分类 | 枚举 | 常量文件 | 原因 |
|---|---|---|---|
| **状态机类** | `SUBMISSION_STATUS`, `PRICE_REVIEW_STATUS`, `REVIEW_STATUS`, `INTEL_TASK_STATUS`, `INTEL_FEED_STATUS`, `ALLOCATION_STATUS`, `TASK_CYCLE_TYPE` | `statusEnums.ts` | 与业务流程状态机强耦合 |
| **技术内部** | `TAGGABLE_ENTITY_TYPE`, `INTEL_POINT_LINK_TYPE`, `PRICE_INPUT_METHOD`, `INTEL_VIEW_TYPE`, `MATCH_MODE`, `AI_MODEL_PROVIDER` | `technicalEnums.ts` | 仅开发者使用 |
| **功能专用** | `ASSIGNEE_MODE`, `POINT_SELECTION_MODE`, `POINT_SCOPE`, `ALLOCATION_MODE`, `SENTIMENT_FILTER` 等 | `featureEnums.ts` | 使用范围狭窄 |

### 使用示例
```typescript
// 从常量导入（非字典域）
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS } from '@/constants';

const label = SUBMISSION_STATUS_LABELS[record.status]; // '已通过'
const color = SUBMISSION_STATUS_COLORS[record.status]; // 'success'
```

---

## 前端使用规范

### 1. 使用 Hook 获取字典
```typescript
import { useDictionary, useDictionaries } from '@/hooks/useDictionaries';

// 单个字典
const { data: userStatusDict } = useDictionary('USER_STATUS');

// 多个字典
const { data: dicts } = useDictionaries(['ENTERPRISE_TYPE', 'CONTACT_ROLE']);
```

### 2. 渲染标签
```typescript
// 从字典获取 label
const label = userStatusDict?.find(d => d.code === record.status)?.label || record.status;

// 从字典获取颜色
const color = (userStatusDict?.find(d => d.code === record.status)?.meta as any)?.color || 'default';
```

### 3. 表单下拉选项
```typescript
<ProFormSelect
  name="status"
  label="状态"
  options={userStatusDict?.map(d => ({ label: d.label, value: d.code }))}
/>
```

### 4. Fallback 策略
```typescript
// 带 fallback 的 label 映射
import { USER_STATUS_LABELS } from '@packages/types'; // 字典域保留的 LABELS

const getUserStatusLabel = (code: string) => {
  const dictItem = userStatusDict?.find(d => d.code === code);
  return dictItem?.label || USER_STATUS_LABELS[code] || code;
};
```

---

## 后端使用规范

### 1. 获取字典数据
```typescript
// 注入 ConfigService
constructor(private readonly configService: ConfigService) {}

// 获取单个字典域
const items = await this.configService.getDictionary('COMMODITY');

// 获取多个字典域
const dicts = await this.configService.getDictionaries(['USER_STATUS', 'ENTITY_STATUS']);
```

### 2. 存储规范
- **存储 code**：业务数据只存 `code`，不存 `label`
- **查询时解析**：返回给前端时可附带 label，但主键仍是 code

---

## 管理界面

**路径**：系统管理 → 配置中心 → 数据字典  
**路由**：`/system/config/dictionaries`

**功能**：
- 字典域 CRUD（新增/编辑/禁用）
- 字典项 CRUD（支持排序、父级、meta JSON）
- 启用/禁用管理

---

## 扩展指南

### 添加新字典域

**Step 1**: 判断是否适合做成字典

```
新增枚举的判断流程：
┌─ 需要后台动态配置吗？（如新增选项无需发版）
│  ├─ 是 → 做成字典
│  └─ 否 → 考虑常量
│
├─ 与代码逻辑强耦合吗？（如状态机、条件分支）
│  ├─ 是 → 前端常量
│  └─ 否 → 可做字典
│
├─ 仅技术内部使用吗？
│  ├─ 是 → 前端常量
│  └─ 否 → 可做字典
```

**Step 2**: 修改 `seed-dictionaries.ts`
```typescript
// apps/api/prisma/seed-dictionaries.ts
const domains: DictionaryDomainSeed[] = [
  // ... 现有域
  {
    code: 'NEW_DOMAIN',
    name: '新字典名称',
    description: '说明',
    items: [
      { code: 'ITEM1', label: '选项1', sortOrder: 10 },
      { code: 'ITEM2', label: '选项2', sortOrder: 20 },
    ],
  },
];
```

**Step 3**: 执行播种
```bash
pnpm --filter api exec npx ts-node prisma/seed-dictionaries.ts
```

**Step 4**: 前端使用
```typescript
const { data: newDict } = useDictionary('NEW_DOMAIN');
```

### 添加新常量（非字典）

**Step 1**: 在 `apps/web/src/constants/` 对应文件中添加
```typescript
// statusEnums.ts / technicalEnums.ts / featureEnums.ts

export const NEW_ENUM_LABELS: Record<string, string> = {
  VALUE1: '选项1',
  VALUE2: '选项2',
};

export const NEW_ENUM_COLORS: Record<string, string> = {
  VALUE1: 'success',
  VALUE2: 'error',
};
```

**Step 2**: 在 `constants/index.ts` 中导出
```typescript
export * from './statusEnums';
// 确保已导出
```

---

## 生命周期规则

| 操作 | 规则 |
|---|---|
| **禁用** | 优先使用 `isActive=false`，不物理删除 |
| **变更 code** | 禁止修改已有 code，应新增 code 并弃用旧 code |
| **缓存刷新** | 修改后自动刷新（ConfigService TTL 1 分钟） |
| **手动刷新** | 调用 `POST /api/config/refresh` |

---

## 禁止事项

- ❌ 在 UI 中硬编码 label/颜色/状态映射
- ❌ 在数据库中存 label，必须存 `code`
- ❌ 改动已有 code（如需变更，新增新 code 并弃用旧 code）
- ❌ 在 `@packages/types` 和 `@/constants` 中重复定义同一 LABELS

---

## 变更与播种

字典结构与初始数据由 `apps/api/prisma/seed-dictionaries.ts` 维护：

```bash
# 执行字典播种
pnpm --filter api exec npx ts-node prisma/seed-dictionaries.ts

# 或通过完整 seed（包含所有数据）
pnpm --filter api exec npx prisma db seed
```

---

## 相关文件

| 文件 | 用途 |
|---|---|
| `apps/api/prisma/seed-dictionaries.ts` | 字典域种子数据 |
| `apps/api/src/modules/config/config.service.ts` | 字典缓存与查询服务 |
| `apps/web/src/hooks/useDictionaries.ts` | 前端字典 Hook |
| `apps/web/src/constants/statusEnums.ts` | 状态机类常量 |
| `apps/web/src/constants/technicalEnums.ts` | 技术内部常量 |
| `apps/web/src/constants/featureEnums.ts` | 功能专用常量 |
