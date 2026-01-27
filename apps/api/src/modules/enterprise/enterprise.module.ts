import { Module } from '@nestjs/common';
import { EnterpriseController } from './enterprise.controller';
import { EnterpriseService } from './enterprise.service';

@Module({
    controllers: [EnterpriseController],
    providers: [EnterpriseService],
    exports: [EnterpriseService],
})
export class EnterpriseModule { }
