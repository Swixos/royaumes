import { ConcurrencyError } from './event-store'

/**
 * Runs an operation and retries it when it fails on a write conflict. The
 * operation must reload the state on each attempt, so it decides on fresh data.
 *
 * @param operation - Operation to run, including the state loading.
 * @param maxAttempts - Maximum number of attempts; 3 by default.
 * @returns The result of the first successful attempt.
 * @throws Any error other than {@link ConcurrencyError}, or the last conflict
 *   once `maxAttempts` is reached.
 */
export async function withOptimisticRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof ConcurrencyError) || attempt >= maxAttempts) throw error
    }
  }
}
