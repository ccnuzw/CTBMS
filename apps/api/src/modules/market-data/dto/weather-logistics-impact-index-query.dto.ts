import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const WeatherLogisticsImpactIndexQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    windowDays: z.coerce.number().int().min(1).max(90).default(14),
    commodityCode: z.string().trim().max(64).optional(),
    regionCode: z.string().trim().max(64).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.from || !value.to) {
      return;
    }
    const from = new Date(value.from).getTime();
    const to = new Date(value.to).getTime();
    if (from > to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'from 必须小于或等于 to',
      });
    }
  });

export class WeatherLogisticsImpactIndexQueryRequest extends createZodDto(
  WeatherLogisticsImpactIndexQuerySchema,
) {}
