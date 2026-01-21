import { Module } from '@nestjs/common';
import { MarketIntelController } from './market-intel.controller';
import { MarketIntelService } from './market-intel.service';
import { PriceDataService } from './price-data.service';
import { IntelTaskService } from './intel-task.service';
import { IntelAttachmentService } from './intel-attachment.service';
import { IntelEntityService } from './intel-entity.service';
import { DocumentParserService } from './document-parser.service';
import { ResearchReportService } from './research-report.service';

@Module({
    controllers: [MarketIntelController],
    providers: [
        MarketIntelService,
        PriceDataService,
        IntelTaskService,
        IntelAttachmentService,
        IntelEntityService,
        DocumentParserService,
        ResearchReportService,
    ],
    exports: [
        MarketIntelService,
        PriceDataService,
        IntelTaskService,
        IntelAttachmentService,
        IntelEntityService,
        DocumentParserService,
        ResearchReportService,
    ],
})
export class MarketIntelModule { }
