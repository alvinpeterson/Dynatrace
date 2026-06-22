import { useEffect, useState } from 'react';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

export interface DqlState<T> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
}

export interface UseDqlOptions {
  /** How far back to query, in days. Default 28. */
  fromDaysAgo?: number;
}

/** Overall budget for a single query (inline + polling), in milliseconds. */
const QUERY_BUDGET_MS = 110_000;
const POLL_INTERVAL_MS = 1_500;

/**
 * Runs a DQL query against Grail and returns its records.
 *
 * The timeframe is passed explicitly in the request (defaultTimeframeStart/End)
 * rather than relying on an inline `from:` in the DQL — inside an app the inline
 * timeframe is not reliably applied.
 *
 * Queries that don't finish within the inline request timeout return a request
 * token; we hold onto that original token and poll it until the result is ready
 * (poll responses do not echo the token back).
 */
export function useDql<T = Record<string, unknown>>(
  query: string,
  options: UseDqlOptions = {},
): DqlState<T> {
  const { fromDaysAgo = 28 } = options;
  const [state, setState] = useState<DqlState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    async function run(): Promise<T[]> {
      const end = new Date();
      const start = new Date(end.getTime() - fromDaysAgo * 24 * 60 * 60 * 1000);

      const response = await queryExecutionClient.queryExecute({
        body: {
          query,
          requestTimeoutMilliseconds: 30000,
          defaultTimeframeStart: start.toISOString(),
          defaultTimeframeEnd: end.toISOString(),
        },
      });

      // Finished within the inline request timeout.
      if (response.result) {
        return (response.result.records ?? []) as T[];
      }

      // Otherwise poll the original token until the query completes.
      const token = response.requestToken;
      if (!token) return [];

      const deadline = Date.now() + QUERY_BUDGET_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const polled = await queryExecutionClient.queryPoll({ requestToken: token });
        if (polled.result) {
          return (polled.result.records ?? []) as T[];
        }
        if (polled.state === 'CANCELLED' || polled.state === 'FAILED') {
          throw new Error(`Query ${String(polled.state).toLowerCase()}`);
        }
      }
      throw new Error('Query timed out');
    }

    run()
      .then((records) => {
        if (!cancelled) setState({ data: records, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, fromDaysAgo]);

  return state;
}
