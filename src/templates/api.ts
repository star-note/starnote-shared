import { isOfficialLookId, isSkinId, isTemplateKind, type NoteTemplate, type SkinId } from './model';
import { OFFICIAL_LOOKS } from './official';
import { notesApi } from '../api/notes';
import { templatesApi, type TemplateLayout, type TemplateSummary } from '../api/templates';
import type { NoteDetail, TiptapDoc } from '../api/types';

/** A `templates` row (official / 我的 / 群组) as a template of the library. */
export function templateFromSummary(t: TemplateSummary): NoteTemplate {
  return {
    id: t.id,
    name: t.title,
    description: t.description,
    skin: isSkinId(t.skin) ? t.skin : null,
    layout: t.layout ?? {},
    kind: isTemplateKind(t.kind) ? t.kind : 'content',
    purpose: t.purpose ?? null,
    thumbnail: t.thumbnail ?? null,
    source: t.owner_type === 'official' ? 'official' : t.owner_type === 'group' ? 'group' : 'mine',
    ownerId: t.owner_id ?? null,
    ownerName: t.owner_name ?? null,
    canEdit: Boolean(t.can_edit) && t.owner_type !== 'official',
  };
}

export interface SaveTemplateBody {
  scope: 'mine' | `group:${string}`;
  title: string;
  description?: string;
  /** The note's document; kept as example content when `kind` is `content`, dropped by the server for `look`. */
  content: TiptapDoc;
  layout: TemplateLayout;
  skin: SkinId | null;
  /** 「连同内容作为示例」 → `content`; otherwise `look` (只换外观). */
  kind?: 'content' | 'look';
}

export const noteTemplatesApi = {
  /** The official fourteen: eight content templates and the six looks, in the server's order. */
  official: async (): Promise<NoteTemplate[]> =>
    (await templatesApi.list('official')).items.map(templateFromSummary),
  /** 我的模板 (newest first). */
  mine: async (): Promise<NoteTemplate[]> => (await templatesApi.list('mine')).items.map(templateFromSummary),
  /** The templates of every group I am in (or of one group). */
  groups: async (groupId?: string): Promise<NoteTemplate[]> =>
    (await templatesApi.list(groupId ? `group:${groupId}` : 'group')).items.map(templateFromSummary),
  /** 「把当前文章存为模板」: the note's looks (+ its content as the example when asked) and the skin it wears. */
  save: async (body: SaveTemplateBody): Promise<NoteTemplate> =>
    templateFromSummary(await templatesApi.create({ ...body, kind: body.kind ?? 'content' })),
  rename: (id: string, title: string) => templatesApi.update(id, { title }),
  remove: (id: string) => templatesApi.remove(id),
  /** The note's template (its skin comes back as `theme`, kept by the server). */
  setNoteTemplate: (noteId: string, templateId: string | null) => notesApi.meta(noteId, { style_id: templateId }),
};

/**
 * The template a note wears, from the official looks or the given lists (official content / 我的 / 群组);
 * `null` = none picked.
 */
export function findTemplate(id: string | null | undefined, lists: NoteTemplate[] = []): NoteTemplate | null {
  if (!id) return null;
  if (isOfficialLookId(id)) return OFFICIAL_LOOKS[id];
  return lists.find((s) => s.id === id) ?? null;
}

/** The skin a note renders with: the server keeps `theme` equal to the template's skin. */
export function noteSkin(note: Pick<NoteDetail, 'theme'> | null | undefined): SkinId | null {
  return isSkinId(note?.theme) ? note.theme : null;
}

export function templateName(template: NoteTemplate | null | undefined): string {
  return template?.name ?? '未选模板';
}

/** r9 names, kept one round. */
export const styleFromTemplate = templateFromSummary;
export const stylesApi = {
  mine: noteTemplatesApi.mine,
  groups: () => noteTemplatesApi.groups(),
  save: noteTemplatesApi.save,
  rename: noteTemplatesApi.rename,
  remove: noteTemplatesApi.remove,
  setNoteStyle: noteTemplatesApi.setNoteTemplate,
};
export const findStyle = findTemplate;
export const styleName = templateName;
