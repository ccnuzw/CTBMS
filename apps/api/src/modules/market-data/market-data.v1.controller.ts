import { Controller } from '@nestjs/common';
import {
    MarketDataQueryController,
    ReconciliationController,
    ReconciliationCutoverController,
} from './controllers';
import { MarketDataService } from './market-data.service';

@Controller('v1/market-data')
export class MarketDataQueryV1Controller extends MarketDataQueryController {
    constructor(marketDataService: MarketDataService) {
        super(marketDataService);
    }
}

@Controller('v1/market-data')
export class ReconciliationV1Controller extends ReconciliationController {
    constructor(marketDataService: MarketDataService) {
        super(marketDataService);
    }
}

@Controller('v1/market-data')
export class ReconciliationCutoverV1Controller extends ReconciliationCutoverController {
    constructor(marketDataService: MarketDataService) {
        super(marketDataService);
    }
}
