export interface Envelope<T> {
  code: number;
  data: T;
  message: string;
}

export interface ApiError {
  code: number;
  message: string;
  data?: unknown;
  status?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  plan: 'free' | 'pro';
  created_at: string;
  /** Set when the handle was last changed; a second change needs 30 days (contract §E). */
  handle_changed_at?: string | null;
  /** Server switches (SPEC-r2-collaboration §3.6): real-time presence / Yjs co-editing of group notes. */
  features?: { collab: boolean; collab_yjs: boolean };
  /** Site admin (reviews 素材授权 etc.); every admin endpoint still checks on the server. */
  is_admin?: boolean;
  /** r9 发布偏好 (`PATCH /me/preferences`), the same on every client. */
  preferences?: UserPreferences;
  /** 「用我的发布反馈改进规则」(SPEC-r9-compliance-learning §5); default on. */
  learn_from_feedback?: boolean;
  /** SPEC-r10: 辰记 Pro until when (a paid order extends it); null = free or no expiry. */
  plan_expires_at?: string | null;
  /** SPEC-r10 §5 / §11: `cn` = only mainland AI models, `global` = overseas models allowed. */
  ai_region?: 'cn' | 'global';
  /** SPEC-r10 §7: the first-login guide was shown (or skipped); null = show it once. */
  onboarding_done_at?: string | null;
}

/** SPEC-r10 §6 / §11: outbound publishes this month vs the plan's limit (`GET /me/publish-quota`). */
export interface PublishQuota {
  period: string;
  used: number;
  limit: number;
  remaining: number;
  /** Pro: shown as 「不限」 (the limit is only a hard cap against abuse). */
  unlimited: boolean;
  plan: 'free' | 'pro';
}

/** `GET /me/plan` and `dashboard.plan` (SPEC-r10 §1.3): the plan in force and its limits. */
export interface PlanSummary {
  plan: 'free' | 'pro';
  label: string;
  expires_at: string | null;
  /** The account had Pro and it ran out. */
  expired: boolean;
  monthly_grant: number;
  publish_limit: number;
  publish_unlimited: boolean;
  storage_quota: number;
  /** 分: pro_month / pro_year / credits_500 / credits_2000. */
  prices: Record<string, number>;
  payment_provider: 'mock' | string;
}

export type OrderKind = 'pro_month' | 'pro_year' | 'credits_500' | 'credits_2000';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

/** `POST /me/orders`: an order plus how to pay it (`mock` = confirm in the app; later `qr` / `redirect`). */
export interface Order {
  id: string;
  kind: OrderKind;
  label: string;
  amount_cents: number;
  currency: string;
  provider: string;
  status: OrderStatus;
  provider_ref: string | null;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  checkout?: { kind: 'mock' | 'qr' | 'redirect'; payload: Record<string, unknown> };
  /** After a confirmation: the user with the plan now in force. */
  user?: User;
}

/** `GET /me/revenue` (SPEC-r10 §2.7 / §11; read-only in 阶段 A). */
export interface RevenueSummary {
  currency: string;
  balance_cents: number;
  pending_cents: number;
  paid_cents: number;
  by_source: { source: string; amount_cents: number }[];
  threshold_cents: number;
  payouts_per_month: number;
  hold_months: number;
  verified: boolean;
  verified_at: string | null;
  can_request: boolean;
  blockers: ('verify' | 'threshold' | 'monthly')[];
  ledger: { id: string; source: string; amount_cents: number; month: string; status: string; note: string; created_at: string }[];
  payouts: { id: string; amount_cents: number; month: string; status: string; created_at: string; paid_at: string | null }[];
}

/** `GET /me/prompts` (SPEC-r10 §7.4): guides the user closed, by key. */
export interface PromptState {
  dismissed: Record<string, string>;
  onboarding_done_at: string | null;
}

