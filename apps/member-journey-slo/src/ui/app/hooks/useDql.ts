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

/**
 * Runs a DQL query against Grail and returns its records.
 *
 * The timeframe is passed explicitly in the request (defaultTimeframeStart/End)
 * rather than relying on an inline `from:` in the DQL — inside an app the inline
 * timeframe is not reliably applied, which otherwise collapses the query to a
 * tiny default window and yields empty results.
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

    async function run() {
      const end = new Date();
      const start = new Date(end.getTime() - fromDaysAgo * 24 * 60 * 60 * 1000);

      let response = await queryExecutionClient.queryExecute({
        body: {
          query,
          requestTimeoutMilliseconds: 30000,
          defaultTimeframeStart: start.toISOString(),
          defaultTimeframeEnd: end.toISOString(),
        },
      });

      // Poll until Grail returns records or the request can no longer progress.
      while (!response.result && response.requestToken) {
        response = await queryExecutionClient.queryPoll({
          requestToken: response.requestToken,
        });
      }

      return (response.result?.records ?? []) as T[];
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
