import type { TFunction } from 'i18next';

export type AppError = {
  code: string;
  message: string;
  details?: string;
  data?: Record<string, unknown>;
  source?: string;
};

const DEFAULT_CODE = 'UNEXPECTED';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const extractAppError = (value: UnknownRecord): AppError | null => {
  const code = getString(value.code);
  const message = getString(value.message);
  if (code && message) {
    return {
      code,
      message,
      details: getString(value.details),
      data: isRecord(value.data) ? value.data : undefined,
      source: getString(value.source),
    };
  }
  return null;
};

export const normalizeError = (err: unknown): AppError => {
  if (isRecord(err)) {
    const direct = extractAppError(err);
    if (direct) return direct;

    if ('payload' in err && isRecord(err.payload)) {
      const payloadError = extractAppError(err.payload);
      if (payloadError) {
        return {
          ...payloadError,
          source: getString(err.source) || payloadError.source,
        };
      }
    }

    const message = getString(err.message) || getString(err.error);
    if (message) {
      const trimmed = message.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed) as UnknownRecord;
          const parsedError = extractAppError(parsed);
          if (parsedError) {
            return parsedError;
          }
        } catch {
          // Ignore parse errors and fall back to raw message.
        }
      }
      return {
        code: DEFAULT_CODE,
        message,
      };
    }
  }

  if (typeof err === 'string') {
    return {
      code: DEFAULT_CODE,
      message: err,
    };
  }

  return {
    code: DEFAULT_CODE,
    message: 'Unexpected error',
  };
};

export const withErrorSource = (err: unknown, source: string): AppError => {
  const normalized = normalizeError(err);
  return { ...normalized, source };
};

export const getErrorMessage = (err: unknown): string => {
  const normalized = normalizeError(err);
  return normalized.details || normalized.message;
};

type FormatErrorOptions = {
  fallbackKey?: string;
  data?: Record<string, unknown>;
};

const ERROR_CODE_TO_I18N: Record<string, string> = {};

export const formatError = (
  t: TFunction,
  err: unknown,
  options?: FormatErrorOptions
): string => {
  const normalized = normalizeError(err);
  const message = normalized.details || normalized.message;
  const key = ERROR_CODE_TO_I18N[normalized.code] || options?.fallbackKey;

  if (key) {
    return t(key, {
      error: message,
      reason: message,
      ...normalized.data,
      ...options?.data,
    });
  }

  return message;
};
