# CTBMS 大宗农产贸易超级智能体数据字典与指标口径 v1.0

- 文档类型：数据字典 + 指标口径说明
- 对应 PRD：`docs/aiagnet-chat/CTBMS大宗农产贸易超级智能体-产品需求文档-PRD-v1.md`
- 使用范围：数据接入、工作流节点、对话输出、回测与报表

## 0. 目标与原则

### 0.1 目标

1. 统一数据语义，避免“同名不同义”。
2. 统一指标口径，避免“同指标多版本不可比”。
3. 支持工作流和对话共享同一数据契约。

### 0.2 设计原则

1. 先标准后扩展：先定义核心字段和单位，再接入新源。
2. 事实可追溯：每条关键事实必须能追溯来源和时间。
3. 口径可版本化：指标计算规则必须有版本。
4. 机器可消费：所有字段类型、取值范围、缺失策略明确。

## 1. 命名规范

1. 维度字段统一使用 `_code` 结尾，如 `commodity_code`、`region_code`。
2. 数值字段按业务语义命名，如 `spot_price`、`freight_cost`。
3. 时间字段标准化：
   - `event_time`：事件发生时间
   - `data_time`：业务数据时间
   - `collected_at`：系统采集时间
   - `updated_at`：数据更新时间
4. 金额统一带币种：金额字段需配套 `currency`。
5. 指标统一记录 `metric_code`、`metric_version`、`calc_method`。

## 2. 主数据字典（维度层）

## 2.1 品类维度 `dim_commodity`

| 字段             | 类型       | 必填 | 说明              | 示例         |
| ---------------- | ---------- | ---- | ----------------- | ------------ |
| commodity_code   | string(32) | 是   | 品类编码          | `CORN`       |
| commodity_name   | string(64) | 是   | 品类中文名        | `玉米`       |
| category_level_1 | string(32) | 是   | 一级分类          | `GRAIN`      |
| category_level_2 | string(32) | 否   | 二级分类          | `FEED_GRAIN` |
| unit_default     | string(16) | 是   | 默认计量单位      | `CNY/TON`    |
| status           | enum       | 是   | `ACTIVE/INACTIVE` | `ACTIVE`     |

## 2.2 区域维度 `dim_region`

| 字段               | 类型       | 必填 | 说明                           | 示例            |
| ------------------ | ---------- | ---- | ------------------------------ | --------------- |
| region_code        | string(32) | 是   | 区域编码                       | `CN_NE`         |
| region_name        | string(64) | 是   | 区域名称                       | `东北`          |
| region_level       | enum       | 是   | `COUNTRY/PROVINCE/CITY/CUSTOM` | `CUSTOM`        |
| parent_region_code | string(32) | 否   | 上级区域编码                   | `CN`            |
| timezone           | string(32) | 是   | 时区                           | `Asia/Shanghai` |

## 2.3 仓储与港口维度 `dim_location`

| 字段          | 类型          | 必填 | 说明                      | 示例          |
| ------------- | ------------- | ---- | ------------------------- | ------------- |
| location_code | string(32)    | 是   | 仓储/港口编码             | `DALIAN_PORT` |
| location_name | string(64)    | 是   | 名称                      | `大连港`      |
| location_type | enum          | 是   | `WAREHOUSE/PORT/TRANSFER` | `PORT`        |
| region_code   | string(32)    | 是   | 所属区域                  | `CN_NE`       |
| capacity_ton  | decimal(18,2) | 否   | 设计容量（吨）            | `200000.00`   |

## 2.4 物流线路维度 `dim_route`

| 字段                    | 类型          | 必填 | 说明              | 示例               |
| ----------------------- | ------------- | ---- | ----------------- | ------------------ |
| route_code              | string(32)    | 是   | 线路编码          | `NE_TO_NC_RAIL_01` |
| origin_region_code      | string(32)    | 是   | 起点区域          | `CN_NE`            |
| destination_region_code | string(32)    | 是   | 终点区域          | `CN_NC`            |
| transport_mode          | enum          | 是   | `RAIL/TRUCK/SHIP` | `RAIL`             |
| distance_km             | decimal(10,2) | 否   | 里程              | `1160.00`          |

## 2.5 期货合约维度 `dim_futures_contract`

