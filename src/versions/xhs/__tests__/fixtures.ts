import type { TiptapDoc, TiptapNode } from '../../../api/types';

export const t = (text: string, bold = false): TiptapNode =>
  bold ? { type: 'text', text, marks: [{ type: 'bold' }] } : { type: 'text', text };
export const p = (...parts: (string | TiptapNode)[]): TiptapNode => ({
  type: 'paragraph',
  content: parts.map((x) => (typeof x === 'string' ? t(x) : x)),
});
export const h = (level: number, text: string): TiptapNode => ({ type: 'heading', attrs: { level }, content: [t(text)] });
export const ul = (...items: string[]): TiptapNode => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
});
export const quote = (text: string): TiptapNode => ({ type: 'blockquote', content: [p(text)] });
export const img = (src: string): TiptapNode => ({ type: 'image', attrs: { src, alt: '' } });
export const doc = (...content: TiptapNode[]): TiptapDoc => ({ type: 'doc', content });

/** A realistic 小红书-able article: intro, four h2 sections with lists, a quote, bold lines, a 总结. */
export const ARTICLE = doc(
  p('早起这件事我坚持了三年，从一开始的痛苦到现在的享受，中间踩过很多坑。今天把我的早起方法完整分享出来，希望对想早起的你有帮助。'),
  h(2, '为什么要早起'),
  p('早上的时间是一天里最完整的时间，没有消息打扰，也没有临时会议。我用早起的两个小时读书、写作和运动，一年下来读了五十本书。'),
  p(t('早起不是目的，掌控自己的时间才是。', true), '这是我最大的体会。'),
  h(2, '早起的五个方法'),
  p('下面这几个方法是我反复试过、真正有效的：'),
  ul('前一晚十一点前睡觉', '闹钟放在离床远的地方', '起床先喝一杯温水', '给早晨安排一件期待的事', '周末也保持同样的作息', '记录每天的起床时间'),
  h(2, '常见的误区'),
  p('很多人一上来就把闹钟调早两个小时，结果坚持不了三天。正确的做法是每周提前十五分钟，让身体慢慢适应。'),
  quote('自律的本质，是让好习惯变得不费力。'),
  h(2, '我的早晨时间表'),
  p('五点半起床，六点前完成洗漱和拉伸，六点到七点读书，七点到七点半写作，然后吃早餐出门。'),
  h(2, '总结'),
  p('早起是一个慢慢养成的习惯，不要急。先从早睡开始，每周进步一点点，三个月后你会感谢现在的自己！'),
);