export interface UserPreferences {
  /** Platforms ticked 「常用显示」 in the publish panel (registry keys). */
  publish_platforms?: string[];
  /** 发布时自动翻译成英文，不再逐篇确认 (default off). */
  auto_translate_en?: boolean;
  /** r10 AI 发布偏好 (defaults: on, except where noted): 记住上次选的平台. */
  remember_platforms?: boolean;
  /** The platforms of the last confirmed AI publish (registry keys), read when `remember_platforms` is on. */
  last_platforms?: string[];
  /** AI 自动选分类. */
  ai_category?: boolean;
  /** AI 自动生成标签与摘要. */
  ai_tags_summary?: boolean;
  /** AI 自动生成封面 (the template cover generator, by title). */
  ai_cover?: boolean;
  /** 自动准备多版本 (图集 / 英文版 / 精简版). */
  auto_versions?: boolean;
  /** 方案默认折叠为一行摘要. */
  plan_collapsed?: boolean;
  /** The first-use preferences card was shown once (default off). */
  publish_intro_seen?: boolean;
  /** r10 辰记水印 on exported pictures (defaults: on, inset, with a QR code); a patch may send part of it. */
  watermark?: { enabled?: boolean; style?: 'inset' | 'frame'; qr?: boolean };
}

export interface AuthPayload {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  count?: number;
}

export interface PublishedChenji {
  publication_id: string;
  slug: string;
  url: string;
  /** `url?pwd=…` for a password post (contract r3 §B); what 分享 / 复制链接 should copy. */
  share_url?: string;
  access_code?: string | null;
  visibility: Visibility;
  state?: 'online' | 'offline';
  /** System (public taxonomy) category id; kept for records created before blog categories. */
  category_id?: string | null;
  /** The blogger's own category (contract r3 §A). */
  category?: BlogCategoryRef | null;
  show_in_blog?: boolean;
}

/**
 * Who can read a published post (SPEC-r6 §B): `public` is listed and indexed; `password` is
 * unlisted, noindex and needs the URL plus the 提取码. r2 `link` / `group` and r3 `private` were
 * migrated to `password` (never to public) and the API rejects them with 40001.
 */
export type Visibility = 'public' | 'password';

/** A blog category as it appears on a publication / public blog. */
export interface BlogCategoryRef {
  id: string;
  name: string;
  slug: string;
}

/** `GET /me/blog/categories` (contract r3 §A): the blogger's own 栏目. */
export interface BlogCategory extends BlogCategoryRef {
  order: number;
  hidden: boolean;
  count: number;
  /** Public-taxonomy mapping (AI / rule suggestion, editable by the owner). */
  system_category: { id: string; name: string } | null;
  /** Optional: `true` while the mapping is the automatic suggestion (shows the "AI 建议" tag). */
  system_category_auto?: boolean;
}

/** A public blog's category list item (`GET /blogs/{handle}.categories`). */
export interface BlogCategoryPublic extends BlogCategoryRef {
  count?: number;
}

export interface Note {
  id: string;
  title: string;
  parent_id: string | null;
  owner_type: 'user' | 'group';
  owner_id: string;
  pinned: boolean;
  has_children: boolean;
  sort_key: string;
  version: number;
  content?: TiptapDoc | null;
  word_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  tags: Tag[];
  published?: { chenji?: PublishedChenji } | null;
}

/** Compact user card used wherever a person is shown (members, activities, comments). */
export interface UserBrief {
  id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
}

/** Contract r4 §A: five levels, `owner > admin > approver > editor > viewer`. */
export type GroupRole = 'owner' | 'admin' | 'approver' | 'editor' | 'viewer';

export interface NoteCan {
  edit: boolean;
  delete: boolean;
  publish: boolean;
  comment: boolean;
  /** r4 §A: may submit this group note for publish approval (policy=approval, below approver). */
  request_publish?: boolean;
  /** r4 §A: may approve / reject publish requests on this note. */
  approve?: boolean;
}

