import { OFFICIAL_STYLES } from './official';
import { isOfficialStyleId, isSkinId, type SkinId, type Style } from './types';
import { notesApi } from '../api/notes';
import { templatesApi, type TemplateLayout, type TemplateSummary } from '../api/templates';
import type { NoteDetail, TiptapDoc } from '../api/types';

/** A 我的风格 / 群组风格 row (`templates`, with `skin`) as a style. */
export function styleFromTemplate(t: TemplateSummary & { skin?: string | null }): Style {
  return {
    id: t.id,
    name: t.title,
    description: t.description,
    skin: isSkinId(t.skin) ? t.skin : null,
    layout: t.layout ?? {},
    source: t.owner_type === 'group' ? 'group' : 'mine',
    ownerName: t.owner_name ?? null,
    canEdit: Boolean(t.can_edit) && t.owner_type !== 'official',
  };
}

export const stylesApi = {
  /** 我的风格 (personal templates, newest first). */
  mine: async (): Promise<Style[]> => (await templatesApi.list('mine')).items.map(styleFromTemplate),
  /** The styles of every group I am in. */
  groups: async (): Promise<Style[]> => (await templatesApi.list('group')).items.map(styleFromTemplate),
  /** 「另存为我的风格」: the note's content and looks plus the skin it wears right now. */
  save: async (body: {
    scope: 'mine' | `group:${string}`;
    title: string;
    description?: string;
    content: TiptapDoc;
    layout: TemplateLayout;
    skin: SkinId | null;
  }): Promise<Style> => styleFromTemplate(await templatesApi.create(body)),
  rename: (id: string, title: string) => templatesApi.update(id, { title }),
  remove: (id: string) => templatesApi.remove(id),
  /** The note's style (its skin comes back as `theme`, kept by the server). */
  setNoteStyle: (noteId: string, styleId: string | null) => notesApi.meta(noteId, { style_id: styleId }),
};

/** The style a note wears, from the official set or the given 我的 / 群组 lists; `null` = none picked. */
export function findStyle(id: string | null | undefined, own: Style[] = []): Style | null {
  if (!id) return null;
  if (isOfficialStyleId(id)) return OFFICIAL_STYLES[id];
  return own.find((s) => s.id === id) ?? null;
}

/** The skin a note renders with: the server keeps `theme` equal to the style's skin. */
export function noteSkin(note: Pick<NoteDetail, 'theme'> | null | undefined): SkinId | null {
  return isSkinId(note?.theme) ? note.theme : null;
}

export function styleName(style: Style | null | undefined): string {
  return style?.name ?? '未选风格';
}
