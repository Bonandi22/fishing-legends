import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { pgConstraint, pgErrorCode } from '../db/pgErrors.js';

export { pgConstraint, pgErrorCode };

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

type DomainErrorSpec = { status: number; message: string };

/**
 * Domain error codes a service may `throw new Error(<CODE>)` with, mapped to a
 * stable HTTP status and a safe, user-facing message. No internal detail leaks.
 */
const DOMAIN_ERRORS: Record<string, DomainErrorSpec> = {
  ACCOUNT_ALREADY_EXISTS: { status: 409, message: 'An account with that email already exists' },
  INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password' },
  INVALID_REFRESH_TOKEN: { status: 401, message: 'The refresh token is invalid or has expired' },
  REFRESH_TOKEN_REUSED: { status: 401, message: 'The refresh token was already used; the session has been revoked' },
  INVALID_ACCESS_TOKEN: { status: 401, message: 'The access token is missing or invalid' },
  INVALID_IDEMPOTENCY_KEY: { status: 400, message: 'A valid Idempotency-Key header is required' },
  INVALID_WALLET_AMOUNT: { status: 400, message: 'The amount is not valid' },
  INVALID_NET_QUANTITY: { status: 400, message: 'The net quantity is not valid' },
  LOCATION_LOCKED: { status: 403, message: 'That location is not unlocked yet' },
  NET_LIMIT_REACHED: { status: 409, message: 'The net limit has been reached' },
  NO_NETS: { status: 409, message: 'No fishing nets left' },
  INSUFFICIENT_FUNDS: { status: 409, message: 'Insufficient wallet balance' },
  SKIN_NOT_FOUND: { status: 404, message: 'That skin is not available for purchase' },
  SKIN_ALREADY_OWNED: { status: 409, message: 'That skin is already owned' },
  ROULETTE_ALREADY_USED: { status: 409, message: 'The daily roulette was already used today' },
  DAILY_GIFT_ALREADY_CLAIMED: { status: 409, message: 'The daily gift was already claimed today' },
  LOCAL_SAVE_ALREADY_IMPORTED: { status: 409, message: 'The local save has already been imported' },
  WAREHOUSE_FISH_NOT_FOUND: { status: 404, message: 'That warehouse fish was not found' },
  WAREHOUSE_EMPTY: { status: 422, message: 'The warehouse is empty' },
  INVALID_AQUARIUM_SECTOR: { status: 422, message: 'The aquarium sector is not valid' },
  AQUARIUM_FISH_NOT_FOUND: { status: 404, message: 'That aquarium fish was not found' },
  INVALID_PLAYER_PROGRESS: { status: 422, message: 'Player progress is not available' },
  INVALID_FISHING_REQUEST: { status: 422, message: 'The fishing request is not valid' },
  INVALID_FISHING_SESSION: { status: 422, message: 'The fishing session is not valid' },
  FISHING_SESSION_EXPIRED: { status: 410, message: 'The fishing session expired; start a new one' },
  NO_FISH_AVAILABLE: { status: 422, message: 'No fish are available at that location' },
  USERNAME_TAKEN: { status: 409, message: 'That username is already taken' },
  CSRF_FAILED: { status: 403, message: 'CSRF token missing or invalid' },
  STATE_VERSION_CONFLICT: { status: 409, message: 'The game state was modified elsewhere; reload before saving' },
  GAME_STATE_NOT_FOUND: { status: 409, message: 'No saved game state for this account yet' },
};

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError || hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
      });
    }

    if (error instanceof Error) {
      const spec = DOMAIN_ERRORS[error.message];
      if (spec) {
        return reply.status(spec.status).send({
          error: { code: error.message, message: spec.message },
        });
      }
    }

    if (error instanceof AppError) {
      request.log.warn({ code: error.code }, error.message);
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    // Fastify content-type parser errors (empty/malformed JSON body, unsupported
    // media type, body too large). These are client faults, not a 500.
    if (
      error && typeof (error as { code?: unknown }).code === 'string'
      && String((error as { code: string }).code).startsWith('FST_ERR_CTP_')
    ) {
      return reply.status(400).send({
        error: { code: 'INVALID_REQUEST_BODY', message: 'Request body is missing or malformed' },
      });
    }

    // A concurrent request with the same idempotency key won the insert race.
    // The client can retry: the second attempt reads the stored result.
    if (pgErrorCode(error) === '23505') {
      const idempotency = pgConstraint(error)?.includes('idempotency');
      return reply.status(409).send({
        error: {
          code: idempotency ? 'IDEMPOTENCY_CONFLICT' : 'RESOURCE_CONFLICT',
          message: idempotency
            ? 'A concurrent request with the same idempotency key is being processed'
            : 'The resource already exists',
        },
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
  });
}