| 字段           | 类型          | 必填 | 说明         | 示例      |
| -------------- | ------------- | ---- | ------------ | --------- |
| contract_code  | string(32)    | 是   | 合约编码     | `C2605`   |
| exchange_code  | string(16)    | 是   | 交易所       | `DCE`     |
| commodity_code | string(32)    | 是   | 对应品类     | `CORN`    |
| delivery_month | string(8)     | 是   | 交割月       | `2026-05` |
| tick_size      | decimal(10,4) | 是   | 最小变动价位 | `1.0000`  |

## 3. 事实数据字典（标准层）

## 3.1 现货行情事实表 `fact_spot_price`

| 字段             | 类型          | 必填 | 说明                         |
| ---------------- | ------------- | ---- | ---------------------------- |
| id               | string(uuid)  | 是   | 主键                         |
| commodity_code   | string(32)    | 是   | 品类编码                     |
| region_code      | string(32)    | 是   | 区域编码                     |
| market_type      | enum          | 是   | `ORIGIN/PORT/DELIVERY`       |
| quote_type       | enum          | 是   | `MID/BID/ASK`                |
| spot_price       | decimal(18,4) | 是   | 现货价格                     |
| currency         | string(8)     | 是   | 币种，默认 `CNY`             |
| unit             | string(16)    | 是   | 单位，默认 `CNY/TON`         |
| data_time        | datetime      | 是   | 行情时间                     |
| source_type      | enum          | 是   | `INTERNAL/MANUAL/API/PUBLIC` |
| source_record_id | string(64)    | 否   | 源记录 ID                    |
| quality_score    | decimal(5,4)  | 是   | 质量评分 0-1                 |
| collected_at     | datetime      | 是   | 采集时间                     |
| updated_at       | datetime      | 是   | 更新时间                     |

## 3.2 期货行情事实表 `fact_futures_quote`

| 字段           | 类型          | 必填 | 说明              |
| -------------- | ------------- | ---- | ----------------- |
| id             | string(uuid)  | 是   | 主键              |
| contract_code  | string(32)    | 是   | 合约编码          |
| commodity_code | string(32)    | 是   | 品类编码          |
| open_price     | decimal(18,4) | 否   | 开盘价            |
| high_price     | decimal(18,4) | 否   | 最高价            |
| low_price      | decimal(18,4) | 否   | 最低价            |
| close_price    | decimal(18,4) | 是   | 收盘/最新价       |
| volume         | decimal(18,2) | 否   | 成交量            |
| open_interest  | decimal(18,2) | 否   | 持仓量            |
| bar_interval   | enum          | 是   | `1m/5m/15m/1h/1d` |
| data_time      | datetime      | 是   | 行情时间          |
| source_type    | enum          | 是   | `FUTURES_API`     |
| quality_score  | decimal(5,4)  | 是   | 质量评分          |
| collected_at   | datetime      | 是   | 采集时间          |

## 3.3 库存快照事实表 `fact_inventory_snapshot`

| 字段           | 类型          | 必填 | 说明           |
| -------------- | ------------- | ---- | -------------- |
| id             | string(uuid)  | 是   | 主键           |
| commodity_code | string(32)    | 是   | 品类编码       |
| location_code  | string(32)    | 是   | 仓储/港口编码  |
| inventory_ton  | decimal(18,2) | 是   | 库存量（吨）   |
| available_ton  | decimal(18,2) | 否   | 可用库存（吨） |
| locked_ton     | decimal(18,2) | 否   | 冻结库存（吨） |
| turnover_days  | decimal(10,2) | 否   | 周转天数       |
| data_date      | date          | 是   | 业务日期       |
| source_type    | enum          | 是   | `INTERNAL`     |
| quality_score  | decimal(5,4)  | 是   | 质量评分       |

## 3.4 物流状态事实表 `fact_logistics_route_status`

| 字段                 | 类型          | 必填 | 说明                     |
| -------------------- | ------------- | ---- | ------------------------ |
| id                   | string(uuid)  | 是   | 主键                     |
| route_code           | string(32)    | 是   | 线路编码                 |
| transport_mode       | enum          | 是   | `RAIL/TRUCK/SHIP`        |
| freight_cost         | decimal(18,4) | 是   | 运价（CNY/TON）          |
| transit_hours        | decimal(10,2) | 否   | 在途时长                 |
| delay_index          | decimal(10,4) | 否   | 延误指数 0-1             |
| capacity_utilization | decimal(10,4) | 否   | 运力利用率 0-1           |
| event_flag           | string(64)    | 否   | 异常事件标签             |
| data_time            | datetime      | 是   | 数据时间                 |
| source_type          | enum          | 是   | `LOGISTICS_API/INTERNAL` |
| quality_score        | decimal(5,4)  | 是   | 质量评分                 |

