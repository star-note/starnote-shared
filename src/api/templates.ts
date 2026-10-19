import { api } from './client';
import type { TiptapDoc, TiptapNode } from './types';

export type TemplateScope = 'official' | 'mine' | 'group' | `group:${string}`;

/** How a template dresses a note: the looks 「套用版式」 maps existing blocks onto. */
export interface TemplateLayout {
  h2?: string;
  h3?: string;
  quote?: string;
  divider?: string;
  callout?: { variant: string; label?: string };
  /** Blocks appended at the end (关注引导 + materials). */
  ending?: TiptapNode[];
}

export interface TemplateSummary {
  id: string;
  owner_type: 'official' | 'user' | 'group';
  owner_id?: string | null;
  owner_name?: string | null;
  key?: string | null;
  title: string;
  description: string;
  thumbnail?: string | null;
  layout: TemplateLayout;
  /** CONTRACTS-r9 §7: the skin (article theme id) this 风格 carries; `null` = plain. */
  skin?: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  content: TiptapDoc;
}

export const templatesApi = {
  list: (scope: TemplateScope) =>
    api.get<{ items: TemplateSummary[] }>('/templates', { params: { scope } }),
  get: (id: string) => api.get<TemplateDetail>(`/templates/${id}`),
  create: (body: {
    scope: 'mine' | `group:${string}`;
    title: string;
    description?: string;
    content: TiptapDoc;
    layout?: TemplateLayout;
    skin?: string | null;
    thumbnail?: string | null;
  }) => api.post<TemplateDetail>('/templates', body),
  update: (
    id: string,
    body: Partial<
      Pick<TemplateDetail, 'title' | 'description' | 'content' | 'layout' | 'skin' | 'thumbnail'>
    >,
  ) => api.patch<TemplateDetail>(`/templates/${id}`, body),
  remove: (id: string) => api.delete<null>(`/templates/${id}`),
};
