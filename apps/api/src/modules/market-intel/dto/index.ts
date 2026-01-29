import {
    CreateMarketIntelSchema,
    UpdateMarketIntelSchema,
    MarketIntelQuerySchema,
    AnalyzeContentSchema,
    CreateManualResearchReportSchema,
} from '@packages/types';
import { createZodDto } from 'nestjs-zod';

export class CreateMarketIntelRequest extends createZodDto(CreateMarketIntelSchema) { }
export class UpdateMarketIntelRequest extends createZodDto(UpdateMarketIntelSchema) { }
export class MarketIntelQueryRequest extends createZodDto(MarketIntelQuerySchema) { }
export class AnalyzeContentRequest extends createZodDto(AnalyzeContentSchema) { }

export class CreateManualResearchReportRequest extends createZodDto(CreateManualResearchReportSchema) { }
