import { Injectable, Logger } from '@nestjs/common';
import { ConnectorService } from '../../connector';

/**
 * 天气扰动指数 & 运输摩擦指数计算 — PRD §5.1
 *
 * 天气扰动指数 (WDI): 综合降雨/温度/预警等级，评估对产区收获/物流运输的影响
 * 运输摩擦指数 (TFI): 综合运费变化率/港口拥堵/船期延误等，评估物流通畅度
 */

interface WeatherDataPoint {
    temperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    warningLevel: number; // 0=无, 1=蓝, 2=黄, 3=橙, 4=红
}

interface FreightDataPoint {
    currentPrice: number;
    previousPrice: number;
    portCongestionDays: number;
    scheduleDelayHours: number;
}

export interface WeatherDisruptionResult {
    index: number; // 0-100，越高越严重
    grade: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';
    factors: Array<{ factor: string; contribution: number; description: string }>;
    generatedAt: string;
}

export interface TransportFrictionResult {
    index: number; // 0-100，越高摩擦越大
    grade: 'SMOOTH' | 'NORMAL' | 'CONGESTED' | 'DISRUPTED';
    factors: Array<{ factor: string; contribution: number; description: string }>;
    generatedAt: string;
}

@Injectable()
export class WeatherLogisticsImpactService {
    private readonly logger = new Logger(WeatherLogisticsImpactService.name);

    constructor(private readonly connectorService: ConnectorService) { }

    /**
     * 计算天气扰动指数 (Weather Disruption Index)
     * 公式: WDI = 0.3 * 降水指标 + 0.2 * 温度偏离指标 + 0.3 * 预警等级指标 + 0.2 * 风力指标
     */
    computeWeatherDisruptionIndex(data: WeatherDataPoint): WeatherDisruptionResult {
        const factors: WeatherDisruptionResult['factors'] = [];

        // 降水因子 (0-100)
        const precipScore = Math.min(100, (data.precipitation / 50) * 100);
        factors.push({
            factor: 'PRECIPITATION',
            contribution: precipScore * 0.3,
            description:
                data.precipitation > 25
                    ? `暴雨(${data.precipitation}mm)严重影响运输`
                    : data.precipitation > 10
                        ? `中雨(${data.precipitation}mm)可能延迟装卸`
                        : `降水量(${data.precipitation}mm)影响较小`,
        });

        // 温度偏离因子
        const tempDeviation = Math.abs(data.temperature - 25);
        const tempScore = Math.min(100, (tempDeviation / 20) * 100);
        factors.push({
            factor: 'TEMPERATURE',
            contribution: tempScore * 0.2,
            description:
                data.temperature > 38
                    ? `高温(${data.temperature}°C)影响仓储品质`
                    : data.temperature < 0
                        ? `低温(${data.temperature}°C)影响运输`
                        : `温度(${data.temperature}°C)正常`,
        });

        // 预警等级因子
        const warningScore = data.warningLevel * 25;
        factors.push({
            factor: 'WARNING',
            contribution: warningScore * 0.3,
            description: ['无预警', '蓝色预警', '黄色预警', '橙色预警', '红色预警'][data.warningLevel],
        });

        // 风力因子
        const windScore = Math.min(100, (data.windSpeed / 30) * 100);
        factors.push({
            factor: 'WIND',
            contribution: windScore * 0.2,
            description:
                data.windSpeed > 20
                    ? `强风(${data.windSpeed}m/s)港口可能停作业`
                    : `风力(${data.windSpeed}m/s)正常`,
        });

        const index = Math.round(
            precipScore * 0.3 + tempScore * 0.2 + warningScore * 0.3 + windScore * 0.2,
        );

        const grade: WeatherDisruptionResult['grade'] =
            index >= 75 ? 'SEVERE' : index >= 50 ? 'HIGH' : index >= 25 ? 'MODERATE' : 'LOW';

        return { index, grade, factors, generatedAt: new Date().toISOString() };
    }