## 3.5 天气观测事实表 `fact_weather_observation`

| 字段                | 类型          | 必填 | 说明                   |
| ------------------- | ------------- | ---- | ---------------------- |
| id                  | string(uuid)  | 是   | 主键                   |
| region_code         | string(32)    | 是   | 区域编码               |
| station_code        | string(32)    | 否   | 站点编码               |
| temp_c              | decimal(10,2) | 否   | 温度                   |
| rainfall_mm         | decimal(10,2) | 否   | 降水量                 |
| wind_speed          | decimal(10,2) | 否   | 风速                   |
| extreme_event_level | enum          | 否   | `NONE/LOW/MEDIUM/HIGH` |
| anomaly_score       | decimal(10,4) | 否   | 天气异常分             |
| data_time           | datetime      | 是   | 数据时间               |
| source_type         | enum          | 是   | `WEATHER_API`          |
| quality_score       | decimal(5,4)  | 是   | 质量评分               |

## 3.6 资讯与政策事件事实表 `fact_market_event`

| 字段             | 类型          | 必填 | 说明                            |
| ---------------- | ------------- | ---- | ------------------------------- |
| id               | string(uuid)  | 是   | 主键                            |
| event_type       | enum          | 是   | `POLICY/REPORT/NEWS/RISK_EVENT` |
| commodity_code   | string(32)    | 否   | 关联品类                        |
| region_code      | string(32)    | 否   | 关联区域                        |
| title            | string(256)   | 是   | 标题                            |
| summary          | text          | 否   | 摘要                            |
| impact_direction | enum          | 否   | `BULLISH/BEARISH/NEUTRAL`       |
| impact_score     | decimal(10,4) | 否   | 影响评分                        |
| source_url       | string(512)   | 否   | 来源链接                        |
| published_at     | datetime      | 是   | 发布时间                        |
| ingested_at      | datetime      | 是   | 入库时间                        |

## 3.7 存量数据源到标准层映射（首批）

| 存量表                                                 | 标准事实表           | 关键映射                                                                                                               | 说明                                       |
| ------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `PriceData`                                            | `fact_spot_price`    | `commodity->commodity_code`, `regionCode/province/city->region_code`, `price->spot_price`, `effectiveDate->data_time`  | 先通过适配层输出标准 DTO，不直接改老表结构 |
| `FuturesQuoteSnapshot`                                 | `fact_futures_quote` | `contractCode->contract_code`, `exchange->exchange_code`, `lastPrice/closePrice->close_price`, `snapshotAt->data_time` | 保留现有快照写入逻辑，新增标准化读取视图   |
| `MarketIntel/MarketEvent/MarketInsight/ResearchReport` | `fact_market_event`  | `title/summary/publishedAt->title/summary/published_at`, `source->source_url`, `impact->impact_direction/impact_score` | 覆盖 B 类情报与研报，统一事件与影响语义    |

迁移策略（必须与增量接入同步）：

1. 双跑期：工作流同时读取 legacy 与 standard 输出，按指标做误差对账。
2. 稳定期：新模板与新对话链路只读取 standard 层。
3. 收敛期：逐步下线 legacy 直读路径，仅保留审计与回放能力。

## 3.8 唯一键与去重策略（防冗余核心）

| 标准事实表                    | 业务唯一键（建议）                                                                  | 去重策略                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `fact_spot_price`             | `commodity_code + region_code + market_type + quote_type + data_time + source_type` | 写入使用 upsert，冲突时按 `source_priority + quality_score` 取优 |
| `fact_futures_quote`          | `contract_code + bar_interval + data_time + source_type`                            | 同键重复写入覆盖更新，保留原始来源 ID                            |
| `fact_inventory_snapshot`     | `commodity_code + location_code + data_date + source_type`                          | 日快照同日同源只保留一条有效记录                                 |
| `fact_logistics_route_status` | `route_code + transport_mode + data_time + source_type`                             | 同时间窗内重复事件合并，保留最新 `event_flag`                    |
| `fact_weather_observation`    | `region_code + station_code + data_time + source_type`                              | 缺站点时使用 `region_code + data_time` 回退键                    |
| `fact_market_event`           | `event_type + title_hash + published_at + source_url`                               | 相同标题与来源去重，保留最高质量摘要                             |

