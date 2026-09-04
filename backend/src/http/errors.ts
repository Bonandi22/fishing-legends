import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
      });
    }

    if (error instanceof Error && ['ACCOUNT_ALREADY_EXISTS', 'INVALID_CREDENTIALS', 'INVALID_REFRESH_TOKEN', 'INVALID_ACCESS_TOKEN'].includes(error.message)) {
      return reply.status(error.message === 'ACCOUNT_ALREADY_EXISTS' ? 409 : 401).send({
        error: { code: error.message, message: 'Authentication request could not be completed' },
      });
    }

    if (error instanceof AppError) {
      request.log.warn({ code: error.code }, error.message);
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
}
