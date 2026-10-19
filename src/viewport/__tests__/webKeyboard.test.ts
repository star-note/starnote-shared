import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';

import { deleteBlockTr, duplicateBlockTr, moveBlockTr } from '../../editor/blockMove';
import {
  KEYBOARD_MIN,
  keyboardBarTop,
  keyboardInset,
  keyboardOpen,
  readViewport,
} from '../viewport';

describe('keyboard strip position', () => {
  it('sits at the bottom of the screen when no keyboard is up', () => {
    const m = { innerHeight: 844, vvHeight: 844, vvOffsetTop: 0 };
    expect(keyboardInset(m)).toBe(0);
    expect(keyboardOpen(m)).toBe(false);
    expect(keyboardBarTop(m, 48)).toBe(796);
  });

  it('rides right above the keyboard (iOS: visual viewport shrinks, layout viewport does not)', () => {
    const m = { innerHeight: 844, vvHeight: 508, vvOffsetTop: 0 };
    expect(keyboardInset(m)).toBe(336);
    expect(keyboardOpen(m)).toBe(true);
    expect(keyboardBarTop(m, 48)).toBe(460);
  });

  it('follows a visual viewport iOS scrolled down inside the page', () => {
    const m = { innerHeight: 844, vvHeight: 508, vvOffsetTop: 120 };
    expect(keyboardInset(m)).toBe(216);
    expect(keyboardBarTop(m, 48)).toBe(580);
  });

  it('treats a small shrink (the URL bar) as no keyboard, and handles a resized layout viewport (Android)', () => {
    expect(
      keyboardOpen({ innerHeight: 844, vvHeight: 844 - KEYBOARD_MIN + 1, vvOffsetTop: 0 }),
    ).toBe(false);
    const android = { innerHeight: 500, vvHeight: 500, vvOffsetTop: 0 };
    expect(keyboardInset(android)).toBe(0);
    expect(keyboardBarTop(android, 48)).toBe(452);
  });

  it('recomputes after a rotation (landscape) and never goes above the visible top', () => {
    const landscape = { innerHeight: 390, vvHeight: 160, vvOffsetTop: 0 };
    expect(keyboardBarTop(landscape, 48)).toBe(112);
    expect(keyboardBarTop({ innerHeight: 390, vvHeight: 30, vvOffsetTop: 10 }, 48)).toBe(10);
  });

  it('reads window.visualViewport, falling back to the layout viewport', () => {
    const win = {
      innerHeight: 700,
      visualViewport: { height: 400, offsetTop: 12 },
    } as unknown as Window;
    expect(readViewport(win)).toEqual({ innerHeight: 700, vvHeight: 400, vvOffsetTop: 12 });
    expect(readViewport({ innerHeight: 700, visualViewport: null } as unknown as Window)).toEqual({
      innerHeight: 700,
      vvHeight: 700,
      vvOffsetTop: 0,
    });
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    image: { group: 'block', atom: true, attrs: { src: { default: '' } }, toDOM: () => ['img'] },
    text: {},
  },
});
const p = (t: string) => schema.node('paragraph', null, t ? [schema.text(t)] : []);
const texts = (s: EditorState) => s.doc.content.content.map((n) => n.textContent || n.type.name);

describe('touch block moves (上移 / 下移 in the block menu)', () => {
  const doc = schema.node('doc', null, [p('一'), p('二'), schema.node('image'), p('三')]);
  const at = (pos: number) =>
    EditorState.create({ doc, selection: TextSelection.create(doc, pos) });

  it('moves the caret’s block up and down, keeping the caret in it', () => {
    const s = at(5); // inside 「二」
    const up = s.apply(moveBlockTr(s, 'up')!);
    expect(texts(up)).toEqual(['二', '一', 'image', '三']);
    expect(up.selection.$from.parent.textContent).toBe('二');
    const down = s.apply(moveBlockTr(s, 'down')!);
    expect(texts(down)).toEqual(['一', 'image', '二', '三']);
    expect(down.selection.$from.parent.textContent).toBe('二');
  });

  it('stops at the ends', () => {
    expect(moveBlockTr(at(1), 'up')).toBeNull();
    const last = at(doc.content.size - 1);
    expect(moveBlockTr(last, 'down')).toBeNull();
  });

  it('moves a selected picture as a node selection', () => {
    const s = EditorState.create({ doc, selection: NodeSelection.create(doc, 6) });
    const up = s.apply(moveBlockTr(s, 'up')!);
    expect(texts(up)).toEqual(['一', 'image', '二', '三']);
    expect((up.selection as NodeSelection).node.type.name).toBe('image');
  });

  it('copies and deletes the block', () => {
    const s = at(2);
    expect(texts(s.apply(duplicateBlockTr(s)!))).toEqual(['一', '一', '二', 'image', '三']);
    expect(texts(s.apply(deleteBlockTr(s)!))).toEqual(['二', 'image', '三']);
    const single = EditorState.create({ doc: schema.node('doc', null, [p('只有一段')]) });
    expect(texts(single.apply(deleteBlockTr(single)!))).toEqual(['paragraph']);
  });
});
