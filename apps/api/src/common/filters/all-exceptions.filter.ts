import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId =
      (request as Request & { requestId?: string }).requestId || request.header('x-request-id');

    let message: string | string[] = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    // Special handling for ZodValidationException to print detailed errors
    if (exception instanceof ZodValidationException) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      message = 'Request validation failed';
      code = 'VALIDATION_ERROR';
      details = { errors: exception.getZodError().errors };
      this.logger.error(
        `Validation Failed on ${request.method} ${request.url}`,
        JSON.stringify(exception.getZodError().errors, null, 2),
      );
    } else {
      if (exception instanceof HttpException) {
        const responseBody = exception.getResponse();
        if (typeof responseBody === 'string') {
          message = responseBody;
        } else if (responseBody && typeof responseBody === 'object') {
          const body = responseBody as {
            message?: string | string[];
            error?: string;
            details?: unknown;
          };
          if (body.message !== undefined) {
            message = body.message;
          }
          if (body.error) {
            code = body.error;
          }
          if (body.details !== undefined) {
            details = body.details;
          }
        }

        if (Array.isArray(message)) {
          details = { errors: message };
          message = 'Request validation failed';
          code = code === 'INTERNAL_ERROR' ? 'VALIDATION_ERROR' : code;
          if (status === HttpStatus.BAD_REQUEST) {
            status = HttpStatus.UNPROCESSABLE_ENTITY;
          }
        }

        if (code === 'INTERNAL_ERROR') {
          code = HttpStatus[status] || 'HTTP_ERROR';
        }
      }
      this.logger.error(
        `Http Status: ${status} Error Message: ${JSON.stringify(message)}`,
        (exception as Error).stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      traceId: requestId,
      error: {
        code,
        message,
        details,
      },
    });
  }
}
