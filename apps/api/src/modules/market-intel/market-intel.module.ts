import { Module } from '@nestjs/common';
import {
  IntelCrudController,
  PriceDataController,
  PriceAlertController,
  EventInsightController,
  IntelSearchController,
  IntelDocumentController,
} from './controllers';
import {
  IntelCrudV1Controller,
  PriceDataV1Controller,
  PriceAlertV1Controller,
  EventInsightV1Controller,
  IntelSearchV1Controller,
  IntelDocumentV1Controller,
} from './market-intel.v1.controller';
import { IntelCrudService } from './intel-crud.service';
import { IntelEventInsightService } from './intel-event-insight.service';
import { IntelAnalysisService } from './intel-analysis.service';
import { IntelSearchService } from './intel-search.service';
import { IntelScoringService } from './intel-scoring.service';
import { PriceDataService } from './price-data.service';
import { PriceAnalyticsService } from './price-analytics.service';
import { PriceTimeseriesService } from './price-timeseries.service';
import { PriceAlertService } from './price-alert.service';

import { IntelAttachmentService } from './intel-attachment.service';

import { DocumentParserService } from './document-parser.service';
import { PdfToMarkdownService } from './pdf-to-markdown.service';

import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [KnowledgeModule],
  controllers: [
    // Base controllers — search/document controllers MUST come before CRUD controller
    // because IntelCrudController has a wildcard @Get(':id') route that would
    // swallow named routes like /feed, /universal-search, etc.
    IntelSearchController,
    IntelDocumentController,
    PriceDataController,
    PriceAlertController,
    EventInsightController,
    IntelCrudController,
    // V1 controllers (same order: named routes before wildcard :id)
    IntelSearchV1Controller,
    IntelDocumentV1Controller,
    PriceDataV1Controller,
    PriceAlertV1Controller,
    EventInsightV1Controller,
    IntelCrudV1Controller,
  ],
  providers: [
    IntelCrudService,
    IntelAnalysisService,
    IntelSearchService,
    IntelScoringService,
    PriceDataService,
    PriceAnalyticsService,
    PriceTimeseriesService,
    PriceAlertService,
    IntelAttachmentService,
    DocumentParserService,
    PdfToMarkdownService,
    IntelEventInsightService,
  ],
  exports: [
    IntelCrudService,
    IntelAnalysisService,
    IntelSearchService,
    IntelScoringService,
    PriceDataService,
    PriceAnalyticsService,
    PriceTimeseriesService,
    PriceAlertService,
    IntelAttachmentService,
    DocumentParserService,
    PdfToMarkdownService,
    IntelEventInsightService,
  ],
})
export class MarketIntelModule { }
