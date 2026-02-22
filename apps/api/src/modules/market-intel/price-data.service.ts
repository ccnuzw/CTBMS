import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma';
import { CreatePriceDataDto, PriceDataQuery } from '@packages/types';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CollectionPointType,
  GeoLevel,
  PriceSourceType,
  Prisma,
} from '@prisma/client';
import * as PriceDataUtils from './price-data.utils';
import { PriceDataRecord, PriceQualityTag, PRICE_QUALITY_TAGS } from './price-data.utils';

@Injectable()
export class PriceDataService {
  private readonly logger = new Logger(PriceDataService.name);

  constructor(private prisma: PrismaService) {}

  private logPerf(method: string, startedAt: number, metadata: Record<string, unknown>) {
    const durationMs = Date.now() - startedAt;
    if (durationMs < 400) return;
    this.logger.warn(`[perf] ${method} ${durationMs}ms ${JSON.stringify(metadata)}`);
  }

  /**
   * 创建价格数据
   */
  async create(dto: CreatePriceDataDto, authorId: string) {
    // 获取昨日价格用于计算涨跌
    const yesterday = new Date(dto.effectiveDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const yesterdayPrice = await this.prisma.priceData.findFirst({
      where: {
        commodity: dto.commodity,
        location: dto.location,
        effectiveDate: yesterday,
      },
      select: { price: true },
    });

    // 获取去年同期价格
    const lastYear = new Date(dto.effectiveDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);

    const lastYearPrice = await this.prisma.priceData.findFirst({
      where: {
        commodity: dto.commodity,
        location: dto.location,
        effectiveDate: lastYear,
      },
      select: { price: true },
    });

    const dayChange = yesterdayPrice ? dto.price - Number(yesterdayPrice.price) : null;
    const yearChange = lastYearPrice ? dto.price - Number(lastYearPrice.price) : null;
    const createdAt = new Date();
    const qualityTag = PriceDataUtils.inferQualityTag({
      note: dto.note || null,
      effectiveDate: dto.effectiveDate,
      createdAt,
    });

    return this.prisma.priceData.create({
      data: {
        effectiveDate: dto.effectiveDate,
        commodity: dto.commodity,
        grade: dto.grade,
        location: dto.location,
        region: dto.region || [],
        price: new Decimal(dto.price),
        moisture: dto.moisture ? new Decimal(dto.moisture) : null,
        bulkDensity: dto.bulkDensity,
        toxin: dto.toxin ? new Decimal(dto.toxin) : null,
        freight: dto.freight ? new Decimal(dto.freight) : null,
        inventory: dto.inventory,
        dayChange: dayChange ? new Decimal(dayChange) : null,
        yearChange: yearChange ? new Decimal(yearChange) : null,
        intelId: dto.intelId,
        authorId,
        qualityTag,
      },
    });
  }

  /**
   * 查询价格数据 (分页)
   * 增强版：支持按采集点和行政区划过滤
   */
  async findAll(query: PriceDataQuery) {
    const startedAt = Date.now();
    const {
      sourceType,
      subType,
      subTypes,
      geoLevel,
      commodity,
      location,
      province,
      city,
      // enterpriseId, [REMOVED]
      startDate,
      endDate,
      keyword,
      collectionPointId,
      collectionPointIds,
      regionCode,
      pointTypes,
      reviewScope,
      sourceScope,
    } = query;
    const qualityTags = (query as { qualityTags?: string[] | string }).qualityTags;
    // Query 参数从 URL 传入时都是字符串，需要转换
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;

    const andFilters: Prisma.PriceDataWhereInput[] = [];
    const commodityFilter = PriceDataUtils.buildCommodityFilter(commodity);
    if (commodityFilter) andFilters.push({ commodity: commodityFilter });
    if (location) andFilters.push({ location: { contains: location, mode: 'insensitive' } });
    if (province) andFilters.push({ province });
    if (city) andFilters.push({ city });
    // if (enterpriseId) andFilters.push({ enterpriseId }); [REMOVED]
    const resolvedSourceType = Object.values(PriceSourceType).includes(
      sourceType as PriceSourceType,
    )
      ? (sourceType as PriceSourceType)
      : undefined;
    if (resolvedSourceType) andFilters.push({ sourceType: resolvedSourceType });

    const subTypeList = PriceDataUtils.parsePriceSubTypes(subTypes);
    const resolvedSubType = PriceDataUtils.normalizePriceSubType(subType);
    if (subTypeList.length === 0 && resolvedSubType) {
      andFilters.push({ subType: resolvedSubType });
    }
    const resolvedGeoLevel = Object.values(GeoLevel).includes(geoLevel as GeoLevel)
      ? (geoLevel as GeoLevel)
      : undefined;
    if (resolvedGeoLevel) andFilters.push({ geoLevel: resolvedGeoLevel });
    if (subTypeList.length > 0) {
      andFilters.push({ subType: { in: subTypeList } });
    }
    const reviewStatuses = PriceDataUtils.resolveReviewStatuses(reviewScope);
    if (reviewStatuses && reviewStatuses.length > 0) {
      andFilters.push({ reviewStatus: { in: reviewStatuses } });
    }
    const inputMethods = PriceDataUtils.resolveInputMethods(sourceScope);
    if (inputMethods && inputMethods.length > 0) {
      andFilters.push({ inputMethod: { in: inputMethods } });
    }

    // 采集点过滤
    if (collectionPointId) {
      andFilters.push({ collectionPointId });
    }
    const collectionPointIdList = PriceDataUtils.parseCsv(collectionPointIds);
    if (collectionPointIdList.length > 0) {
      andFilters.push({ collectionPointId: { in: collectionPointIdList } });
    }

    // 行政区划过滤
    if (regionCode) {
      andFilters.push({ regionCode });
    }

    // 采集点类型过滤（含 REGIONAL 类型）
    const pointTypeList = PriceDataUtils.parseCsv(pointTypes).filter((value): value is CollectionPointType =>
      Object.values(CollectionPointType).includes(value as CollectionPointType),
    );
    if (pointTypeList.length > 0) {
      const orConditions: Prisma.PriceDataWhereInput[] = [];
      orConditions.push({ collectionPoint: { type: { in: pointTypeList } } });
      if (pointTypeList.includes(CollectionPointType.REGION)) {
        orConditions.push({ sourceType: PriceSourceType.REGIONAL });
      }
      if (orConditions.length > 0) {
        andFilters.push({ OR: orConditions });
      }
    }

    // 日期范围
    if (startDate || endDate) {
      const range: Prisma.DateTimeFilter = {};
      if (startDate) range.gte = new Date(startDate);
      if (endDate) range.lte = new Date(endDate);
      andFilters.push({ effectiveDate: range });
    }

    // Keyword Search
    if (keyword) {
      andFilters.push({
        OR: [
          { commodity: { contains: keyword, mode: 'insensitive' } },
          { location: { contains: keyword, mode: 'insensitive' } },
          { region: { has: keyword } },
        ],
      });
    }

    const qualityTagList = PriceDataUtils.parseCsv(qualityTags).filter((value): value is PriceQualityTag =>
      PRICE_QUALITY_TAGS.includes(value as PriceQualityTag),
    );
    if (qualityTagList.length > 0) {
      andFilters.push({ qualityTag: { in: qualityTagList } });
    }
    const where = andFilters.length > 0 ? { AND: andFilters } : {};

    const [data, total] = await Promise.all([
      this.prisma.priceData.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { effectiveDate: 'desc' },
        // 新增：包含采集点关联信息
        include: {
          collectionPoint: {
            select: { id: true, code: true, name: true, shortName: true, type: true },
          },
        },
      }),
      this.prisma.priceData.count({ where }),
    ]);

