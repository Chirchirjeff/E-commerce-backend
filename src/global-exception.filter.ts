// src/global-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch() // Empty decorator catches absolutely EVERYTHING (HTTP errors, database errors, type errors)
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine the status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Determine the error message payload
    let message: string | object = 'Internal server error';
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      message = typeof res === 'object' && (res as any).message ? (res as any).message : res;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Capture the tenant information context if available
    const tenant = (request as any).shopId || 'GLOBAL_CONTEXT';

    // ─── DEEP DEBUG TERMINAL LOGGING ───
    this.logger.error(`==================================================`);
    this.logger.error(`🔴 EXCEPTION CAUGHT [Tenant: ${tenant}]`);
    this.logger.error(`Method/Path: ${request.method} ${request.url}`);
    this.logger.error(`Status Code: ${status}`);
    this.logger.error(`Message: ${JSON.stringify(message)}`);
    
    // If it's a critical 500 error, print the full stack trace for deep debugging
    if (status === HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error) {
      this.logger.error(`Stack Trace:\n${exception.stack}`);
    }
    this.logger.error(`==================================================`);

    // Send a clean, unified response back to the client/frontend
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      tenant,
      message: Array.isArray(message) ? message : [message], // Always keep it an array format for front-end consistency
      error: exception instanceof Error ? exception.name : 'UnknownError',
    });
  }
}