## 4. 通用审计与质量字段

以下字段建议作为事实层公共字段统一维护：

| 字段             | 说明                             |
| ---------------- | -------------------------------- |
| source_name      | 数据来源名                       |
| source_record_id | 来源侧唯一 ID                    |
| source_priority  | 来源优先级（冲突仲裁使用）       |
| freshness_status | `WITHIN_TTL/NEAR_EXPIRE/EXPIRED` |
| quality_score    | 质量评分（0-1）                  |
| confidence_score | 可信分（0-1）                    |
| version_tag      | 版本标签（便于回放）             |

## 5. 指标口径字典（MVP）

## 5.1 行情类指标

| 指标代码             | 指标名称     | 公式                              | 频率    | 单位    | 说明            |
| -------------------- | ------------ | --------------------------------- | ------- | ------- | --------------- |
| MKT_SPOT_AVG_7D      | 7 日现货均价 | `avg(spot_price, 7d)`             | 日      | CNY/TON | 取指定区域/品类 |
| MKT_SPOT_PCT_CHG_7D  | 7 日涨跌幅   | `(P_t - P_t-7)/P_t-7`             | 日      | %       | 支持区域维度    |
| FUT_CLOSE_PCT_CHG_1D | 期货日涨跌幅 | `(close_t - close_t-1)/close_t-1` | 日      | %       | 按合约          |
| BASIS_MAIN           | 主力基差     | `spot_price - futures_main_close` | 分钟/日 | CNY/TON | 核心风控指标    |
| BASIS_ZSCORE_30D     | 基差偏离度   | `zscore(BASIS_MAIN, 30d)`         | 日      | 无量纲  | 用于异常预警    |

## 5.2 库存与供需类指标

| 指标代码          | 指标名称     | 公式                                      | 频率 | 单位  | 说明           |
| ----------------- | ------------ | ----------------------------------------- | ---- | ----- | -------------- |
| INV_TOTAL_TON     | 总库存       | `sum(inventory_ton)`                      | 日   | TON   | 指定品类和区域 |
| INV_DOD_PCT       | 库存日环比   | `(inv_t - inv_t-1)/inv_t-1`               | 日   | %     | 日维度         |
| INV_WOW_PCT       | 库存周环比   | `(inv_t - inv_t-7)/inv_t-7`               | 日   | %     | 周对比         |
| INV_DAYS          | 库存可用天数 | `available_ton / avg_daily_consumption`   | 日   | DAY   | 可按组织计算   |
| SUPPLY_STRESS_IDX | 供应压力指数 | `w1*库存偏离 + w2*到货偏离 + w3*天气扰动` | 日   | 0-100 | 业务综合指标   |

## 5.3 物流与天气类指标

| 指标代码           | 指标名称     | 公式                                           | 频率    | 单位  | 说明         |
| ------------------ | ------------ | ---------------------------------------------- | ------- | ----- | ------------ |
| LOGI_FREIGHT_IDX   | 运价指数     | `current_freight / baseline_freight * 100`     | 小时/日 | 指数  | 路线级       |
| LOGI_DELAY_IDX     | 延迟指数     | `avg(delay_index)`                             | 小时    | 0-1   | 越高越差     |
| WEATHER_STRESS_IDX | 天气扰动指数 | `f(rainfall_anomaly,temp_anomaly,event_level)` | 小时/日 | 0-100 | 产区影响     |
| ROUTE_FRICTION_IDX | 运输摩擦指数 | `w1*delay + w2*capacity + w3*event`            | 小时/日 | 0-100 | 履约风险输入 |

## 5.4 风险与策略类指标

