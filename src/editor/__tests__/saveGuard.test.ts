import type { TiptapDoc } from '../../api/types';
import { isEmptyDoc, shouldSaveBody } from '../saveGuard';

const doc = (text?: string): TiptapDoc =>
  ({
    type: 'doc',
    content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }],
  }) as TiptapDoc;

describe('save guards', () => {
  it('knows an empty document', () => {
    expect(isEmptyDoc(doc())).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [] } as TiptapDoc)).toBe(true);
    expect(isEmptyDoc(doc('x'))).toBe(false);
  });

  it('does not save the editor normalizing what it loaded', () => {
    expect(
      shouldSaveBody({ content: doc('a'), stored: doc('a'), focused: false, touched: false }),
    ).toBe(false);
    expect(shouldSaveBody({ content: doc(), stored: doc(), focused: true, touched: true })).toBe(
      false,
    );
  });

  it('never empties a stored body unless the user did it', () => {
    expect(
      shouldSaveBody({ content: doc(), stored: doc('正文'), focused: false, touched: true }),
    ).toBe(false);
    expect(
      shouldSaveBody({ content: doc(), stored: doc('正文'), focused: true, touched: true }),
    ).toBe(true);
  });

  it('saves real edits', () => {
    expect(
      shouldSaveBody({ content: doc('新'), stored: doc('旧'), focused: true, touched: true }),
    ).toBe(true);
  });
});
