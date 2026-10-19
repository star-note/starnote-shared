import { platformMeta } from '@starnote/publish-core';

import type { CoverVariantKey } from './types';

/** Platforms the publish preview can show; only 辰记 is published to today, the rest preview the look. */
export type PreviewPlatform =
  'chenji' | 'wechat' | 'xiaohongshu' | 'zhihu' | 'juejin' | 'medium' | 'github' | 'yuque';
export type Device = 'mobile' | 'pc';

/** Device viewports the article is laid out at before scaling: a 375px phone and a 1280px laptop window. */
export const VIEWPORT: Record<Device, { w: number; h: number }> = {
  mobile: { w: 375, h: 812 },
  pc: { w: 1280, h: 800 },
};

export interface PreviewPlatformMeta {
  key: PreviewPlatform;
  label: string;
  short: string;
  color: string;
  /** Where most readers meet the article: app-first platforms on a phone, blogs / docs on a computer. */
  device: Device;
  /** Shown in the browser frame's address bar and on link cards. */
  domain: string;
}

const META: Record<
  PreviewPlatform,
  Omit<PreviewPlatformMeta, 'key' | 'label' | 'short' | 'color'>
> = {
  chenji: { device: 'pc', domain: '' },
  wechat: { device: 'mobile', domain: 'mp.weixin.qq.com' },
  xiaohongshu: { device: 'mobile', domain: 'xiaohongshu.com' },
  zhihu: { device: 'mobile', domain: 'zhuanlan.zhihu.com' },
  juejin: { device: 'pc', domain: 'juejin.cn' },
  medium: { device: 'pc', domain: 'medium.com' },
  github: { device: 'pc', domain: 'github.io' },
  yuque: { device: 'pc', domain: 'yuque.com' },
};

/** Names and brand colours of the previewed platforms (the 辰记 chip reads 辰记博客). */
const BRAND: Record<PreviewPlatform, { label: string; short: string; color: string }> = {
  chenji: { label: '辰记博客', short: '辰', color: '#6918b4' },
  wechat: { label: '微信公众号', short: '微', color: '#07c160' },
  xiaohongshu: { label: '小红书', short: '红', color: '#ff2442' },
  zhihu: { label: '知乎', short: '知', color: '#0084ff' },
  juejin: { label: '掘金', short: '掘', color: '#1e80ff' },
  medium: { label: 'Medium', short: 'M', color: '#000' },
  github: { label: 'GitHub Pages', short: 'G', color: '#24292f' },
  yuque: { label: '语雀', short: '雀', color: '#31cc79' },
};

export const PREVIEW_ORDER: PreviewPlatform[] = [
  'chenji',
  'wechat',
  'xiaohongshu',
  'zhihu',
  'juejin',
  'medium',
  'github',
  'yuque',
];

export function previewPlatform(key: PreviewPlatform): PreviewPlatformMeta {
  return { key, ...BRAND[key], ...META[key] };
}

/** The SDK registry key of a preview platform. */
export function registryKey(key: PreviewPlatform): string {
  return key === 'github' ? 'github-pages' : key;
}

/**
 * The device a platform's article page is previewed on by default: a 375px phone for the registry's
 * `mobileFirst` platforms (公众号、小红书、知乎…), otherwise the platform's usual device.
 */
export function defaultDevice(key: PreviewPlatform): Device {
  return platformMeta(registryKey(key))?.mobileFirst ? 'mobile' : META[key].device;
}

/** Share / feed cards: how a link to the article or the post itself shows up away from the article page. */
export type ShareCardKind =
  | 'chenji-link'
  | 'wechat-chat'
  | 'wechat-moments'
  | 'mp-lead'
  | 'mp-sub'
  | 'x-card'
  | 'xhs-note'
  | 'link';

export const SHARE_CARD_META: Record<
  ShareCardKind,
  { title: string; hint: string; variant: CoverVariantKey | 'card' }
