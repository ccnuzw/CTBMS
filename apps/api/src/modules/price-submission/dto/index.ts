import { createZodDto } from 'nestjs-zod';
import {
  CreatePriceSubmissionSchema,
  UpdatePriceSubmissionSchema,
  QueryPriceSubmissionSchema,
  SubmitPriceEntrySchema,
  BulkSubmitPriceEntriesSchema,
  ReviewPriceDataSchema,
  BatchReviewPriceDataSchema,
  ReviewPriceSubmissionSchema,
} from '@packages/types';

export class CreatePriceSubmissionDto extends createZodDto(CreatePriceSubmissionSchema) {}

export class UpdatePriceSubmissionDto extends createZodDto(UpdatePriceSubmissionSchema) {}

export class QueryPriceSubmissionDto extends createZodDto(QueryPriceSubmissionSchema) {}

export class SubmitPriceEntryDto extends createZodDto(SubmitPriceEntrySchema) {}

export class BulkSubmitPriceEntriesDto extends createZodDto(BulkSubmitPriceEntriesSchema) {}

export class ReviewPriceDataDto extends createZodDto(ReviewPriceDataSchema) {}

export class BatchReviewPriceDataDto extends createZodDto(BatchReviewPriceDataSchema) {}

export class ReviewPriceSubmissionDto extends createZodDto(ReviewPriceSubmissionSchema) {}
