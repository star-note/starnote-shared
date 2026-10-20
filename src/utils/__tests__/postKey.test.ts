import { postKey, publicPostPath, shareUrl } from '../postKey';

describe('postKey / shareUrl', () => {
  it('prefers the short id and falls back to the slug', () => {
    expect(postKey({ slug: 'hello', short_id: 'x1' })).toBe('x1');
    expect(postKey({ slug: 'hello' })).toBe('hello');
    expect(publicPostPath({ blog_handle: 'bob', slug: 'hello', short_id: null })).toBe(
      '/@bob/hello',
    );
  });

  it('copies the API share_url, else builds ?pwd= for a password post (contract r3 §B)', () => {
    expect(shareUrl({ url: 'https://s/@b/x', share_url: 'https://s/@b/x?pwd=k' })).toBe(
      'https://s/@b/x?pwd=k',
    );
    expect(shareUrl({ url: 'https://s/@b/x', visibility: 'password', access_code: 'ab12' })).toBe(
      'https://s/@b/x?pwd=ab12',
    );
    expect(shareUrl({ url: 'https://s/@b/x?ref=1', visibility: 'link', access_code: 'ab12' })).toBe(
      'https://s/@b/x?ref=1&pwd=ab12',
    );
    expect(shareUrl({ url: 'https://s/@b/x', visibility: 'public', access_code: 'ab12' })).toBe(
      'https://s/@b/x',
    );
    expect(shareUrl({ url: 'https://s/@b/x', visibility: 'password' })).toBe('https://s/@b/x');
  });
});
