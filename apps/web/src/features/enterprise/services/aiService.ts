import { EnterpriseResponse, EnterpriseType } from '@packages/types';

// =========================================================================================
// AI Service Interface
// =========================================================================================

export interface RouteOptimizationResult {
    optimizedIndices: number[];
    strategy: string;
    savedDistance: string;
}

export interface RiskAnalysisResult {
    analysis: string;
    riskLevel: '低' | '中' | '高' | '未知';
    suggestedTags: string[];
}

// =========================================================================================
// AI Logic Implementation (with Prompt Templates)
// =========================================================================================

const IS_MOCK_MODE = true; // TODO: Change to false to enable real API calls
// const apiKey = import.meta.env.VITE_GOOGLE_GENAI_API_KEY; // Ensure you have this in .env

/**
 * 模拟 AI 优化物流路径
 * 包含完整 Prompt 模板供后续集成参考
 */
export const optimizeLogisticsRoute = async (
    stops: EnterpriseResponse[]
): Promise<RouteOptimizationResult> => {
    // -------------------------------------------------------------------------------------
    // 1. Prompt Construction (Template for LLM)
    // -------------------------------------------------------------------------------------
    const stopsData = stops.map((s, index) => ({
        id: index,
        name: s.name,
        address: s.address || '未知地址',
        coords: { x: s.latitude, y: s.longitude }
    }));

    const prompt = `
      作为物流优化专家，请为以下粮食运输路线进行路径规划优化。
      
      站点列表 (坐标X,Y):
      ${stopsData.map(s => `ID ${s.id}: ${s.name} (${s.coords.x}, ${s.coords.y})`).join('\n')}

      要求：
      1. ID 0 (${stopsData[0].name}) 必须是**起始点**，不可更改。
      2. 重新排列剩余站点的访问顺序，以最短化总运输距离（假设平面欧几里得距离）。
      3. 考虑逻辑上的合理性（如顺路原则）。
      
      请返回 JSON 格式：
      {
        "optimizedIndices": [0, 2, 1, 3], // 优化后的索引数组，0必须在第一位
        "strategy": "简短的优化策略说明（如：'先去A卸货，再回程路过B装货，避免空驶'，50字内）",
        "savedDistance": "预估节省里程（如 '约 120km'）"
      }
    `;

    // -------------------------------------------------------------------------------------
    // 2. API Call (Placeholder / Mock)
    // -------------------------------------------------------------------------------------
    if (IS_MOCK_MODE) {
        await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate latency

        // Simple mock logic: Keep start/end, optimizing middle by some metric
        const count = stops.length;
        if (count <= 2) {
            return {
                optimizedIndices: stops.map((_, i) => i),
                strategy: '无需优化 (站点不足)',
                savedDistance: '0 km',
            };
        }

        // Mock Optimization: Sort middle points by latitude (simple heuristic for demo)
        const indices = Array.from({ length: count }, (_, i) => i);
        const middleIndices = indices.slice(1, -1);
        middleIndices.sort((a, b) => {
            return (stops[b].latitude || 0) - (stops[a].latitude || 0);
        });
        const optimizedIndices = [0, ...middleIndices, count - 1];

        return {
            optimizedIndices,
            strategy: 'Gemini AI: 基于地理聚类与最短哈密顿路径算法优化，优先访问北部节点以减少折返。',
            savedDistance: `${Math.floor(Math.random() * 50 + 20)} km`,
        };
    }

    // -------------------------------------------------------------------------------------
    // 3. Real API Implementation Example (Reference)
    // -------------------------------------------------------------------------------------
    /*
    const response = await ai.generateContent({
        prompt,
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.text);
    */

    throw new Error("Real API not implemented");
};

/**
 * 模拟 AI 风控分析
 * 包含完整 Prompt 模板供后续集成参考
 */
export const analyzeEnterpriseRisk = async (
    enterprise: EnterpriseResponse
): Promise<RiskAnalysisResult> => {
    // -------------------------------------------------------------------------------------
    // 1. Prompt Construction
    // -------------------------------------------------------------------------------------
    const prompt = `
      你是一家大型粮食贸易公司的资深风控分析师。
      请根据以下企业档案，分析潜在的贸易风险和机会。
      
      企业名称: ${enterprise.name}
      类型: ${enterprise.types.join(', ')}
      描述: ${enterprise.description || '暂无描述'}
      
      请提供以下信息（全部使用简体中文）：
      1. 简短的风险分析摘要（最多3句话，关注资金链、履约能力、物流风险）。
      2. 风险等级评估 (低, 中, 高)。
      3. 三个建议的新业务标签（基于描述推断，例如："水分敏感"、"夜间收货"、"国企背景"）。

      请务必严格返回以下JSON格式：
      {
        "analysis": "string",
        "riskLevel": "string",
        "suggestedTags": ["string", "string", "string"]
      }
    `;

    // -------------------------------------------------------------------------------------
    // 2. Mock Response
    // -------------------------------------------------------------------------------------
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Mock logic based on score or random
    const score = Math.random() * 100;
    let riskLevel: '低' | '中' | '高' = '低';
    if (score > 80) riskLevel = '高';
    else if (score > 50) riskLevel = '中';

    return {
        analysis: `Mock AI 分析: 该企业${enterprise.types.includes(EnterpriseType.CUSTOMER) ? '采购需求稳定' : '供应能力强'}，但在当前市场波动下需关注${score > 50 ? '资金周转率' : '履约及时性'}。建议定期回访。`,
        riskLevel,
        suggestedTags: ['信用良好', '长期合作', '优质客户'].sort(() => 0.5 - Math.random()).slice(0, 3)
    };
};

/**
 * 模拟 AI 物流策略建议
 */
export const suggestLogisticsStrategy = async (
    origin: EnterpriseResponse,
    destination: EnterpriseResponse
): Promise<string> => {
    const prompt = `
      你是一名大宗农产品物流调度专家。请提供一条物流策略建议。
      
      发货地: ${origin.name} (${origin.address})
      收货地: ${destination.name} (${destination.address})
      
      请考虑距离、可能的运输方式（汽运、火运、船运）以及成本效益。
      请用简练的中文回答（50字以内）。
    `;

    await new Promise((resolve) => setTimeout(resolve, 1000));
    return "Mock AI: 建议采用公铁联运方式，利用主要铁路干线降低长途运输成本，末端使用新能源卡车配送。";
};
