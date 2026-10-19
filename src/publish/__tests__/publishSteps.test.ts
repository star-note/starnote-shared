import {
  fieldsToCheck,
  nextStep,
  panelPrimary,
  prevStep,
  primaryAction,
  PUBLISH_STEPS,
  stepForField,
  stepShowsField,
} from '../publishSteps';

const base = {
  mode: 'publish' as const,
  inGroup: false,
  published: false,
  pending: false,
  rejected: false,
  done: false,
};

describe('phone publish flow: 填写 → 封面 → 预览 → 确认', () => {
  it('walks the four steps in order', () => {
    expect(PUBLISH_STEPS.map((s) => s.label)).toEqual(['填写', '封面', '预览', '确认']);
    expect(nextStep('fill')).toBe('cover');
    expect(nextStep('cover')).toBe('preview');
    expect(nextStep('preview')).toBe('confirm');
    expect(nextStep('confirm')).toBeNull();
    expect(prevStep('fill')).toBeNull();
    expect(prevStep('confirm')).toBe('preview');
  });

  it('splits the one form between 填写 and 封面 and validates per step', () => {
    const fields = ['title', 'summary', 'cover', 'category', 'visibility'];
    expect(fields.filter((f) => stepShowsField('fill', f))).toEqual([
      'title',
      'summary',
      'category',
      'visibility',
    ]);
    expect(fields.filter((f) => stepShowsField('cover', f))).toEqual(['cover']);
    expect(fields.filter((f) => stepShowsField('preview', f))).toEqual([]);
    expect(fieldsToCheck('fill', fields)).toEqual(['title', 'summary', 'category', 'visibility']);
    expect(fieldsToCheck('cover', fields)).toEqual(['cover']);
    expect(fieldsToCheck('preview', fields)).toBeNull();
    expect(fieldsToCheck('confirm', fields)).toBe('all');
    expect(stepForField('cover')).toBe('cover');
    expect(stepForField('category')).toBe('fill');
  });

  it('has exactly one primary per step: 下一步 until 确认, then 发布 / 提交审批 / 完成', () => {
    for (const s of ['fill', 'cover', 'preview'] as const)
      expect(primaryAction(s, base)).toEqual({ kind: 'next', label: '下一步', disabled: false });
    expect(primaryAction('confirm', base).label).toBe('发布到辰记');
    expect(primaryAction('confirm', { ...base, published: true }).label).toBe('更新到辰记');
    expect(primaryAction('confirm', { ...base, inGroup: true }).label).toBe('发布');
    expect(primaryAction('confirm', { ...base, mode: 'request' })).toEqual({
      kind: 'request',
      label: '提交审批',
      disabled: false,
    });
    expect(primaryAction('confirm', { ...base, mode: 'request', rejected: true }).label).toBe(
      '重新提交审批',
    );
    expect(primaryAction('confirm', { ...base, mode: 'request', pending: true }).disabled).toBe(
      true,
    );
    expect(primaryAction('confirm', { ...base, mode: 'none' }).disabled).toBe(true);
    expect(primaryAction('confirm', { ...base, done: true })).toEqual({
      kind: 'close',
      label: '完成',
      disabled: false,
    });
  });
});

describe('side panel flow: 填写 → 预览 → 记录', () => {
  const ctx = { ...base, running: false, url: null, failed: false };
  it('goes 下一步：预览, then publishes from 预览 with 返回修改 beside it', () => {
    expect(panelPrimary('form', ctx)).toMatchObject({
      kind: 'preview',
      label: '下一步：预览',
      back: false,
    });
    expect(panelPrimary('preview', ctx)).toMatchObject({
      kind: 'publish',
      label: '发布到辰记',
      back: true,
    });
    expect(panelPrimary('preview', { ...ctx, mode: 'request' })).toMatchObject({
      kind: 'request',
      label: '提交审批',
    });
  });
  it('on 记录: running, then 打开文章页 / 重新发布 / 查看审批流', () => {
    expect(panelPrimary('log', { ...ctx, running: true })).toMatchObject({
      kind: 'running',
      disabled: true,
    });
    expect(panelPrimary('log', { ...ctx, url: '/@demo/x' })).toMatchObject({
      kind: 'open',
      label: '打开文章页',
    });
    expect(panelPrimary('log', { ...ctx, failed: true })).toMatchObject({
      kind: 'publish',
      label: '重新发布',
    });
    expect(panelPrimary('log', { ...ctx, mode: 'request', done: true })).toMatchObject({
      kind: 'approvals',
      label: '查看审批流',
    });
    expect(panelPrimary('log', ctx)).toMatchObject({ kind: 'form', label: '去填写' });
  });
});