/** r4 §A: the note's latest publish request, `null` when there is none. */
export interface NotePublishState {
  approval_id: string;
  status: ApprovalStatus;
  reason?: string | null;
  created_at: string;
  /** SPEC-r8-group-publisher, past review: who claimed it, per-platform results, the external platforms. */
  publisher_id?: string | null;
  results?: Record<string, PublishResultEntry>;
  external_platforms?: string[];
}

export interface NoteDetail extends Note {
  ancestors: { id: string; title: string }[];
  /** In my 收藏 (`POST /notes/{id}/favorite`). */
  favorited?: boolean;
  children_count: number;
  /** Contract B: present once the backend records authorship; absent on older payloads. */
  created_by?: UserBrief | null;
  updated_by?: UserBrief | null;
  viewers_count?: number;
  /** Activity bar counts at fetch time (absent on older servers → the bar asks the list endpoints instead):
   *  comment threads (= `GET /notes/{id}/comments` total) and stored revisions. */
  comments_count?: number;
  revisions_count?: number;
  /** Personal notes report `owner`; group notes the member's role. */
  my_role?: GroupRole | null;
  can?: NoteCan;
  /** r4 §A: present on group notes once the backend tracks publish requests. */
  publish_state?: NotePublishState | null;
  /** CONTRACTS-r9 §7: the note's 风格 (an official id or a 我的风格 / 群组风格 id); `theme` is its skin. */
  style_id?: string | null;
  /** CONTRACTS-r9 §2: the skin (`business` / `tech` / `warm` / `magazine` / `fresh`), null = plain. */
  theme?: string | null;
  /** CONTRACTS-r9 §5: AI wrote or rewrote part of this note (drives the 「AI 生成内容」 label). */
  ai_assisted?: boolean;
}

/** Contract B: one row of `GET /notes/{id}/activities`. */
export type ActivityKind =
  | 'created'
  | 'edited'
  | 'renamed'
  | 'moved'
  | 'restored'
  | 'trashed'
  | 'published'
  | 'unpublished'
  | 'tags'
  /** 2026-10-16: an offline publication record was deleted (`meta: {publication_id, short_id, title}`). */
  | 'publication_deleted';

export interface Activity {
  id: string;
  kind: ActivityKind | string;
  user: UserBrief;
  version: number;
  meta?: Record<string, unknown> | null;
  created_at: string;
}

export interface Revision {
  id: string;
  version: number;
  title: string;
  word_count: number;
  author: UserBrief;
  created_at: string;
}

export interface RevisionDetail extends Revision {
  content: TiptapDoc | null;
}

export interface NoteViewer {
  user: UserBrief;
  last_viewed_at: string;
  count: number;
}

/** Contract C: `CommentDict`. Top-level items may carry their first few `replies`. */
export interface Comment {
  id: string;
  parent_id: string | null;
  root_id: string | null;
  author: UserBrief;
  reply_to: UserBrief | null;
  html: string;
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted: boolean;
  replies_count: number;
  can: { edit: boolean; delete: boolean };
  replies?: Comment[];
}

export interface CommentsPage {
  items: Comment[];
  total: number;
  /** Only blog post comment lists carry the blog's policy. */
  policy?: CommentsPolicy;
  /** Blog post lists: may the viewer write here, and if not, why. */
  can_comment?: boolean;
  reason?: CommentGateReason | null;
}

export interface TiptapNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
}

