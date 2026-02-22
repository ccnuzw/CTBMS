import { Module, Global } from '@nestjs/common';
import { IntelTaskController } from './intel-task.controller';
import { IntelTaskService } from './intel-task.service';
import { IntelTaskStateService } from './intel-task-state.service';
import { IntelTaskMetricsService } from './intel-task-metrics.service';
import { IntelTaskTemplateService } from './intel-task-template.service';
import { IntelTaskDispatchService } from './intel-task-dispatch.service';
import { TaskSchedulerService } from './task-scheduler.service';

@Global() // Make it global so MarketIntelModule can easily use services if needed (or just import the module)
@Module({
    controllers: [IntelTaskController],
    providers: [
    IntelTaskService,
    IntelTaskTemplateService,
    IntelTaskDispatchService,
        TaskSchedulerService,
    ],
    exports: [
    IntelTaskService,
    IntelTaskTemplateService,
    IntelTaskDispatchService,
    ],
})
export class IntelTaskModule { }
