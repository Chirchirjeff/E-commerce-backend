import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine status code
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Determine message
    let message: string | string[] = 'Internal server error';
    
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      message = typeof exceptionResponse === 'object' && (exceptionResponse as any).message
        ? (exceptionResponse as any).message
        : exceptionResponse;
    } else if (exception instanceof Error) {
      message = 'Something went wrong. Please try again.';
    }

    // Format message as array for consistency
    const messages = (Array.isArray(message) ? message : [message]).map((item) =>
      this.toPublicMessage(String(item), status),
    );

    // Get tenant info
    const tenant = (request as any).shopId || 'N/A';

    // Enhanced logging based on status code
    const logContext = {
      method: request.method,
      url: request.url,
      status,
      tenant,
      body: request.body,
      params: request.params,
      query: request.query,
      headers: {
        'user-agent': request.headers['user-agent'],
        'content-type': request.headers['content-type'],
        origin: request.headers.origin,
      },
    };

    if (status >= 500) {
      this.logger.error(
        `[${tenant}] ${request.method} ${request.url} - ${status}: ${messages[0]}`,
        exception instanceof Error ? exception.stack : undefined
      );
      this.logger.debug(`Request details: ${JSON.stringify(logContext, null, 2)}`);
    } else if (status === 404) {
      // Special handling for 404s to help debug routing issues
      this.logger.warn(
        `🔍 404 NOT FOUND: ${request.method} ${request.url}`
      );
      this.logger.warn(`   Available routes should include: POST /auth/admin/login`);
      this.logger.warn(`   Tenant: ${tenant}`);
      this.logger.warn(`   Request body: ${JSON.stringify(request.body)}`);
      
      if (exception instanceof NotFoundException) {
        this.logger.warn(`   404 Reason: ${exception.message}`);
      }
    } else if (status >= 400) {
      this.logger.warn(
        `[${tenant}] ${request.method} ${request.url} - ${status}: ${messages[0]}`
      );
      
      // Log validation errors in detail
      if (status === 400 && Array.isArray(messages) && messages.length > 1) {
        this.logger.warn(`   Validation errors: ${JSON.stringify(messages)}`);
      }
    }

    // Send response
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: messages,
    });
  }

  private toPublicMessage(message: string, status: number) {
    if (
      /prisma|database|constraint|stack|exception|query|syntax|json|expected property|invalid `|public\./i.test(
        message,
      )
    ) {
      if (status === HttpStatus.CONFLICT) return 'This account or shop already exists';
      if (status === HttpStatus.UNAUTHORIZED) return 'Invalid email or password';
      if (status === HttpStatus.BAD_REQUEST) return 'Please check your details and try again';
      return 'Something went wrong. Please try again.';
    }

    return message;
  }
}
