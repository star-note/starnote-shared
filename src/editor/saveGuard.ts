import { hasBody } from './normalizeDoc';
import type { TiptapDoc } from '../api/types';

/** No blocks, or a single empty paragraph (what an empty editor reports). */
export function isEmptyDoc(doc: TiptapDoc | null | undefined): boolean {
  const blocks = doc?.content ?? [];
  return (
    blocks.length === 0 ||
    (blocks.length === 1 && blocks[0].type === 'paragraph' && !blocks[0].content?.length)
  );
}

export interface BodyUpdate {
  content: TiptapDoc;
  /** What the editor store holds (the last loaded / saved body). */
  stored: TiptapDoc | null | undefined;
  /** The editor has focus: this update comes from the user's own input. */
  focused: boolean;
  /** The user has worked in the body since the note opened. */
  touched: boolean;
}

/**
 * The 「笔记打开为空」 guards (same rules as the web editor page): updates before the user touched the body are the
 * editor normalizing what it loaded and are not saved; an empty editor never overwrites an empty note; and nothing
 * but the user's own input may empty a stored body (a failed load, a programmatic reset).
 */
export function shouldSaveBody({ content, stored, focused, touched }: BodyUpdate): boolean {
  if (isEmptyDoc(content) && isEmptyDoc(stored)) return false;
  if (!touched && !focused) return false;
  if (!hasBody(content) && hasBody(stored) && !focused) return false;
  return true;
}
