import { Injectable, Logger } from '@nestjs/common';
import { WorkflowNode } from '@packages/types';
import { PrismaService } from '../../../../prisma';
import {
    NodeExecutionContext,
    NodeExecutionResult,
    WorkflowNodeExecutor,
} from '../node-executor.interface';

/**
 * 计算节点执行器
 *
 * 支持三种计算类型:
 * - formula-calc: 公式计算（四则运算 + 数学函数）
 * - feature-calc: 特征工程（同比/环比/移动平均/标准差）
 * - quantile-calc: 分位数计算（百分位/排名/分组）
 *
 * 配置项:
 * - formulaCode: 公式库编码（引用预定义公式）
 * - expression: 自定义表达式
 * - inputVars: 变量映射（从上游节点输出 → 公式变量名）
 * - parameterRefs: 参数引用（从参数中心获取常量）
 * - precision: 小数精度（默认 2）
 * - roundingMode: 舍入模式（HALF_UP / HALF_DOWN / FLOOR / CEIL）
 * - nullPolicy: 空值策略（FAIL / USE_DEFAULT / SKIP）
 * - unitConversion: 单位换算配置
 */
@Injectable()
export class ComputeNodeExecutor implements WorkflowNodeExecutor {
    readonly name = 'ComputeNodeExecutor';
    private readonly logger = new Logger(ComputeNodeExecutor.name);

    // WHY: 白名单方式限制可用函数，防止表达式注入
    private readonly ALLOWED_FUNCTIONS: Record<string, (...args: number[]) => number> = {
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        sqrt: Math.sqrt,
        pow: (base, exp) => Math.pow(base, exp),
        min: (...args) => Math.min(...args),
        max: (...args) => Math.max(...args),
        log: Math.log,
        log10: Math.log10,
        log2: Math.log2,
        exp: Math.exp,
        sign: Math.sign,
        trunc: Math.trunc,
        clamp: (val, lo, hi) => Math.max(lo, Math.min(hi, val)),
    };

    constructor(private readonly prisma: PrismaService) { }

    supports(node: WorkflowNode): boolean {
        return ['formula-calc', 'feature-calc', 'quantile-calc'].includes(node.type);
    }

    async execute(context: NodeExecutionContext): Promise<NodeExecutionResult> {
        const config = context.node.config as Record<string, unknown>;
        const nodeType = context.node.type;

        try {
            // 1. 解析输入变量
            const inputVars = this.resolveInputVars(config, context);

            // 2. 解析参数引用
            const paramValues = await this.resolveParameterRefs(config);

            // 3. 合并所有变量
            const allVars = { ...inputVars, ...paramValues };

            // 4. 应用空值策略
            const nullPolicy = (config.nullPolicy as string) ?? 'FAIL';
            const nullDefault = (config.nullDefault as number) ?? 0;
            const sanitizedVars = this.applyNullPolicy(allVars, nullPolicy, nullDefault);
            if (sanitizedVars === null) {
                return {
                    status: 'FAILED',
                    output: { variables: allVars },
                    message: '输入变量存在空值且 nullPolicy=FAIL',
                };
            }

            // 5. 根据节点类型分发计算
            let result: Record<string, unknown>;
            switch (nodeType) {
                case 'formula-calc':
                    result = await this.executeFormulaCalc(config, sanitizedVars);
                    break;
                case 'feature-calc':
                    result = this.executeFeatureCalc(config, sanitizedVars);
                    break;
                case 'quantile-calc':
                    result = this.executeQuantileCalc(config, sanitizedVars);
                    break;
                default:
                    throw new Error(`未知的计算节点类型: ${nodeType}`);
            }

            // 6. 精度处理
            const precision = (config.precision as number) ?? 2;
            const roundingMode = (config.roundingMode as string) ?? 'HALF_UP';
            const roundedResult = this.applyPrecision(result, precision, roundingMode);

            // 7. 单位换算
            const unitConversion = config.unitConversion as Record<string, unknown> | undefined;
            const finalResult = unitConversion
                ? this.applyUnitConversion(roundedResult, unitConversion)
                : roundedResult;

            return {
                status: 'SUCCESS',
                output: {
                    nodeType,
                    variables: sanitizedVars,
                    ...finalResult,
                    precision,
                    roundingMode,
                    computedAt: new Date().toISOString(),
                },
                message: `计算节点[${nodeType}] 执行成功`,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`计算节点[${nodeType}] 执行失败: ${errorMsg}`);
            return {
                status: 'FAILED',
                output: { error: errorMsg },
                message: `计算节点[${nodeType}] 执行失败: ${errorMsg}`,
            };
        }
    }

    // ────────────────── formula-calc ──────────────────