    /**
     * 计算运输摩擦指数 (Transport Friction Index)
     * 公式: TFI = 0.4 * 运费变化率指标 + 0.3 * 港口拥堵指标 + 0.3 * 船期延误指标
     */
    computeTransportFrictionIndex(data: FreightDataPoint): TransportFrictionResult {
        const factors: TransportFrictionResult['factors'] = [];

        // 运费变化率因子
        const freightChangeRate =
            data.previousPrice > 0
                ? ((data.currentPrice - data.previousPrice) / data.previousPrice) * 100
                : 0;
        const freightScore = Math.min(100, Math.abs(freightChangeRate) * 5);
        factors.push({
            factor: 'FREIGHT_CHANGE',
            contribution: freightScore * 0.4,
            description:
                freightChangeRate > 10
                    ? `运费大涨${freightChangeRate.toFixed(1)}%`
                    : freightChangeRate > 5
                        ? `运费上涨${freightChangeRate.toFixed(1)}%`
                        : `运费变化${freightChangeRate.toFixed(1)}%`,
        });

        // 港口拥堵因子
        const congestionScore = Math.min(100, (data.portCongestionDays / 7) * 100);
        factors.push({
            factor: 'PORT_CONGESTION',
            contribution: congestionScore * 0.3,
            description:
                data.portCongestionDays > 5
                    ? `严重拥堵(${data.portCongestionDays}天)`
                    : data.portCongestionDays > 2
                        ? `轻度拥堵(${data.portCongestionDays}天)`
                        : `港口通畅`,
        });

        // 船期延误因子
        const delayScore = Math.min(100, (data.scheduleDelayHours / 48) * 100);
        factors.push({
            factor: 'SCHEDULE_DELAY',
            contribution: delayScore * 0.3,
            description:
                data.scheduleDelayHours > 24
                    ? `延误严重(${data.scheduleDelayHours}h)`
                    : data.scheduleDelayHours > 8
                        ? `船期延误(${data.scheduleDelayHours}h)`
                        : `基本准时`,
        });

        const index = Math.round(freightScore * 0.4 + congestionScore * 0.3 + delayScore * 0.3);

        const grade: TransportFrictionResult['grade'] =
            index >= 75
                ? 'DISRUPTED'
                : index >= 50
                    ? 'CONGESTED'
                    : index >= 25
                        ? 'NORMAL'
                        : 'SMOOTH';

        return { index, grade, factors, generatedAt: new Date().toISOString() };
    }

    /**
     * 从连接器获取天气数据并计算指数
     */
    async fetchAndComputeWeatherIndex(
        locationId: string,
    ): Promise<WeatherDisruptionResult> {
        try {
            const weatherResponse = await this.connectorService.executeEndpoint(
                'weather-qweather',
                'getCurrentWeather',
                { location: locationId },
            );

            const weatherData = weatherResponse as Record<string, unknown>;
            const now = (weatherData.now ?? weatherData) as Record<string, unknown>;

            const dataPoint: WeatherDataPoint = {
                temperature: Number(now.temp ?? now.temperature ?? 25),
                humidity: Number(now.humidity ?? 50),
                precipitation: Number(now.precip ?? now.precipitation ?? 0),
                windSpeed: Number(now.windSpeed ?? now.wind_speed ?? 0),
                warningLevel: 0,
            };

            return this.computeWeatherDisruptionIndex(dataPoint);
        } catch (error) {
            this.logger.warn(`天气数据获取失败 (${locationId}): ${error}`);
            // 返回默认值
            return this.computeWeatherDisruptionIndex({
                temperature: 25,
                humidity: 50,
                precipitation: 0,
                windSpeed: 0,
                warningLevel: 0,
            });
        }
    }

    /**
     * 从连接器获取物流数据并计算指数
     */
    async fetchAndComputeFreightIndex(
        origin: string,
        destination: string,
    ): Promise<TransportFrictionResult> {
        try {
            const freightResponse = await this.connectorService.executeEndpoint(
                'logistics-freight',
                'getRoadFreight',
                { origin, destination },
            );

            const freightData = freightResponse as Record<string, unknown>;

            const dataPoint: FreightDataPoint = {
                currentPrice: Number(freightData.currentPrice ?? freightData.price ?? 0),
                previousPrice: Number(freightData.previousPrice ?? freightData.lastPrice ?? 0),
                portCongestionDays: Number(freightData.congestionDays ?? 0),
                scheduleDelayHours: Number(freightData.delayHours ?? 0),
            };

            return this.computeTransportFrictionIndex(dataPoint);
        } catch (error) {
            this.logger.warn(`物流数据获取失败 (${origin} → ${destination}): ${error}`);
            return this.computeTransportFrictionIndex({
                currentPrice: 100,
                previousPrice: 100,
                portCongestionDays: 0,
                scheduleDelayHours: 0,
            });
        }
    }
}
