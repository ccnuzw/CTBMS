import { Module, Global } from '@nestjs/common';
import { IntelTaskController } from './intel-task.controller';
import { IntelTaskService } from './intel-task.service';
import { IntelTaskTemplateService } from './intel-task-template.service';

@Global() // Make it global so MarketIntelModule can easily use services if needed (or just import the module)
@Module({
    controllers: [IntelTaskController],
    providers: [
        IntelTaskService,
        IntelTaskTemplateService,
    ],
    exports: [
        IntelTaskService,
        IntelTaskTemplateService,
    ],
})
export class IntelTaskModule { }
