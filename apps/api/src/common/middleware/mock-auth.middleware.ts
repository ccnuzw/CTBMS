import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class MockAuthMiddleware implements NestMiddleware {
    private logger = new Logger('MockAuth');

    use(req: any, res: Response, next: NextFunction) {
        // Only if user is not already authenticated
        if (!req.user) {
            req.user = {
                id: 'b0000000-0000-0000-0000-000000000001',
                username: 'admin',
                email: 'admin@example.com',
                name: '系统管理员',
                roles: ['SUPER_ADMIN']
            };
            // this.logger.debug(`Injected Mock User: ${req.user.username}`);
        }
        next();
    }
}
