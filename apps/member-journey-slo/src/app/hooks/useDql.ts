import { useEffect, useState } from 'react';
import { queryExecutionClient } from '@dynatrace-sdk/client-query';

export interface DqlState<T> {
  data: T[] | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs a DQL query against Grail and returns its records. The query is executed
 * with an inline request timeout; if Grail needs longer, the result is polled
 * until it reaches a terminal state.
 */
export function useDql<T = Record<string, unknown>>(query: string): DqlState<T> {
  const [state, setState] = useState<DqlState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    async function run() {
      let response = await queryExecutionClient.queryExecute({
        body: { query, requestTimeoutMilliseconds: 30000 },
      });

      // Poll while the query is still running and no records are available yet.
      while (
        !response.result &&
        response.requestToken &&
        response.state === 'RUNNING'
      ) {
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
  }, [query]);

  return state;
}
