import { Controller } from '@nestjs/common';
import { MarketIntelController } from './market-intel.controller';

@Controller('v1/market-intel')
export class MarketIntelV1Controller extends MarketIntelController {}
