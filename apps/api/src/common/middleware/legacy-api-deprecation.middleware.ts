import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { setDeprecationHeaders } from '../utils/deprecation';

const LEGACY_PREFIXES = ['/market-intel', '/market-data'];

@Injectable()
export class LegacyApiDeprecationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const path = req.path || '';
    if (LEGACY_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      setDeprecationHeaders(res, `/v1${path}`);
    }
    next();
  }
}
