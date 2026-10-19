import { currentPath, loginPath, safeNext } from '../loginNext';

describe('safeNext', () => {
  it('keeps same-origin paths with their query', () => {
    expect(safeNext('/@demo/abc123')).toBe('/@demo/abc123');
    expect(safeNext('/search?q=x&scope=blog')).toBe('/search?q=x&scope=blog');
  });
  it('falls back for empty or missing values', () => {
    expect(safeNext(null)).toBe('/home');
    expect(safeNext('')).toBe('/home');
    expect(safeNext(undefined, '/x')).toBe('/x');
  });
  it('refuses anything that could leave the site', () => {
    expect(safeNext('https://evil.com')).toBe('/home');
    expect(safeNext('//evil.com/path')).toBe('/home');
    expect(safeNext('/\\evil.com')).toBe('/home');
    expect(safeNext('javascript:alert(1)')).toBe('/home');
    expect(safeNext('/ok\nbad')).toBe('/home');
  });
  it('never bounces back onto the auth pages', () => {
    expect(safeNext('/login')).toBe('/home');
    expect(safeNext('/login?next=%2Fhome')).toBe('/home');
    expect(safeNext('/register/')).toBe('/home');
    expect(safeNext('/loginx')).toBe('/loginx');
  });
});

describe('loginPath', () => {
  it('encodes the destination into the next query', () => {
    expect(loginPath('/@demo/post?x=1')).toBe('/login?next=%2F%40demo%2Fpost%3Fx%3D1');
    expect(loginPath('/@demo', 'register')).toBe('/register?next=%2F%40demo');
  });
  it('drops an unsafe destination instead of carrying it', () => {
    expect(loginPath('https://evil.com')).toBe('/login');
  });
});

describe('currentPath', () => {
  it('joins pathname and search', () => {
    expect(currentPath({ pathname: '/@demo/c/tech', search: '?page=2' })).toBe(
      '/@demo/c/tech?page=2',
    );
    expect(currentPath({ pathname: '/@demo' })).toBe('/@demo');
  });
});
