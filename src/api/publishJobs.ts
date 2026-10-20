import { api, API_BASE } from './client';
import type { Paged } from './types';

/** Server-side record of one publish run (SPEC §7): the tasks per platform and the events they emitted. */
export interface PublishJobTask {
  platform: string;
  state: 'pending' | 'running' | 'need_input' | 'done' | 'failed' | 'unsupported';
  progress: number;
  result: { url?: string } | null;
  error: string | null;
}
export interface PublishJob {
  id: string;
  note_id: string;
  tasks: PublishJobTask[];
  form: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
export interface JobEvent {
  platform: string;
  type: string;
  at: string;
  [k: string]: unknown;
}

export const publishJobsApi = {
  create: (body: { note_id: string; platforms: string[]; form?: Record<string, unknown> }) =>
    api.post<PublishJob>('/publish/jobs', body),
  list: (noteId: string, page = 1) =>
    api.get<Paged<PublishJob>>('/publish/jobs', {
      params: { note_id: noteId, page, page_size: 10 },
    }),
  pushEvents: (jobId: string, platform: string, events: unknown[]) =>
    api.post<PublishJob>(`/publish/jobs/${jobId}/tasks/${platform}/events`, { events }),
  /** Replays a finished job's events from its SSE stream (it ends with `event: end`). */
  async events(jobId: string, token: string | null, signal?: AbortSignal): Promise<JobEvent[]> {
    const res = await fetch(`${API_BASE}/publish/jobs/${jobId}/events`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal,
    });
    if (!res.ok || !res.body) throw new Error('记录加载失败');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const out: JobEvent[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^event: end/m.test(block)) {
          void reader.cancel();
          return out;
        }
        const data = block.split('\n').find((l) => l.startsWith('data: '));
        if (data) {
          try {
            out.push(JSON.parse(data.slice(6)) as JobEvent);
          } catch {
            /* keep-alive or junk */
          }
        }
      }
    }
    return out;
  },
};