| 指标代码          | 指标名称    | 公式                                            | 频率     | 单位                       | 说明     |
| ----------------- | ----------- | ----------------------------------------------- | -------- | -------------------------- | -------- |
| VOLATILITY_20D    | 20 日波动率 | `std(log_return, 20d)`                          | 日       | %                          | 风险度量 |
| SIGNAL_CONFIDENCE | 建议置信度  | `quality*0.4 + consistency*0.3 + freshness*0.3` | 每次执行 | 0-1                        | 输出门禁 |
| ALERT_SEVERITY    | 预警等级    | `map(score)`                                    | 实时     | `LOW/MEDIUM/HIGH/CRITICAL` | 规则映射 |

## 6. 指标阈值与业务解释（首版）

| 指标               | 阈值  | 解释           | 动作建议             |
| ------------------ | ----- | -------------- | -------------------- |
| BASIS_ZSCORE_30D   | > 2.0 | 基差显著偏离   | 提示套保比例调整     |
| WEATHER_STRESS_IDX | >= 70 | 天气扰动高     | 提示采购节奏前置     |
| ROUTE_FRICTION_IDX | >= 65 | 物流摩擦高     | 提示改道或提前锁运力 |
| SIGNAL_CONFIDENCE  | < 0.6 | 结论可信度不足 | 降级为观察建议       |

## 7. 数据质量规则

## 7.1 完整性规则

1. 行情类：`commodity_code/region_code/price/data_time` 不能为空。
2. 天气类：`region_code/data_time` 不能为空。
3. 物流类：`route_code/freight_cost/data_time` 不能为空。

## 7.2 时效性规则

| 数据域   | TTL     | 超期动作                       |
| -------- | ------- | ------------------------------ |
| 期货行情 | 5 分钟  | 标记 `EXPIRED`，禁止高置信输出 |
| 现货行情 | 2 小时  | 降级并提示时效风险             |
| 天气数据 | 6 小时  | 允许使用但降权                 |
| 物流数据 | 3 小时  | 降级并提示人工确认             |
| 资讯事件 | 24 小时 | 允许引用但标注时效             |

## 7.3 一致性规则

1. 同品类同区域多源价差超过阈值触发冲突记录。
2. 同一指标跨源偏差超过 3 sigma 触发异常。
3. 多源冲突时采用 `source_priority + freshness + quality` 仲裁。

## 7.4 空值与缺失值策略

1. 关键字段缺失：直接拒绝入标准层并生成质量问题单。
2. 非关键字段缺失：允许入层但打 `missing_fields` 标记。
3. 指标计算遇缺失：
   - `FAIL`：阻断并返回可解释错误（默认用于风控指标）。
   - `USE_DEFAULT`：按配置默认值补齐（仅低风险指标）。
   - `SKIP`：跳过样本并记录覆盖率（用于探索性分析）。

## 8. 语义映射规则（示例）

| 原始字段    | 标准字段         | 转换规则                       |
| ----------- | ---------------- | ------------------------------ |
| `symbol`    | `commodity_code` | 映射表转换（如 `C` -> `CORN`） |
| `lastPrice` | `close_price`    | 保留 4 位小数                  |
| `freight`   | `freight_cost`   | 单位统一换算到 `CNY/TON`       |
| `rain_24h`  | `rainfall_mm`    | 数值直接映射                   |

## 9. 版本与变更管理

1. 指标定义变更必须升级 `metric_version`，并记录变更说明。
2. 维度映射变更必须保留历史映射，禁止覆盖式修改。
3. 影响历史对比的改动必须提供回溯兼容策略。

### 9.1 映射规则版本管理

1. 每次映射规则变更必须生成 `mapping_version`。
2. 对账报告必须记录 `legacy_version` 与 `mapping_version`。
3. 切流审批依据必须绑定具体版本，不允许“口头确认”。

## 10. 与系统模块映射

| 文档对象       | 对应模块/能力                                       |
| -------------- | --------------------------------------------------- |
| Connector 契约 | `apps/api/src/modules/data-connector`               |
| 期货数据       | `apps/api/src/modules/futures-sim` + 工作流期货节点 |
| 指标计算       | 工作流 `compute` 节点 + 指标服务（新增）            |
| 引用与证据     | `agent-conversation` 结果聚合与导出链路             |
| 类型约束       | `packages/types/src/modules`                        |

## 11. 待确认事项

1. 首批品类范围和编码标准是否采用现有业务系统编码。
2. 天气与物流 API 的主备供应商和计费方式。
3. 运价指数基准线选取逻辑（滚动 30 天或季节基线）。
4. 供应压力指数权重是否按品类差异化配置。
