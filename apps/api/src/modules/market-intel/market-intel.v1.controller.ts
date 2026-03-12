import { Controller } from '@nestjs/common';
import { IntelCrudController } from './controllers/intel-crud.controller';
import { PriceDataController } from './controllers/price-data.controller';
import { PriceAlertController } from './controllers/price-alert.controller';
import { EventInsightController } from './controllers/event-insight.controller';
import { IntelSearchController } from './controllers/intel-search.controller';
import { IntelDocumentController } from './controllers/intel-document.controller';

/**
 * V1 Controllers — inherit from split controllers to provide /v1/market-intel/... routes.
 */

@Controller('v1/market-intel')
export class IntelCrudV1Controller extends IntelCrudController { }

@Controller('v1/market-intel')
export class PriceDataV1Controller extends PriceDataController { }

@Controller('v1/market-intel')
export class PriceAlertV1Controller extends PriceAlertController { }

@Controller('v1/market-intel')
export class EventInsightV1Controller extends EventInsightController { }

@Controller('v1/market-intel')
export class IntelSearchV1Controller extends IntelSearchController { }

@Controller('v1/market-intel')
export class IntelDocumentV1Controller extends IntelDocumentController { }