    const result = {
      data: data.map((item) => this.serializePriceData(item)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
    this.logPerf('findAll', startedAt, {
      page,
      pageSize,
      hasKeyword: Boolean(keyword),
      hasQualityTags: qualityTagList.length > 0,
      resultSize: result.data.length,
      total,
    });
    return result;
  }

  /**
   * 获取单条价格数据
   */
  async findOne(id: string) {
    const data = await this.prisma.priceData.findUnique({ where: { id } });
    if (!data) {
      throw new NotFoundException(`价格数据 ID ${id} 不存在`);
    }
    return this.serializePriceData(data);
  }

  /**
   * 删除价格数据
   */
  async remove(id: string) {
    const existing = await this.prisma.priceData.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`价格数据 ID ${id} 不存在`);
    }
    await this.prisma.priceData.delete({ where: { id } });
    return { success: true };
  }

  /**
   * 序列化 Decimal 字段
   */
  private serializePriceData(data: PriceDataRecord) {
    return {
      ...data,
      price: Number(data.price),
      moisture: data.moisture ? Number(data.moisture) : null,
      toxin: data.toxin ? Number(data.toxin) : null,
      freight: data.freight ? Number(data.freight) : null,
      foldPrice: data.foldPrice ? Number(data.foldPrice) : null,
      dayChange: data.dayChange ? Number(data.dayChange) : null,
      yearChange: data.yearChange ? Number(data.yearChange) : null,
      qualityTag: data.qualityTag || PriceDataUtils.inferQualityTag(data),
    };
  }
}
