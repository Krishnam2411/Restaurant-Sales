import { useCallback, useRef, useState } from 'react';

/**
 * Wraps an async function so that concurrent calls are ignored while the first
 * one is still in-flight. Returns [wrappedFn, isPending].
 *
 * Use this for every button that triggers SQL / Tauri IPC work to prevent
 * double-click / double-submit issues.
 */
export function useAsyncAction<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): [(...args: T) => void, boolean] {
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);

  const wrapped = useCallback(
    (...args: T) => {
      if (pendingRef.current) return;
      pendingRef.current = true;
      setIsPending(true);

      fn(...args).finally(() => {
        pendingRef.current = false;
        setIsPending(false);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );

  return [wrapped, isPending];
}
