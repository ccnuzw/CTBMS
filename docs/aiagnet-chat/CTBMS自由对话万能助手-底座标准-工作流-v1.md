# CTBMS 自由对话万能助手底座标准-工作流 v1.0

## 1. 适用范围

适用于所有可被对话助手调用的 workflow 定义、版本、执行与回滚流程。

## 2. 工作流元数据必填字段

1. `workflowCode`：全局唯一标识。
2. `name`：用户可读名称。
3. `description`：能力描述（面向路由检索）。
4. `inputSchema`：输入契约（JSON Schema/Zod）。
5. `outputSchema`：输出契约。
6. `riskLevel`：LOW/MEDIUM/HIGH。
7. `scope`：PRIVATE/TEAM/PUBLIC/EPHEMERAL。
8. `owner`：所有者与权限域。
9. `sla`：超时阈值、重试策略。
10. `costProfile`：预估 token/耗时/外部请求成本。

## 3. 执行标准

1. 必须做输入校验，校验失败返回结构化错误。
2. 必须记录执行 traceId、节点耗时、失败节点。
3. 必须支持幂等执行（同 requestId 不重复副作用）。
4. 必须定义失败补偿策略（可回滚或可重试）。

## 4. 路由标准

1. 先匹配 owner 私有 workflow。
2. 再匹配 team/public workflow。
3. 未命中时允许创建临时 workflow（EPHEMERAL），默认 TTL 24h。

## 5. 临时 workflow 标准

1. 必须记录来源问题指纹（intent + slots + outcome）。
2. 必须在沙箱首跑通过后再对用户返回。
3. 必须带 TTL 与自动清理任务。

## 6. 验收标准

1. 输入契约不合法可稳定拦截。
2. 路由决策可追踪（命中来源、分数、原因）。
3. 执行失败可定位到具体节点。
