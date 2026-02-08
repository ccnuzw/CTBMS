import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

type AuthenticatedRequest = Request & {
    user?: {
        id: string;
        username: string;
        email: string;
        name: string;
        roles: string[];
    };
};

@Injectable()
export class MockAuthMiddleware implements NestMiddleware {
    private logger = new Logger('MockAuth');

    use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        const headerUserId = req.headers?.['x-virtual-user-id'];
        const virtualUserId = Array.isArray(headerUserId) ? headerUserId[0] : headerUserId;
        // Only if user is not already authenticated
        if (!req.user) {
            if (virtualUserId) {
                req.user = {
                    id: virtualUserId,
                    username: 'virtual',
                    email: 'virtual@example.com',
                    name: '虚拟用户',
                    roles: ['VIRTUAL_USER'],
                };
            } else {
                req.user = {
                    id: 'b0000000-0000-0000-0000-000000000001',
                    username: 'admin',
                    email: 'admin@example.com',
                    name: '系统管理员',
                    roles: ['SUPER_ADMIN']
                };
            }
            // this.logger.debug(`Injected Mock User: ${req.user.username}`);
        }
        next();
    }
}
