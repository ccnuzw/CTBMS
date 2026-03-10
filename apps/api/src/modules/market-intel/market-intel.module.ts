import { Module } from '@nestjs/common';
import { MarketIntelController } from './market-intel.controller';
import { MarketIntelV1Controller } from './market-intel.v1.controller';
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
  controllers: [MarketIntelController, MarketIntelV1Controller],
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
    PdfToMarkdownService,
      IntelEventInsightService,
  ],
})
export class MarketIntelModule { }