> = {
  'chenji-link': { title: '辰记博客链接', hint: '博客首页、站内推荐和通用链接预览', variant: 'og' },
  'wechat-chat': { title: '微信聊天卡片', hint: '把链接发给好友或群聊', variant: 'square' },
  'wechat-moments': { title: '朋友圈', hint: '分享到朋友圈', variant: 'square' },
  'mp-lead': { title: '公众号头条', hint: '公众号消息里的第一篇', variant: 'wide' },
  'mp-sub': { title: '公众号次条', hint: '公众号消息里的第二篇及之后', variant: 'square' },
  'x-card': { title: 'X / Twitter 大图卡片', hint: 'summary_large_image', variant: 'og' },
  'xhs-note': { title: '小红书笔记卡', hint: '发现页双列信息流', variant: 'portrait' },
  link: { title: '通用链接预览', hint: 'Slack、Telegram、iMessage 等', variant: 'og' },
};

const CARDS: Record<PreviewPlatform, ShareCardKind[]> = {
  chenji: ['wechat-chat', 'wechat-moments', 'x-card'],
  wechat: ['mp-lead', 'mp-sub', 'wechat-chat', 'wechat-moments'],
  xiaohongshu: ['xhs-note'],
  zhihu: ['link', 'wechat-chat'],
  juejin: ['link'],
  medium: ['x-card', 'link'],
  github: ['x-card', 'link'],
  yuque: ['link'],
};

/** The cards that matter for the chosen platforms, in a stable order; the 辰记 link card is always first. */
export function shareCardsFor(platforms: PreviewPlatform[]): ShareCardKind[] {
  const want = new Set<ShareCardKind>(['chenji-link']);
  platforms.forEach((p) => CARDS[p]?.forEach((c) => want.add(c)));
  const order = Object.keys(SHARE_CARD_META) as ShareCardKind[];
  return order.filter((k) => want.has(k));
}

/** What each platform receives and what of the editor's rendering it cannot keep (shown under its preview). */
export const PLATFORM_FORMAT: Record<PreviewPlatform, { format: string; losses: string[] }> = {
  chenji: { format: '编辑器渲染（与编辑器一致）', losses: [] },
  wechat: {
    format: '内联样式 HTML',
    losses: [
      '代码无行号',
      '公式显示为 TeX 源码',
      '折叠块总是展开',
      '嵌入视频只保留链接',
      '分栏改为上下排列',
    ],
  },
  xiaohongshu: { format: '纯文本 + 图片', losses: ['所有格式（代码、表格、样式块）只保留文字'] },
  zhihu: {
    format: 'Markdown 导入',
    losses: [
      '代码高亮由知乎重新着色，无行号',
      '合并单元格的表格按 HTML 表格导入，可能被拆开',
      '图片宽度、对齐与图注样式',
      '文字颜色、高亮、样式块',
    ],
  },
  juejin: {
    format: 'Markdown（GFM）',
    losses: [
      '代码由掘金主题着色，无行号',
      '合并单元格的表格以 HTML 表格保留',
      '图片对齐（宽度以 <img width> 保留）',
      '文字颜色、样式块、分割线样式',
    ],
  },
  medium: {
    format: 'HTML 粘贴',
    losses: [
      '不支持表格（变为文字）',
      '代码无高亮、无语言标签',
      '图片宽度与对齐',
      '文字颜色、高亮、样式块、公式',
    ],
  },
  github: {
    format: 'Markdown（GFM）',
    losses: [
      '代码由站点主题着色，无行号',
      '合并单元格的表格以 HTML 表格保留',
      '文字颜色、高亮、样式块、分割线样式',
      '公式需站点启用 MathJax',
    ],
  },
  yuque: {
    format: 'Markdown 导入',
    losses: ['代码由语雀重新着色', '合并单元格、列宽', '图片对齐与图注样式', '文字颜色、样式块'],
  },
};
