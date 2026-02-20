import { Module } from '@nestjs/common';
import { MarketIntelController } from './market-intel.controller';
import { MarketIntelService } from './market-intel.service';
import { PriceDataService } from './price-data.service';

import { IntelAttachmentService } from './intel-attachment.service';

import { DocumentParserService } from './document-parser.service';
import { PdfToMarkdownService } from './pdf-to-markdown.service';
import { ResearchReportService } from './research-report.service';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [KnowledgeModule],
  controllers: [MarketIntelController],
  providers: [
    MarketIntelService,
    PriceDataService,

    IntelAttachmentService,

    DocumentParserService,
    PdfToMarkdownService,
    ResearchReportService,
  ],
  exports: [
    MarketIntelService,
    PriceDataService,

    IntelAttachmentService,

    DocumentParserService,
    PdfToMarkdownService,
    ResearchReportService,
  ],
})
export class MarketIntelModule { }
