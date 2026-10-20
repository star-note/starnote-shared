import type { PublishMode } from './publishMode';

/** The phone's full-page publish flow: 填写 → 封面 → 预览 → 确认, one primary button per step. */
export type PublishStep = 'fill' | 'cover' | 'preview' | 'confirm';

export const PUBLISH_STEPS: { key: PublishStep; label: string }[] = [
  { key: 'fill', label: '填写' },
  { key: 'cover', label: '封面' },
  { key: 'preview', label: '预览' },
  { key: 'confirm', label: '确认' },
];

export function stepIndex(step: PublishStep): number {
  return PUBLISH_STEPS.findIndex((s) => s.key === step);
}

export function nextStep(step: PublishStep): PublishStep | null {
  return PUBLISH_STEPS[stepIndex(step) + 1]?.key ?? null;
}

export function prevStep(step: PublishStep): PublishStep | null {
  const i = stepIndex(step);
  return i > 0 ? PUBLISH_STEPS[i - 1].key : null;
}

/** Form fields a step shows (the form stays mounted throughout, so every value survives the steps). */
export function stepShowsField(step: PublishStep, field: string): boolean {
  if (step === 'fill') return field !== 'cover';
  if (step === 'cover') return field === 'cover';
  return false;
}

/** What has to validate before leaving a step: 填写 checks its own fields; later steps check everything. */
export function fieldsToCheck(step: PublishStep, fields: string[]): string[] | 'all' | null {
  if (step === 'fill') return fields.filter((f) => stepShowsField('fill', f));
  if (step === 'cover') return fields.filter((f) => f === 'cover');
  return step === 'confirm' ? 'all' : null;
}

/** A failed field sends the flow back to the step that shows it. */
export function stepForField(field: string): PublishStep {
  return field === 'cover' ? 'cover' : 'fill';
}

export interface PrimaryContext {
  mode: PublishMode;
  inGroup: boolean;
  /** Already on 辰记 (an update). */
  published: boolean;
  /** A publish request is waiting for approval. */
  pending: boolean;
  /** The last request was rejected. */
  rejected: boolean;
  /** This flow already published / submitted. */
  done: boolean;
}

export type PrimaryKind = 'next' | 'publish' | 'request' | 'close';

/** The one primary button at the bottom of a step. */
export function primaryAction(
  step: PublishStep,
  ctx: PrimaryContext,
): { kind: PrimaryKind; label: string; disabled: boolean } {
  if (step !== 'confirm') return { kind: 'next', label: '下一步', disabled: false };
  if (ctx.done) return { kind: 'close', label: '完成', disabled: false };
  if (ctx.mode === 'request') {
    if (ctx.pending) return { kind: 'request', label: '审批中', disabled: true };
    return { kind: 'request', label: ctx.rejected ? '重新提交审批' : '提交审批', disabled: false };
  }
  if (ctx.mode === 'none') return { kind: 'publish', label: '发布', disabled: true };
  if (ctx.inGroup) return { kind: 'publish', label: '发布', disabled: false };
  return { kind: 'publish', label: ctx.published ? '更新到辰记' : '发布到辰记', disabled: false };
}

/* ===== The side panel (desktop / tablet): 填写 → 预览 → 记录 ===== */
export type PanelTab = 'form' | 'preview' | 'log';

export interface PanelContext extends PrimaryContext {
  /** A publish (or a request) of this panel is running. */
  running: boolean;
  /** The finished run's article URL. */
  url?: string | null;
  /** The finished run failed. */
  failed: boolean;
}

export type PanelPrimaryKind =
  'preview' | 'publish' | 'request' | 'open' | 'approvals' | 'running' | 'form';

/**
 * The panel's one primary button per tab: 填写 → 「下一步：预览」; 预览 → 发布 / 提交审批 (with 「返回修改」 beside
 * it); 记录 → 发布中… while running, then 「打开文章页」, 「重新发布」 after a failure or 「查看审批流」 after a request.
 */
export function panelPrimary(
  tab: PanelTab,
  ctx: PanelContext,
): { kind: PanelPrimaryKind; label: string; disabled: boolean; back: boolean } {
  if (tab === 'form')
    return { kind: 'preview', label: '下一步：预览', disabled: false, back: false };
  if (tab === 'preview') {
    const p = primaryAction('confirm', { ...ctx, done: false });
    return {
      kind: p.kind === 'request' ? 'request' : 'publish',
      label: p.label,
      disabled: p.disabled,
      back: true,
    };
  }
  if (ctx.running)
    return {
      kind: 'running',
      label: ctx.mode === 'request' ? '提交中…' : '发布中…',
      disabled: true,
      back: false,
    };
  if (ctx.mode === 'request' && ctx.done)
    return { kind: 'approvals', label: '查看审批流', disabled: false, back: true };
  if (ctx.failed)
    return {
      kind: ctx.mode === 'request' ? 'request' : 'publish',
      label: ctx.mode === 'request' ? '重新提交' : '重新发布',
      disabled: false,
      back: true,
    };
  if (ctx.url) return { kind: 'open', label: '打开文章页', disabled: false, back: true };
  return { kind: 'form', label: '去填写', disabled: false, back: false };
}