export interface TiptapDoc extends TiptapNode {
  type: 'doc';
  content?: TiptapNode[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  order: number;
  count?: number;
  /** Two-level taxonomy (contract §D): second-level categories carry their parent's id. */
  parent_id?: string | null;
  icon?: string;
  description?: string;
  children?: Category[];
}

/** A first-level category with its children, as `GET /categories` returns it. */
export interface CategoryNode extends Category {
  children: Category[];
}

/** `GET /me/publications/categories`: categories I have posts in. */
export interface MyCategoryCount {
  id: string;
  name: string;
  count: number;
}

/** Cover sizes besides the 3:2 cover: `og` 1200×630, `wide` 900×383, `square` 1080², `portrait` 1080×1440. */
export type CoverVariantKey = 'og' | 'wide' | 'square' | 'portrait';
export type CoverVariantUrls = Partial<Record<CoverVariantKey, string>>;

export interface Publication {
  /** CONTRACTS-r9 §2: the note's 公众号风格主题 when it was published (`.post-body` gets `sn-theme sn-theme--{id}`). */
  theme?: string | null;
  /** r9 译文: languages the post also exists in (`/@handle/{short_id}/{lang}`). */
  translations?: string[];
  id: string;
  note_id: string;
  platform: 'chenji';
  blog_handle: string;
  slug: string;
  /** Short unique id used in the public URL (`/@handle/{short_id}`); slug is kept for old links. */
  short_id?: string;
  url: string;
  title: string;
  summary: string;
  cover_url: string | null;
  /** The cover at other sizes (URLs); a missing key means "use `cover_url`". */
  cover_variants?: CoverVariantUrls;
  /** Alt text of the cover (defaults to the title). */
  cover_alt?: string;
  /** The blogger's own category (contract r3 §A). */
  category: BlogCategoryRef | null;
  /** Public-taxonomy category derived from the blog category's mapping. */
  system_category?: { id: string; name: string; slug?: string } | null;
  visibility: Visibility;
  /** Author only: the 提取码 of a password post, and the share link that carries it. */
  access_code?: string | null;
  share_url?: string;
  state: 'online' | 'offline';
  reads: number;
  likes: number;
  comments: number;
  toc: TocItem[];
  html?: string;
  published_at: string;
  updated_at: string;
  version: number;
  pinned?: boolean;
  also_on?: { platform: string; url: string }[];
  tags?: { name: string }[] | string[];
  /** The group the note was published from (group blogs) and the member who wrote / submitted it. */
  group_id?: string | null;
  author?: UserBrief | null;
}

export interface TocItem {
  id: string;
  level: number;
  text: string;
}

export interface PublicationStats {
  posts: number;
  reads_total: number;
  reads_7d: number;
  reads_7d_delta_pct: number;
  followers: number;
  /** Contract r4 §C.2: optional counters and the per-day reads behind `reads_7d`. */
  reads_30d?: number;
  comments?: number;
  tips?: number;
  daily?: { day: string; reads: number }[];
}

export interface BlogLink {
  label: string;
  url: string;
}

export interface FollowCard {
  enabled: boolean;
  name?: string;
  qr_asset_hash?: string | null;
  qr_url?: string | null;
  text?: string;
}

export interface TipCard {
  enabled: boolean;
  wechat_qr_asset_hash?: string | null;
  alipay_qr_asset_hash?: string | null;
  wechat_qr_url?: string | null;
  alipay_qr_url?: string | null;
  links?: BlogLink[];
  button_text?: string;
}

export interface Blog {
  /** SPEC-r6 §A: a user's or a group's blog. */
  kind?: 'user' | 'group';
  group_id?: string | null;
  /** Management endpoints only: may I change this blog (group blogs: owner / admin). */
  can_manage?: boolean;
  /** Group blog management: the group and my role in it. */
  group?: { id: string; name: string; handle: string; role: GroupRole | null } | null;
  handle: string;
  title: string;
  bio: string;
  links: BlogLink[];
  /** @deprecated contract r3 §A: order / hidden now live on the blog categories themselves. */
  visible_categories?: string[];
  default_category: string | null;
  follow_card: FollowCard | null;
  tip_card: TipCard | null;
  ads: { enabled: boolean } | null;
  custom_domain: string | null;
  url: string;
  /** @deprecated SPEC-r6 §C: every blog is public; the API answers `"public"`. */
  access?: 'public';
  comments_policy?: CommentsPolicy;
  language?: BlogLanguage;
  theme?: BlogTheme;
  /** 「关于」页正文，段落以空行分隔。 */
  about?: string;
  /** 「联系」页条目。 */
  contact?: { label: string; value: string; url?: string | null }[];
  /** 作者自己的 GitHub Pages 博客（SPEC-r8-github-template §8），`""` = 没有。 */
  github_pages_url?: string;
}

/**
 * Who may comment on a blog's posts. Reading is public; writing always needs an account (no guest comments).
 * `login` 所有登录用户 · `follows` 仅关注我的人 · `members` 仅群组成员 (group blogs only) · `off` 关闭评论.
 */
export type CommentsPolicy = 'login' | 'follows' | 'members' | 'off';
/** Why the viewer cannot write: signed out, comments off, not a follower, not a group member. */
export type CommentGateReason = 'login' | 'off' | 'follows' | 'members';
export type BlogLanguage = 'zh-CN' | 'en' | 'ja';
export type BlogTheme = 'auto' | 'light' | 'dark';

export interface BlogPublic {
  blog: Blog;
  /** Present when `handle` is an old handle: the current one to redirect to (contract §E). */
  redirect_to?: string | null;
  owner: { name: string; avatar_url: string | null; kind?: 'user' | 'group'; handle?: string };
  /** SPEC-r6 §A: a group blog — its intro and the members who write for it. */
  group?: PublicGroupInfo | null;
  /** Blog categories in menu order, hidden ones filtered out (contract r3 §A). */
  categories: BlogCategoryPublic[];
  stats: { posts: number; reads: number; followers: number };
  is_following: boolean;
  tags?: Tag[];
  archives?: { month: string; count: number }[];
  hot?: { slug: string; short_id?: string; title: string; reads?: number }[];
}

export interface BlogPostDetail {
  publication: Publication & { html: string };
  prev: { slug: string; short_id?: string; title: string } | null;
  next: { slug: string; short_id?: string; title: string } | null;
  also_on: { platform: string; url: string }[];
  blog: {
    follow_card: FollowCard | null;
    tip_card: TipCard | null;
    title?: string;
    handle?: string;
  };
  /** The member who wrote the post (group blogs) or the blogger. */
  author?: { name: string; avatar_url: string | null; handle?: string };
  /** SPEC-r6 §A: set on group blog posts — the byline shows the author plus the group. */
  group?: { id: string; name: string; handle: string; avatar_url: string | null } | null;
  /** The post moved (an r4 group post now lives on its group's blog): the blog handle to go to. */
  redirect_to?: string | null;
}

export interface PublicGroupInfo {
  id: string;
  name: string;
  handle: string;
  description: string;
  avatar_url: string | null;
  members_count: number;
  members: (UserBrief & { role: GroupRole })[];
}

export interface FeedItem extends Omit<Publication, 'author'> {
  author: { name: string; handle: string; avatar_url: string | null };
  /** SPEC-r6 §A: a group blog post (author = the member who wrote it). */
  group?: { id: string; name: string; handle: string } | null;
  platforms?: string[];
}

export interface Asset {
  hash: string;
  url: string;
  size: number;
  mime: string;
  width?: number;
  height?: number;
}

export interface PresignResult {
  exists: boolean;
  asset: Asset;
  upload?: { method: 'PUT'; url: string; headers: Record<string, string> };
}

export interface SearchNoteHit {
  id: string;
  title: string;
  path: { id: string; title: string }[];
  snippet: string;
  updated_at?: string;
  word_count?: number;
  tags?: { id: string; name: string; color?: string }[];
  group?: { id: string; name: string } | null;
}
export interface SearchPostHit {
  handle: string;
  slug: string;
  short_id?: string;
  title: string;
  snippet: string;
  author: string | { name?: string; handle?: string } | null;
  url?: string;
  category?: { id: string; name: string; slug: string } | null;
  published_at?: string;
  reads?: number;
  cover_url?: string | null;
}
export interface SearchFacets {
  categories?: { id: string; name: string; slug?: string; count: number }[];
  tags?: { id: string; name: string; count: number }[];
  groups?: { id: string; name: string; count: number }[];
}
export interface SearchResult {
  notes: SearchNoteHit[];
  posts: SearchPostHit[];
  total?: number;
  facets?: SearchFacets;
  commands?: unknown[];
}
export interface SearchParams {
  q: string;
  scope: SearchScope;
  category_id?: string;
  tag?: string;
  group_id?: string;
  handle?: string;
  page?: number;
  page_size?: number;
}

export type SearchScope = 'mine' | 'group' | 'blog';

export interface Dashboard {
  notes: number;
  published: number;
  reads_total: number;
  followers: number;
  platforms: { key: string; label: string; state: 'connected' | 'desktop_required' | 'unbound' }[];
  todos: { type: string; count: number; text: string; link: string }[];
  storage: { used: number; quota: number };
  ai: { used: number; quota: number; balance?: number; activated?: boolean };
  /** SPEC-r10: outbound publishes this month and the plan in force (older APIs: missing). */
  publish?: PublishQuota;
  plan?: PlanSummary;
}

export type GroupVisibility = 'private' | 'public';
export type GroupJoinPolicy = 'invite' | 'approval' | 'open';
/**
 * r4 §A: `direct` — editor+ publish straight away; `approval` — below approver you submit a
 * request. Older payloads may still carry r2's `owner | admin | editor` (see `normalizePublishPolicy`).
 */
export type GroupPublishPolicy = 'direct' | 'approval';
/**
 * @deprecated SPEC-r6 §A: group notes always publish to the group's own blog; the API answers
 * `"group"` and ignores the field on input.
 */
export type GroupPublishTarget = 'group' | 'submitter' | 'owner';

/** r4 §A: what is waiting for *me* to review; `total` sums the three. */
export interface PendingCounts {
  publish: number;
  role: number;
  join: number;
  total: number;
}

/* ---- group approvals (r4 §A) ---- */

export type ApprovalKind = 'publish' | 'role' | 'join';
export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  /** SPEC-r8-group-publisher: reviewed, external platforms wait for a 发布员 (「待发布」). */
  | 'awaiting_publish'
  /** Claimed by a 发布员 (`publisher`). */
  | 'publishing'
  /** Every external platform went out. */
  | 'published'
  /** Some went out, some failed: claim again to retry. */
  | 'partially_published';

/** SPEC-r8-group-publisher §2: one platform of the publish plan stored on a publish request. */
export interface PublishPlanPlatform {
  key: string;
  name?: string | null;
  kind?: string | null;
  /** title / summary / tags / share_text / category_id / visibility … as chosen in the 发布 panel. */
  fields: Record<string, unknown>;
  adjustments?: string[];
}

export interface PublishPlanPayload {
  platforms: PublishPlanPlatform[];
  message?: string | null;
  source?: string | null;
}

/** Per-platform outcome written back by the 发布员. */
export interface PublishResultEntry {
  status: 'published' | 'failed';
  url?: string | null;
  error?: string;
  account?: string;
  at?: string;
  by?: string;
}

/** Request-specific fields; the server stores them as free JSON, so everything is optional. */
export interface ApprovalPayload {
  /** publish: the submitted form (same fields as `POST /notes/{id}/publish/chenji`). */
  title?: string;
  summary?: string;
  category?: { id?: string; name?: string } | string | null;
  category_name?: string;
  visibility?: Visibility | string;
  cover_url?: string | null;
  /** role: the role asked for; join: the role granted on approve. */
  role?: GroupRole | string;
  /** role / join: the requester's note to the reviewers. */
  message?: string;
  /** publish: the platforms + per-platform fields (SPEC-r8-group-publisher); absent = 辰记 only. */
  plan?: PublishPlanPayload;
  /** publish: the reviewer changed the plan / form before approving. */
  reviewer_edited?: boolean;
  [key: string]: unknown;
}

export interface Approval {
  id: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
  requester: UserBrief;
  note: { id: string; title: string } | null;
  payload: ApprovalPayload | null;
  reason: string | null;
  reviewer: UserBrief | null;
  created_at: string;
  decided_at: string | null;
  can_review: boolean;
  /** Frontend only: mapped from the r2 `/groups/{id}/requests` endpoint while `/approvals` is missing. */
  legacy?: boolean;
  /* ---- publish only (SPEC-r8-group-publisher) ---- */
  /** Every platform of the plan (`['chenji']` without a plan). */
  platforms?: string[];
  /** The plan's platforms besides 辰记: what the 发布员 publishes. */
  external_platforms?: string[];
  publisher?: UserBrief | null;
  claimed_at?: string | null;
  published_at?: string | null;
  results?: Record<string, PublishResultEntry>;
  can_claim?: boolean;
  can_report?: boolean;
  can_unclaim?: boolean;
  /** Queue listings (`/groups/{id}/publish-queue`, `/me/publish-queue`). */
  group?: { id: string; name: string } | null;
}

export type PublishQueueStatus = 'open' | 'all' | 'awaiting_publish' | 'publishing' | 'published' | 'partially_published';

export interface PublishQueuePage {
  items: Approval[];
  total: number;
  counts: Record<'awaiting_publish' | 'publishing' | 'published' | 'partially_published', number>;
  is_publisher?: boolean;
  has_publishers?: boolean;
  can_publish?: boolean;
}

export interface ApprovalsPage {
  items: Approval[];
  total: number;
  pending_counts: PendingCounts | null;
}

/** r4 §A: one row of `GET /me/activity` — what happened across my groups. */
export type MeActivityKind =
  | 'note_edited'
  | 'note_created'
  | 'publish_requested'
  | 'publish_approved'
  | 'publish_rejected'
  | 'member_joined'
  | 'role_changed'
  | 'join_requested'
  /** Trash of group notes (2026-10-16); `note.deleted` marks a note that is in the trash / gone. */
  | 'note_trashed'
  | 'note_restored'
  | 'note_purged'
  /** SPEC-r8-group-publisher: the 「待发布」 hand-off, from the approval's current state. */
  | 'publish_awaiting'
  | 'publish_claimed'
  | 'publish_published'
  | 'publish_partial';

export interface MeActivity {
  id: string;
  kind: MeActivityKind | string;
  group: { id: string; name: string; avatar_url?: string | null };
  actor: UserBrief;
  note?: { id: string; title: string } | null;
  approval_id?: string | null;
  /** The item is waiting for me (review, or — 发布员 — publishing). */
  needs_me: boolean;
  /** Why it waits for me: `review` (审批) or `publish` (待我发布). */
  needs?: 'review' | 'publish' | null;
  /** A step of my own request taken by someone else. */
  notify_me?: boolean;
  /** Hand-off kinds: the external platforms. */
  platforms?: string[];
  created_at: string;
  meta?: Record<string, unknown> | null;
}

export interface Group {
  id: string;
  name: string;
  slug: string;
  visibility: GroupVisibility | string;
  description?: string;
  join_policy?: GroupJoinPolicy;
  /** r4 §A; r2's `owner | admin | editor` may still arrive for one round. */
  publish_policy?: GroupPublishPolicy | string;
  /** @deprecated always `"group"` (SPEC-r6 §A). */
  publish_target?: GroupPublishTarget;
  /** SPEC-r6 §A: the group blog's handle (`/@handle`, shares the namespace with user handles). */
  handle?: string;
  handle_changed_at?: string | null;
  /** Absolute URL of the group blog. */
  blog_url?: string | null;
  avatar_url?: string | null;
  /** My role; `null` on discover results where I am not a member. */
  role?: GroupRole | null;
  notes_count?: number;
  members_count?: number;
  /** @deprecated r2: replaced by `pending_counts`; kept while the backend sends both. */
  pending_count?: number;
  /** r4 §A: waiting for me (admin/approver only; approvers see `publish` alone). */
  pending_counts?: PendingCounts | null;
  /** Discover results: whether I already asked to join. */
  my_request?: 'pending' | null;
  /* SPEC-r8-group-publisher */
  /** I am one of the group's 发布员. */
  is_publisher?: boolean;
  has_publishers?: boolean;
  /** I may claim / publish 「待发布」 items (发布员, or owner / admin of a group without one). */
  can_publish_queue?: boolean;
  /** Items waiting for a 发布员; only when I may see the queue. */
  publish_queue_count?: number;
  /** SPEC-r3 §E: the platform-run 「辰记官方」 group (read-only for members); use `isOfficialGroup`. */
  is_official?: boolean;
  created_at?: string;
}

/** `GET /groups/{id}`: the contract's `GroupDict`. */
export type GroupDetail = Group;

export interface GroupMember {
  user: UserBrief;
  role: GroupRole;
  /** SPEC-r8-group-publisher: 发布员 flag (independent of the role). */
  is_publisher?: boolean;
  joined_at: string;
}

export interface Invite {
  code: string;
  url: string;
  role: GroupRole;
  expires_at: string | null;
  max_uses?: number | null;
  uses?: number;
  created_at?: string;
}

export interface InviteInfo {
  group: {
    id: string;
    name: string;
    description?: string;
    members_count?: number;
    avatar_url?: string | null;
  };
  role: GroupRole;
  inviter: UserBrief;
  valid: boolean;
}

export interface JoinRequest {
  id: string;
  user: UserBrief;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface TagSuggest {
  matched: Tag[];
  recommended: (Tag | { name: string })[];
}

/* ---- Home overview (contract §G) ---- */

export interface OverviewPost {
  short_id: string;
  title: string;
  reads: number;
  published_at: string;
}

export interface OverviewGroup {
  id: string;
  name: string;
  avatar_url?: string | null;
  /** Edits by others in the last 7 days. */
  unread: number;
}

/** `GET /me/overview`; nullable fields are unknown when assembled from the fallback endpoints. */
export interface Overview {
  today: { words: number; notes_edited: number } | null;
  streak_days: number | null;
  recent_notes: Note[];
  pinned_notes: Note[];
  groups: OverviewGroup[];
  publications: { total: number; reads_7d: number | null; recent: OverviewPost[] };
  /** Notes never published (contract r4 §C.1); `drafts_count` is the r3 name, kept one round. */
  unpublished_count: number | null;
  /** @deprecated use `unpublished_count` */
  drafts_count?: number | null;
}

/* ---- Account handle (contract §E) ---- */

export interface HandleCheck {
  available: boolean;
  reason?: 'taken' | 'reserved' | 'invalid' | 'cooldown';
}

/** A row of `GET /notes/trash` (trash scopes, 2026-10-16). */
export interface TrashNote extends Note {
  group: { id: string; name: string } | null;
  /** Who moved it (or the ancestor it went with) to the trash; `null` for notes trashed before the field existed. */
  deleted_by: UserBrief | null;
  /** The original location: ancestors in the tree, root first. */
  path: { id: string; title: string }[];
  /** The parent is gone or still in the trash: restoring puts the note at the root of its tree. */
  restores_to_root: boolean;
  can: { restore: boolean; purge: boolean };
}

/** `personal` or `group:{id}`. */
export type TrashScopeKey = 'personal' | `group:${string}`;

/** A tab of the trash page (`GET /notes/trash/scopes`). */
export interface TrashScope {
  key: TrashScopeKey;
  type: 'personal' | 'group';
  group: { id: string; name: string } | null;
  role: GroupRole;
  count: number;
  can_restore: boolean;
  can_purge: boolean;
}

/** `data` of a 40901 when purging notes that still have online posts. */
export interface OnlinePublicationsConflict {
  publications: { id: string; platform: string; url: string; title: string; note_id?: string }[];
}
