export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function ignoreError(_error: unknown): void {}

export function getErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'bigint' || typeof error === 'boolean') {
    return String(error);
  }
  return fallback;
}
