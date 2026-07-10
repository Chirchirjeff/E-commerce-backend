import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
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

    // Log based on severity
    if (status >= 500) {
      this.logger.error(
        `[${tenant}] ${request.method} ${request.url} - ${status}: ${messages[0]}`,
        exception instanceof Error ? exception.stack : undefined
      );
    } else if (status >= 400) {
      this.logger.warn(
        `[${tenant}] ${request.method} ${request.url} - ${status}: ${messages[0]}`
      );
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
