import { create } from 'zustand';

import { useAuthStore } from './auth';
import { aiApi, type AiStatus } from '../api/ai';

/**
 * AI availability for the whole app. `ready` stays false until the API answered (or failed — which counts as
 * "off"), so AI controls never flash in and out. When `enabled` is false no AI control renders and no AI call is
 * made: the editor mounts without its AI kit, the command palette hides the AI group, publishing runs on plain
 * rules (title from the note, summary from the first paragraph, category chosen by hand).
 *
 * `enabled = serverAvailable && activated` (SPEC-r9-ai-billing): the API must offer AI (a provider key or mock) and
 * the signed-in user must have activated it (accepted the 《AI 功能说明》). `balance` is the user's AI credits.
 */
interface AiState {
  ready: boolean;
  /** The API offers AI at all (provider configured). */
  serverAvailable: boolean;
  /** This user activated AI. */
  activated: boolean;
  /** Remaining AI credits (null until known). */
  balance: number | null;
  enabled: boolean;
  features: string[];
  load(): Promise<void>;
  /** Ask the API again (after sign-in / activation / a call that spent credits). */
  reload(): Promise<void>;
  /** A fresh balance from somewhere else (usage page, estimate, activation). */
  setCredits(patch: { balance?: number | null; activated?: boolean }): void;
  /** Re-read `balance` / `activated` after a call; a failed request changes nothing (AI stays as it was). */
  refreshCredits(): Promise<void>;
}

let inflight: Promise<void> | null = null;

/** Told whenever availability is settled (the web app toggles its AI commands in the palette). */
let setAiCommandsEnabled: (enabled: boolean) => void = () => {};

export function onAiEnabledChange(fn: (enabled: boolean) => void) {
  setAiCommandsEnabled = fn;
}

function settle(s: AiStatus | null) {
  const serverAvailable = Boolean(s?.enabled);
  // an API that predates 「开通 AI」 (or an anonymous visitor) answers no `activated`: counts as activated
  const activated = s ? s.activated !== false : false;
  const enabled = serverAvailable && activated;
  useAiStore.setState({
    ready: true,
    serverAvailable,
    activated,
    enabled,
    balance: typeof s?.balance === 'number' ? s.balance : null,
    features: serverAvailable ? (s?.features ?? []) : [],
  });
  setAiCommandsEnabled(enabled);
}

export const useAiStore = create<AiState>((set, get) => ({
  ready: false,
  serverAvailable: false,
  activated: false,
  balance: null,
  enabled: false,
  features: [],
  load: () => {
    inflight ??= aiApi
      .status()
      .then(settle)
      .catch(() => settle(null));
    return inflight;
  },
  reload: () => {
    inflight = null;
    return get().load();
  },
  refreshCredits: async () => {
    if (!get().serverAvailable) return;
    const s = await aiApi.status().catch(() => null);
    if (s?.enabled && typeof s.activated === 'boolean')
      get().setCredits({ activated: s.activated, balance: s.balance ?? null });
  },
  setCredits: (patch) => {
    const activated = patch.activated ?? get().activated;
    const enabled = get().serverAvailable && activated;
    set({ ...(patch.balance !== undefined ? { balance: patch.balance } : {}), activated, enabled });
    setAiCommandsEnabled(enabled);
  },
}));

// Signing in / out / switching accounts changes `activated` and `balance`: ask again (only once a status is known,
// so the first load still happens where the app asks for it).
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id && useAiStore.getState().ready) void useAiStore.getState().reload();
});

/** `{ready, enabled, serverAvailable, activated, balance}`; triggers the one status request on first use. */
export function useAiStatus(): {
  ready: boolean;
  enabled: boolean;
  serverAvailable: boolean;
  activated: boolean;
  balance: number | null;
} {
  const ready = useAiStore((s) => s.ready);
  const enabled = useAiStore((s) => s.enabled);
  const serverAvailable = useAiStore((s) => s.serverAvailable);
  const activated = useAiStore((s) => s.activated);
  const balance = useAiStore((s) => s.balance);
  if (!ready) void useAiStore.getState().load();
  return { ready, enabled, serverAvailable, activated, balance };
}

/** Test seam. `enabled` alone implies a server that offers AI and an activated user. */
export function resetAiStore(
  state: Partial<
    Pick<AiState, 'ready' | 'enabled' | 'features' | 'serverAvailable' | 'activated' | 'balance'>
  > = {},
) {
  inflight = state.ready ? Promise.resolve() : null;
  const serverAvailable = state.serverAvailable ?? Boolean(state.enabled);
  const activated = state.activated ?? Boolean(state.enabled);
  const enabled = state.enabled ?? (serverAvailable && activated);
  useAiStore.setState({
    ready: false,
    features: [],
    balance: null,
    ...state,
    serverAvailable,
    activated,
    enabled,
  });
  setAiCommandsEnabled(enabled);
}