    /**
     * 公式计算: 支持 formulaCode（预定义公式库）或 expression（自定义表达式）
     */
    private async executeFormulaCalc(
        config: Record<string, unknown>,
        vars: Record<string, number>,
    ): Promise<Record<string, unknown>> {
        const formulaCode = config.formulaCode as string | undefined;
        let expression = config.expression as string | undefined;

        // 如果指定了 formulaCode，从参数中心获取公式定义
        if (formulaCode && !expression) {
            const paramItem = await this.prisma.parameterItem.findFirst({
                where: { paramCode: formulaCode, isActive: true },
            });
            if (paramItem) {
                expression = String(paramItem.value);
            } else {
                throw new Error(`公式编码不存在: ${formulaCode}`);
            }
        }

        if (!expression) {
            throw new Error('公式计算需要 expression 或 formulaCode');
        }

        const result = this.evaluateExpression(expression, vars);

        return {
            result,
            formula: expression,
            formulaCode: formulaCode ?? null,
        };
    }

    // ────────────────── feature-calc ──────────────────

    /**
     * 特征工程计算: 同比/环比/移动平均/标准差/变化率
     */
    private executeFeatureCalc(
        config: Record<string, unknown>,
        vars: Record<string, number>,
    ): Record<string, unknown> {
        const featureType = (config.featureType as string) ?? 'change_rate';
        const dataKey = (config.dataKey as string) ?? 'data';

        // 从变量中提取数据序列
        const seriesData = this.extractSeries(vars, dataKey);

        switch (featureType) {
            case 'yoy': // 同比
                return this.calcYearOverYear(seriesData, config);
            case 'mom': // 环比
                return this.calcMonthOverMonth(seriesData);
            case 'moving_avg': // 移动平均
                return this.calcMovingAverage(seriesData, config);
            case 'std_dev': // 标准差
                return this.calcStdDev(seriesData);
            case 'change_rate': // 变化率
                return this.calcChangeRate(seriesData);
            case 'z_score': // Z-Score 标准化
                return this.calcZScore(seriesData);
            default:
                throw new Error(`未知的特征类型: ${featureType}`);
        }
    }

    // ────────────────── quantile-calc ──────────────────

    /**
     * 分位数计算: 百分位 / 排名 / 分组
     */
    private executeQuantileCalc(
        config: Record<string, unknown>,
        vars: Record<string, number>,
    ): Record<string, unknown> {
        const quantileType = (config.quantileType as string) ?? 'percentile';
        const dataKey = (config.dataKey as string) ?? 'data';

        const seriesData = this.extractSeries(vars, dataKey);

        switch (quantileType) {
            case 'percentile': {
                const percentiles = (config.percentiles as number[]) ?? [25, 50, 75, 90, 95];
                return this.calcPercentiles(seriesData, percentiles);
            }
            case 'rank': {
                const target = (config.targetValue as number) ?? vars.target ?? 0;
                return this.calcRank(seriesData, target);
            }
            case 'histogram': {
                const bins = (config.bins as number) ?? 10;
                return this.calcHistogram(seriesData, bins);
            }
            default:
                throw new Error(`未知的分位数类型: ${quantileType}`);
        }
    }

    // ────────────────── 通用工具方法 ──────────────────

    /**
     * 解析输入变量映射: 从上游节点输出中提取数值变量
     */
    private resolveInputVars(
        config: Record<string, unknown>,
        context: NodeExecutionContext,
    ): Record<string, number> {
        const inputVarMapping = config.inputVars as Record<string, string> | undefined;
        const vars: Record<string, number> = {};

        if (!inputVarMapping) {
            // 直接使用上游输出中的数值
            for (const [key, value] of Object.entries(context.input)) {
                if (typeof value === 'number') {
                    vars[key] = value;
                } else if (typeof value === 'string') {
                    const num = Number(value);
                    if (Number.isFinite(num)) vars[key] = num;
                } else if (Array.isArray(value)) {
                    // 数组会作为序列数据传递
                    const nums = value.filter((v) => typeof v === 'number' && Number.isFinite(v));
                    if (nums.length > 0) {
                        // 存为 data.0, data.1, ... 以及 data_series 标记
                        nums.forEach((n, i) => {
                            vars[`${key}.${i}`] = n as number;
                        });
                        vars[`${key}_count`] = nums.length;
                    }
                }
            }
            return vars;
        }

        // 按映射提取
        for (const [varName, sourcePath] of Object.entries(inputVarMapping)) {
            const value = this.resolveDeepValue(context.input, sourcePath);
            if (typeof value === 'number' && Number.isFinite(value)) {
                vars[varName] = value;
            } else if (typeof value === 'string') {
                const num = Number(value);
                if (Number.isFinite(num)) vars[varName] = num;
            }
        }

        return vars;
    }

