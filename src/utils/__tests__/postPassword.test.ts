import {
  initialPwd,
  isPasswordGate,
  pwdFromSearch,
  pwdStorageKey,
  readStoredPwd,
  storePwd,
} from '../postPassword';

describe('postPassword (contract r3 §B)', () => {
  beforeEach(() => sessionStorage.clear());

  it('reads a trimmed ?pwd= from a share link and ignores an empty one', () => {
    expect(pwdFromSearch('?pwd=ab12cd')).toBe('ab12cd');
    expect(pwdFromSearch('?x=1&pwd=%20k9%20')).toBe('k9');
    expect(pwdFromSearch('?pwd=')).toBeNull();
    expect(pwdFromSearch('')).toBeNull();
  });

  it('remembers a code per post for the tab and forgets it with an empty value', () => {
    storePwd('Alice', 'p1', 'secret');
    expect(readStoredPwd('alice', 'p1')).toBe('secret');
    expect(readStoredPwd('alice', 'p2')).toBeNull();
    expect(sessionStorage.getItem(pwdStorageKey('alice', 'p1'))).toBe('secret');
    storePwd('alice', 'p1', '');
    expect(readStoredPwd('alice', 'p1')).toBeNull();
  });

  it('prefers the URL over the remembered code', () => {
    storePwd('a', 'p', 'old');
    expect(initialPwd('a', 'p', '?pwd=new')).toBe('new');
    expect(initialPwd('a', 'p', '')).toBe('old');
    expect(initialPwd('a', 'q', '')).toBeNull();
  });

  it('recognises the 40301 password gate and nothing else', () => {
    expect(isPasswordGate({ code: 40301, data: { reason: 'password' } })).toBe(true);
    expect(isPasswordGate({ code: 40301, data: { reason: 'login' } })).toBe(false);
    expect(isPasswordGate({ code: 40401 })).toBe(false);
    expect(isPasswordGate(null)).toBe(false);
  });
});
