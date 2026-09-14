export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}
export function invariant(condition: unknown, code: string, message: string, status = 422): asserts condition {
  if (!condition) throw new DomainError(code, message, status);
}
