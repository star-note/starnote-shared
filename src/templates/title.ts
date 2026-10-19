/** The title a note made from a template starts with: the template's name, without the 「模板示例 ·」 sample prefix. */
export function templateNoteTitle(name: string | null | undefined): string {
  return (name ?? '').replace(/^\s*模板示例\s*[·・:：-]\s*/, '').trim();
}
