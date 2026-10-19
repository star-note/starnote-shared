import { create } from 'zustand';

import type { PublishEvent } from '../publish/sdk';

export type PlatformKey =
  'chenji' | 'wechat' | 'zhihu' | 'juejin' | 'xiaohongshu' | 'yuque' | 'medium';

interface PublishState {
  noteId: string | null;
  running: boolean;
  events: Record<string, PublishEvent[]>;
  lastResult: { url?: string; error?: string } | null;
  start(noteId: string): void;
  pushEvent(platform: string, e: PublishEvent): void;
  finish(result: PublishState['lastResult']): void;
  clearLogs(): void;
}

export const usePublishStore = create<PublishState>((set) => ({
  noteId: null,
  running: false,
  events: {},
  lastResult: null,
  start: (noteId) => set({ noteId, running: true, events: {}, lastResult: null }),
  pushEvent: (platform, e) =>
    set((s) => ({ events: { ...s.events, [platform]: [...(s.events[platform] ?? []), e] } })),
  finish: (lastResult) => set({ running: false, lastResult }),
  clearLogs: () => set({ events: {}, lastResult: null }),
}));
