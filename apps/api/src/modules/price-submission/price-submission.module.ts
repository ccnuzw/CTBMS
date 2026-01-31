import { Module } from '@nestjs/common';
import { PriceSubmissionController, PriceDataReviewController } from './price-submission.controller';
import { PriceSubmissionService } from './price-submission.service';

@Module({
  controllers: [PriceSubmissionController, PriceDataReviewController],
  providers: [PriceSubmissionService],
  exports: [PriceSubmissionService],
})
export class PriceSubmissionModule {}
