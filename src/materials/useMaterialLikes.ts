/** 点赞 state for a grid of materials (official, 开源, my groups'): one batched read, optimistic toggles. */
import { useCallback, useEffect, useState } from 'react';

import { type MaterialLike, materialsApi } from '../api/materials';

export function useMaterialLikes(targets: string[], onError?: () => void) {
  const key = targets.join(',');
  const [local, setLocal] = useState<Record<string, MaterialLike>>({});
  const [server, setServer] = useState<Record<string, MaterialLike>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    void materialsApi.likes(key.split(',')).then((d) => {
      if (live) setServer((m) => ({ ...m, ...d }));
    });
    return () => {
      live = false;
    };
  }, [key]);
  const get = useCallback((t: string): MaterialLike | undefined => local[t] ?? server[t], [local, server]);
  const toggle = useCallback(
    /** Resolves with the state that stuck (the server's, or the old one after a failure). */
    async (t: string): Promise<MaterialLike> => {
      const was = get(t) ?? { count: 0, liked: false };
      const next = { liked: !was.liked, count: Math.max(0, was.count + (was.liked ? -1 : 1)) };
      setLocal((m) => ({ ...m, [t]: next }));
      try {
        const saved = await materialsApi.like(t, next.liked);
        setLocal((m) => ({ ...m, [t]: saved }));
        return saved;
      } catch {
        setLocal((m) => ({ ...m, [t]: was }));
        onError?.();
        return was;
      }
    },
    [get, onError],
  );
  return { get, toggle };
}