    /**
     * 解析参数引用（从参数中心获取常量）
     */
    private async resolveParameterRefs(
        config: Record<string, unknown>,
    ): Promise<Record<string, number>> {
        const paramRefs = config.parameterRefs as string[] | undefined;
        if (!paramRefs || paramRefs.length === 0) return {};

        const params = await this.prisma.parameterItem.findMany({
            where: { paramCode: { in: paramRefs }, isActive: true },
        });

        const result: Record<string, number> = {};
        for (const param of params) {
            const num = Number(param.value);
            if (Number.isFinite(num)) {
                result[param.paramCode] = num;
            }
        }
        return result;
    }

    /**
     * 空值策略处理
     */
    private applyNullPolicy(
        vars: Record<string, number>,
        policy: string,
        defaultValue: number,
    ): Record<string, number> | null {
        const cleaned: Record<string, number> = {};
        for (const [key, value] of Object.entries(vars)) {
            if (value === undefined || value === null || !Number.isFinite(value)) {
                switch (policy) {
                    case 'FAIL':
                        return null;
                    case 'USE_DEFAULT':
                        cleaned[key] = defaultValue;
                        break;
                    case 'SKIP':
                        break; // 跳过该变量
                    default:
                        return null;
                }
            } else {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }

    /**
     * 安全表达式求值
     * WHY: 使用 Function 构造器 + 白名单函数实现，避免 eval 注入风险
     */
    private evaluateExpression(
        expression: string,
        vars: Record<string, number>,
    ): number {
        // 安全校验: 仅允许数字、运算符、括号、变量名、白名单函数
        const sanitized = expression.replace(/\s+/g, '');
        const allowedPattern = /^[a-zA-Z0-9_.,+\-*/%()]+$/;
        if (!allowedPattern.test(sanitized)) {
            throw new Error(`表达式包含不安全字符: ${expression}`);
        }

        // 构建函数参数
        const varNames = Object.keys(vars);
        const varValues = Object.values(vars);

        // 注入白名单函数
        const funcNames = Object.keys(this.ALLOWED_FUNCTIONS);
        const funcValues = Object.values(this.ALLOWED_FUNCTIONS);

        try {
            const fn = new Function(
                ...varNames,
                ...funcNames,
                `"use strict"; return (${expression});`,
            );
            const result = fn(...varValues, ...funcValues);
            if (typeof result !== 'number' || !Number.isFinite(result)) {
                throw new Error(`表达式计算结果非有效数值: ${result}`);
            }
            return result;
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('表达式')) {
                throw error;
            }
            throw new Error(`表达式求值失败: ${expression} → ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 提取数据序列
     */
    private extractSeries(vars: Record<string, number>, dataKey: string): number[] {
        const series: number[] = [];
        const count = vars[`${dataKey}_count`];

        if (count && count > 0) {
            for (let i = 0; i < count; i++) {
                const val = vars[`${dataKey}.${i}`];
                if (val !== undefined) series.push(val);
            }
        }

        if (series.length === 0) {
            // 尝试收集所有数值型变量作为序列
            for (const value of Object.values(vars)) {
                if (Number.isFinite(value)) series.push(value);
            }
        }

        return series;
    }

    /**
     * 精度处理
     */
    private applyPrecision(
        result: Record<string, unknown>,
        precision: number,
        roundingMode: string,
    ): Record<string, unknown> {
        const rounded: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(result)) {
            if (typeof value === 'number' && Number.isFinite(value)) {
                rounded[key] = this.roundNumber(value, precision, roundingMode);
            } else {
                rounded[key] = value;
            }
        }
        return rounded;
    }

    private roundNumber(value: number, precision: number, mode: string): number {
        const factor = Math.pow(10, precision);
        switch (mode) {
            case 'HALF_UP':
                return Math.round(value * factor) / factor;
            case 'HALF_DOWN': {
                const shifted = value * factor;
                const decimal = shifted - Math.floor(shifted);
                return (decimal <= 0.5 ? Math.floor(shifted) : Math.ceil(shifted)) / factor;
            }
            case 'FLOOR':
                return Math.floor(value * factor) / factor;
            case 'CEIL':
                return Math.ceil(value * factor) / factor;
            default:
                return Math.round(value * factor) / factor;
        }
    }

    /**
     * 单位换算
     */
    private applyUnitConversion(
        result: Record<string, unknown>,
        conversion: Record<string, unknown>,
    ): Record<string, unknown> {
        const factor = conversion.factor as number;
        const outputUnit = conversion.outputUnit as string;
        const targetField = (conversion.field as string) ?? 'result';

        if (!factor || !Number.isFinite(factor)) return result;

        const converted = { ...result };
        if (typeof converted[targetField] === 'number') {
            converted[targetField] = (converted[targetField] as number) * factor;
            converted.unit = outputUnit;
        }

        return converted;
    }

    /**
     * 深层路径解析 (e.g., "data.price.current")
     */
    private resolveDeepValue(obj: Record<string, unknown>, path: string): unknown {
        let current: unknown = obj;
        for (const key of path.split('.')) {
            if (current && typeof current === 'object' && key in current) {
                current = (current as Record<string, unknown>)[key];
            } else {
                return undefined;
            }
        }
        return current;
    }

    // ────────────────── 特征工程具体实现 ──────────────────

    private calcYearOverYear(
        data: number[],
        config: Record<string, unknown>,
    ): Record<string, unknown> {
        const period = (config.period as number) ?? 12; // 默认12期（月度同比）
        if (data.length < period + 1) {
            return { yoyRate: null, message: `数据不足 ${period + 1} 期，无法计算同比` };
        }
        const current = data[data.length - 1];
        const previous = data[data.length - 1 - period];
        const yoyRate = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
        return { result: yoyRate, current, previous, period, unit: '%' };
    }

    private calcMonthOverMonth(data: number[]): Record<string, unknown> {
        if (data.length < 2) {
            return { momRate: null, message: '数据不足 2 期，无法计算环比' };
        }
        const current = data[data.length - 1];
        const previous = data[data.length - 2];
        const momRate = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
        return { result: momRate, current, previous, unit: '%' };
    }

    private calcMovingAverage(
        data: number[],
        config: Record<string, unknown>,
    ): Record<string, unknown> {
        const window = (config.window as number) ?? 5;
        if (data.length < window) {
            return { movingAvg: null, message: `数据不足 ${window} 期，无法计算移动平均` };
        }
        const windowData = data.slice(-window);
        const avg = windowData.reduce((sum, v) => sum + v, 0) / window;
        return { result: avg, window, windowData };
    }

    private calcStdDev(data: number[]): Record<string, unknown> {
        if (data.length < 2) {
            return { stdDev: null, message: '数据不足 2 期，无法计算标准差' };
        }
        const mean = data.reduce((sum, v) => sum + v, 0) / data.length;
        const variance = data.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (data.length - 1);
        return { result: Math.sqrt(variance), mean, variance, sampleSize: data.length };
    }

    private calcChangeRate(data: number[]): Record<string, unknown> {
        if (data.length < 2) {
            return { changeRate: null, message: '数据不足 2 期，无法计算变化率' };
        }
        const current = data[data.length - 1];
        const previous = data[0];
        const totalChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0;
        return { result: totalChange, start: previous, end: current, periods: data.length, unit: '%' };
    }

    private calcZScore(data: number[]): Record<string, unknown> {
        if (data.length < 2) {
            return { zScore: null, message: '数据不足，无法计算 Z-Score' };
        }
        const mean = data.reduce((sum, v) => sum + v, 0) / data.length;
        const stdDev = Math.sqrt(
            data.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (data.length - 1),
        );
        const latest = data[data.length - 1];
        const zScore = stdDev !== 0 ? (latest - mean) / stdDev : 0;
        return { result: zScore, latest, mean, stdDev };
    }

    // ────────────────── 分位数具体实现 ──────────────────

    private calcPercentiles(
        data: number[],
        percentiles: number[],
    ): Record<string, unknown> {
        if (data.length === 0) {
            return { percentiles: {}, message: '数据为空' };
        }
        const sorted = [...data].sort((a, b) => a - b);
        const results: Record<string, number> = {};

        for (const p of percentiles) {
            const idx = (p / 100) * (sorted.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            const frac = idx - lo;
            results[`p${p}`] = sorted[lo] + frac * (sorted[hi] - sorted[lo]);
        }

        return {
            result: results,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: results.p50 ?? sorted[Math.floor(sorted.length / 2)],
            sampleSize: data.length,
        };
    }

    private calcRank(data: number[], target: number): Record<string, unknown> {
        const sorted = [...data].sort((a, b) => a - b);
        const belowCount = sorted.filter((v) => v < target).length;
        const percentileRank = (belowCount / sorted.length) * 100;

        return {
            result: percentileRank,
            target,
            rank: belowCount + 1,
            totalCount: sorted.length,
            unit: '%',
        };
    }

    private calcHistogram(
        data: number[],
        bins: number,
    ): Record<string, unknown> {
        if (data.length === 0) {
            return { histogram: [], message: '数据为空' };
        }
        const min = Math.min(...data);
        const max = Math.max(...data);
        const binWidth = (max - min) / bins || 1;

        const histogram = Array.from({ length: bins }, (_, i) => ({
            binStart: min + i * binWidth,
            binEnd: min + (i + 1) * binWidth,
            count: 0,
        }));

        for (const value of data) {
            const binIdx = Math.min(Math.floor((value - min) / binWidth), bins - 1);
            histogram[binIdx].count++;
        }

        return { result: histogram, bins, binWidth, min, max, sampleSize: data.length };
    }
}
