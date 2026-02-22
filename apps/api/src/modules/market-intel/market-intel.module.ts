import { Module } from '@nestjs/common';
import { MarketIntelController } from './market-intel.controller';
import { IntelCrudService } from './intel-crud.service';
import { IntelAnalysisService } from './intel-analysis.service';
import { IntelSearchService } from './intel-search.service';
import { IntelScoringService } from './intel-scoring.service';
import { PriceDataService } from './price-data.service';
import { PriceAggregationService } from './price-aggregation.service';
import { PriceAlertService } from './price-alert.service';

import { IntelAttachmentService } from './intel-attachment.service';

import { DocumentParserService } from './document-parser.service';
import { PdfToMarkdownService } from './pdf-to-markdown.service';

import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [KnowledgeModule],
  controllers: [MarketIntelController],
  providers: [
    IntelCrudService,
    IntelAnalysisService,
    IntelSearchService,
    IntelScoringService,
    PriceDataService,
    PriceAggregationService,
    PriceAlertService,

    IntelAttachmentService,

    DocumentParserService,
    PdfToMarkdownService,
    PdfToMarkdownService,
  ],
  exports: [
    IntelCrudService,
    IntelAnalysisService,
    IntelSearchService,
    IntelScoringService,
    PriceDataService,
    PriceAggregationService,
    PriceAlertService,

    IntelAttachmentService,

    DocumentParserService,
    PdfToMarkdownService,
    PdfToMarkdownService,
  ],
})
export class MarketIntelModule { }
