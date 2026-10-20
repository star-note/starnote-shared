import { blogDisplayHost, blogUrl, configureSiteOrigin } from '../format';

describe('blog links', () => {
  afterEach(() => configureSiteOrigin(null));

  it('point at the current origin by default (the web app serves the blogs)', () => {
    expect(blogUrl('demo', 'hello')).toBe(`${window.location.origin}/@demo/hello`);
    expect(blogDisplayHost()).toBe(window.location.host);
  });

  it('point at the main site from the phone app', () => {
    configureSiteOrigin('https://starnote.app/');
    expect(blogUrl('demo')).toBe('https://starnote.app/@demo');
    expect(blogDisplayHost()).toBe('starnote.app');
  });
});
