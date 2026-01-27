import { Module } from '@nestjs/common';
import { MarketIntelController } from './market-intel.controller';
import { MarketIntelService } from './market-intel.service';
import { PriceDataService } from './price-data.service';

import { IntelAttachmentService } from './intel-attachment.service';

import { DocumentParserService } from './document-parser.service';
import { ResearchReportService } from './research-report.service';

@Module({
    controllers: [MarketIntelController],
    providers: [
        MarketIntelService,
        PriceDataService,

        IntelAttachmentService,

        DocumentParserService,
        ResearchReportService,
    ],
    exports: [
        MarketIntelService,
        PriceDataService,

        IntelAttachmentService,

        DocumentParserService,
        ResearchReportService,
    ],
})
export class MarketIntelModule { }
