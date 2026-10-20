/** Rule-based pre-publish checks (design §09 校验清单), shared by the web drawer and the phone flow. */
export interface ChecklistItem {
  ok: boolean;
  text: string;
}

export function buildChecklist(input: {
  title: string;
  titleMax?: number;
  toc: { level: number }[];
  images: string[];
  summary: string;
}): ChecklistItem[] {
  const max = input.titleMax ?? 120;
  const h2 = input.toc.filter((t) => t.level === 2).length;
  const h3 = input.toc.filter((t) => t.level === 3).length;
  return [
    {
      ok: input.title.trim().length > 0 && input.title.length <= max,
      text: input.title.trim()
        ? `标题 ${input.title.length} 字${input.title.length <= max ? '，在平台限制内' : `，超过 ${max} 字上限`}`
        : '标题为空，请填写标题',
    },
    {
      ok: true,
      text: input.toc.length
        ? `目录已从 ${h2} 个 H2 / ${h3} 个 H3 生成`
        : '正文没有 H2 / H3，文章页将不显示目录',
    },
    {
      ok: true,
      text: input.images.length ? `${input.images.length} 张图片已在库` : '正文没有图片',
    },
    {
      ok: input.summary.trim().length > 0,
      text: input.summary.trim() ? `摘要 ${input.summary.length} 字` : '摘要为空，将使用正文开头',
    },
  ];
}
