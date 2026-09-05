// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { pgConstraint, pgErrorCode, registerErrorHandling } from './errors.js';

describe('pg error inspection', () => {
  it('reads a SQLSTATE code from the error or its cause', () => {
    expect(pgErrorCode({ code: '23505' })).toBe('23505');
    expect(pgErrorCode(new Error('x', { cause: { code: '23505' } }))).toBe('23505');
    expect(pgErrorCode({ code: 'ENOENT' })).toBeUndefined();
    expect(pgErrorCode(new Error('plain'))).toBeUndefined();
  });

  it('reads a constraint name from the error or its cause', () => {
    expect(pgConstraint({ constraint: 'wallet_transaction_idempotency_unique' })).toBe('wallet_transaction_idempotency_unique');
    expect(pgConstraint(new Error('x', { cause: { constraint: 'users_email_unique' } }))).toBe('users_email_unique');
  });
});

describe('registerErrorHandling', () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  afterEach(async () => {
    await Promise.all(apps.map(app => app.close()));
    apps.length = 0;
  });

  function appThrowing(thrown: unknown) {
    const app = Fastify({ logger: false });
    registerErrorHandling(app);
    app.get('/boom', async () => { throw thrown; });
    apps.push(app);
    return app;
  }

  it('maps a known domain code to its status and safe message', async () => {
    const response = await appThrowing(new Error('WAREHOUSE_EMPTY')).inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({ error: { code: 'WAREHOUSE_EMPTY', message: 'The warehouse is empty' } });
  });

  it('maps a unique-violation on an idempotency constraint to 409 IDEMPOTENCY_CONFLICT', async () => {
    const pgError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'wallet_transaction_idempotency_unique',
    });
    const response = await appThrowing(pgError).inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('falls back to 500 for an unknown error without leaking detail', async () => {
    const response = await appThrowing(new Error('some internal detail')).inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
});
