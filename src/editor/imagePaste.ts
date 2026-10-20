import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';

/**
 * The SparkWrite `Image` extension only uploads through its own dialog; pasting
 * or dropping picture files onto the document is the host's job. These helpers
 * plug the §9 upload pipeline into ProseMirror's paste/drop hooks.
 */

export function imageFilesFrom(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return [];
  const out: File[] = [];
  const files = dt.files ? Array.from(dt.files) : [];
  for (const f of files) if (f.type.startsWith('image/')) out.push(f);
  if (out.length === 0 && dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

/** Rich clipboards (Word, browsers) carry HTML plus a preview bitmap; the HTML wins. */
export function shouldHandleAsImages(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  const html = dt.getData('text/html');
  return imageFilesFrom(dt).length > 0 && !html;
}

export interface ImageInsertDeps {
  upload(file: File): Promise<string>;
  onError?(message: string): void;
  /** Lets the SDK's lifecycle storage know about the upload so orphans can be found later. */
  remember?(editor: Editor, src: string): void;
}

/** Uploads every file in order and inserts a block image for each at `pos` (or the selection). */
export async function insertImageFiles(
  editor: Editor,
  files: File[],
  deps: ImageInsertDeps,
  pos?: number,
) {
  let at = pos;
  for (const file of files) {
    try {
      const src = await deps.upload(file);
      deps.remember?.(editor, src);
      let chain = editor.chain().focus();
      if (typeof at === 'number') chain = chain.setTextSelection(at);
      chain.setImageBlock({ src, alt: file.name.replace(/\.[a-z0-9]+$/i, '') }).run();
      // Next picture goes right after the one we just inserted.
      at = editor.state.selection.to;
    } catch (e) {
      deps.onError?.(e instanceof Error ? e.message : '图片上传失败');
    }
  }
}

export function makeImageEditorProps(getEditor: () => Editor | null, deps: ImageInsertDeps) {
  return {
    handlePaste(_view: EditorView, event: ClipboardEvent) {
      const dt = event.clipboardData;
      if (!shouldHandleAsImages(dt)) return false;
      const editor = getEditor();
      if (!editor) return false;
      event.preventDefault();
      void insertImageFiles(editor, imageFilesFrom(dt), deps);
      return true;
    },
    handleDrop(view: EditorView, event: DragEvent, _slice: unknown, moved: boolean) {
      if (moved) return false;
      const dt = event.dataTransfer;
      const files = imageFilesFrom(dt);
      if (files.length === 0) return false;
      const editor = getEditor();
      if (!editor) return false;
      event.preventDefault();
      const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
      void insertImageFiles(editor, files, deps, hit?.pos);
      return true;
    },
  };
}
