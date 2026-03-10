import { Response } from 'express';

const DEFAULT_SUNSET_DATE = process.env.API_DEPRECATION_SUNSET || '2026-09-30';

export const setDeprecationHeaders = (
  res: Response,
  successor?: string,
  sunset: string = DEFAULT_SUNSET_DATE,
) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', sunset);
  if (successor) {
    res.setHeader('Link', `<${successor}>; rel="successor-version"`);
  }
};
