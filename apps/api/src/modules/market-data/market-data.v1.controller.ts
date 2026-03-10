import { Controller } from '@nestjs/common';
import { MarketDataController } from './market-data.controller';

@Controller('v1/market-data')
export class MarketDataV1Controller extends MarketDataController {}
