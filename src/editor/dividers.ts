/**
 * 辰记's divider picker: 16 looks for 公众号-style articles, in menu order. All but `chenji` come from the editor
 * SDK (built-ins + ornaments); `chenji` (the brand mark) is styled in the apps' `blocks-chenji.css` and drawn by
 * the WeChat serializer.
 */
export const SN_DIVIDER_VARIANTS: { value: string; label?: string }[] = [
  { value: 'fade' },
  { value: 'gradient' },
  { value: 'dotted' },
  { value: 'double' },
  { value: 'bar' },
  { value: 'diamond' },
  { value: 'trio' },
  { value: 'dots' },
  { value: 'wave' },
  { value: 'starsea' },
  { value: 'leaf' },
  { value: 'pen' },
  { value: 'ribbon' },
  { value: 'ink' },
  { value: 'chenji', label: '辰记' },
  { value: 'end' },
];
