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

    if (error instanceof Error && ['ACCOUNT_ALREADY_EXISTS', 'INVALID_CREDENTIALS', 'INVALID_REFRESH_TOKEN', 'INVALID_ACCESS_TOKEN', 'INVALID_FISHING_REQUEST', 'LOCATION_LOCKED', 'INVALID_FISHING_SESSION', 'INVALID_IDEMPOTENCY_KEY', 'INVALID_WALLET_AMOUNT', 'INVALID_NET_QUANTITY', 'NET_LIMIT_REACHED', 'INSUFFICIENT_FUNDS', 'INVALID_PLAYER_PROGRESS', 'WAREHOUSE_EMPTY', 'WAREHOUSE_FISH_NOT_FOUND', 'INVALID_AQUARIUM_SECTOR'].includes(error.message)) {
      const status = error.message === 'ACCOUNT_ALREADY_EXISTS' ? 409
        : error.message === 'LOCATION_LOCKED' ? 403
        : error.message === 'INVALID_IDEMPOTENCY_KEY' ? 400
        : error.message === 'WAREHOUSE_FISH_NOT_FOUND' ? 404
        : error.message === 'NET_LIMIT_REACHED' || error.message === 'INSUFFICIENT_FUNDS' ? 409
        : error.message === 'INVALID_PLAYER_PROGRESS' ? 422
        : error.message === 'INVALID_NET_QUANTITY' ? 400
        : error.message === 'WAREHOUSE_EMPTY' || error.message === 'INVALID_AQUARIUM_SECTOR' ? 422
        : error.message.startsWith('INVALID_FISHING') ? 422
        : 401;
      return reply.status(status).send({
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
