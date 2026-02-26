# CTBMS 自由对话万能助手底座标准-Skills v1.0

## 1. 适用范围

适用于所有 skill（内置、共享、临时生成）定义与运行约束。

## 2. Skill 契约必填字段

1. `skillCode`：唯一编码。
2. `name`/`description`：语义检索文本。
3. `parametersSchema`：输入参数结构。
4. `resultSchema`：输出结构。
5. `sideEffect`：是否有外部副作用。
6. `riskLevel`：LOW/MEDIUM/HIGH。
7. `scope`：PRIVATE/TEAM/PUBLIC/EPHEMERAL。
8. `owner`：所有者。

## 3. 执行标准

1. 入参严格校验；禁止未定义字段透传。
2. 输出必须符合 `resultSchema`；不符合时返回标准错误。
3. 高风险 skill 不允许自动发布，必须经过审核。

## 4. 临时 Skill 标准

1. 仅在“复用+编排都无法满足”时生成。
2. 默认 EPHEMERAL，TTL 24h。
3. 仅限当前用户或会话范围使用（可配置）。
4. 需通过最小测试集后才能执行。

## 5. 晋升标准

满足以下条件可晋升正式 skill：

1. 复用次数 >= 阈值。
2. 成功率 >= 阈值。
3. 风险审计通过。

## 6. 验收标准

1. Skill 调用失败可给出可执行补救提示。
2. 临时 skill 可自动清理，不发生膨胀。
3. 晋升/淘汰过程可追踪。
