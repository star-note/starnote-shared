import { api } from './client';
import { SOFT } from './soft';
import type {
  Blog,
  BlogLanguage,
  BlogPostDetail,
  BlogPublic,
  BlogTheme,
  Comment,
  CommentsPage,
  CommentsPolicy,
  FeedItem,
  Paged,
  Publication,
  TiptapDoc,
} from './types';

export interface BlogPatch {
  title?: string;
  bio?: string;
  links?: { label: string; url: string }[];
  /** @deprecated contract r3 §A; the server keeps the column but ignores it. */
  visible_categories?: string[];
  default_category?: string | null;
  follow_card?: { enabled: boolean; name?: string; qr_asset_hash?: string | null; text?: string };
  tip_card?: {
    enabled: boolean;
    wechat_qr_asset_hash?: string | null;
    alipay_qr_asset_hash?: string | null;
    links?: { label: string; url: string }[];
    button_text?: string;
  };
  ads?: { enabled: boolean };
  about?: string;
  contact?: { label: string; value: string; url?: string | null }[];
  /** @deprecated SPEC-r6 §C: only `"public"` is accepted (40001 otherwise). */
  access?: 'public';
  comments_policy?: CommentsPolicy;
  language?: BlogLanguage;
  theme?: BlogTheme;
  /** SPEC-r8-github-template §8: the author's GitHub Pages blog (`https://` only, `""` clears it). */
  github_pages_url?: string;
}

/** Visitor-facing reads: never trigger a token refresh / logout for an anonymous reader. */
const VISITOR = { skipAuthRetry: true } as const;

export const blogsApi = {
  get: (handle: string) => api.get<BlogPublic>(`/blogs/${handle}`),
  posts: (
    handle: string,
    params: { category?: string; q?: string; page?: number; page_size?: number },
  ) => api.get<Paged<Publication>>(`/blogs/${handle}/posts`, { params, ...VISITOR }),
  /** `pwd` is the 提取码 of a password post (contract r3 §B); a wrong / missing one answers 40301. */
  post: (handle: string, slug: string, pwd?: string) =>
    api.get<BlogPostDetail>(`/blogs/${handle}/posts/${slug}`, {
      ...VISITOR,
      params: pwd ? { pwd } : undefined,
    }),
  view: (handle: string, slug: string) => api.post<unknown>(`/blogs/${handle}/posts/${slug}/view`),
  /** Contract §C: public read; the response always carries the blog's `policy`. */
  postComments: (handle: string, key: string, page = 1, pageSize = 20) =>
    api.get<CommentsPage>(`/blogs/${handle}/posts/${key}/comments`, {
      ...SOFT,
      params: { page, page_size: pageSize },
    }),
  createPostComment: (handle: string, key: string, content: TiptapDoc, parentId?: string | null) =>
    api.post<Comment>(
      `/blogs/${handle}/posts/${key}/comments`,
      parentId ? { content, parent_id: parentId } : { content },
    ),
  follow: (handle: string) => api.post<unknown>(`/blogs/${handle}/follow`),
  unfollow: (handle: string) => api.delete<unknown>(`/blogs/${handle}/follow`),
  search: (q: string, page = 1) =>
    api.get<Paged<Publication & { author?: string }>>('/blog/search', { params: { q, page } }),
  feed: (params: { category?: string; page?: number; page_size?: number }) =>
    api.get<Paged<FeedItem>>('/feed', { params }),
  mine: () => api.get<Blog>('/me/blog'),
  updateMine: (body: BlogPatch) => api.patch<Blog>('/me/blog', body),
};
