import { docSections } from '../../keywords';
import { infoCard, pickQuote, quoteCard } from '../inline';
import { doc, h, p, quote, t, ul } from './fixtures';

const id = () => 'x';

describe('inline cards for 配图建议', () => {
  const d = doc(
    h(2, '方法'),
    p('下面几条都试过。'),
    ul('早睡', '远离手机', '喝温水'),
    h(2, '误区'),
    p('一上来就调早两小时。', t('坚持比强度更重要。', true), '慢慢来。'),
    h(2, '感悟'),
    p('有人问我怎么坚持。'),
    quote('自律的本质，是让好习惯变得不费力。'),
    h(2, '时间表'),
    p('五点半起床。六点读书。七点写作。七点半吃早餐出门。'),
  );
  const s = docSections(d);

  it('信息图卡 uses the list, else short sentences, else a section card', () => {
    expect(infoCard(d, s[0]!, 'cream', id)).toMatchObject({ kind: 'points', title: '方法', items: ['早睡', '远离手机', '喝温水'] });
    expect(infoCard(d, s[3]!, 'mono', id)).toMatchObject({ kind: 'points', template: 'mono', title: '时间表' });
    expect(infoCard(d, s[2]!, 'cream', id)).toMatchObject({ kind: 'section', title: '感悟' });
  });

  it('金句卡 prefers a block quote, then bold text, then a punchy line', () => {
    expect(pickQuote(d, s[2]!)).toBe('自律的本质，是让好习惯变得不费力。');
    expect(pickQuote(d, s[1]!)).toBe('坚持比强度更重要。');
    expect(quoteCard(d, s[2]!, 'gradient', id)).toMatchObject({ kind: 'quote', title: '感悟', template: 'gradient' });
  });
});
