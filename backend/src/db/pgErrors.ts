// Best-effort inspection of node-postgres / Drizzle errors. The pg DatabaseError
// carries a 5-digit SQLSTATE `code` and, for constraint violations, a
// `constraint` name. Drizzle sometimes wraps it, so check `.cause` too.

function candidates(error: unknown): unknown[] {
  return [error, (error as { cause?: unknown } | undefined)?.cause];
}

export function pgErrorCode(error: unknown): string | undefined {
  for (const candidate of candidates(error)) {
    if (candidate && typeof candidate === 'object' && 'code' in candidate) {
      const code = (candidate as { code?: unknown }).code;
      if (typeof code === 'string' && /^\d{5}$/.test(code)) return code;
    }
  }
  return undefined;
}

export function pgConstraint(error: unknown): string | undefined {
  for (const candidate of candidates(error)) {
    if (candidate && typeof candidate === 'object' && 'constraint' in candidate) {
      const constraint = (candidate as { constraint?: unknown }).constraint;
      if (typeof constraint === 'string') return constraint;
    }
  }
  return undefined;
}

export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown, constraintContains?: string): boolean {
  if (pgErrorCode(error) !== UNIQUE_VIOLATION) return false;
  if (!constraintContains) return true;
  return pgConstraint(error)?.includes(constraintContains) ?? false;
}
