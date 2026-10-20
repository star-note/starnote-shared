import axios, { type AxiosRequestConfig } from 'axios';

import { api, configureClientAuth, http } from '../client';

function envelope(code: number, data: unknown, message = 'ok') {
  return { code, data, message };
}

describe('api client', () => {
  const calls: AxiosRequestConfig[] = [];
  let access = 'old-token';
  const setTokens = vi.fn((a: string, _refresh: string) => {
    access = a;
  });
  const onLogout = vi.fn();

  beforeEach(() => {
    calls.length = 0;
    access = 'old-token';
    setTokens.mockClear();
    onLogout.mockClear();
    configureClientAuth({
      getAccessToken: () => access,
      getRefreshToken: () => 'refresh-1',
      setTokens: (a, r) => setTokens(a, r),
      onLogout,
    });
  });

  it('unwraps the 3-part envelope and sends the bearer', async () => {
    http.defaults.adapter = async (config) => {
      calls.push(config);
      return {
        data: envelope(0, { id: 'n1' }),
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    const res = await api.get<{ id: string }>('/notes/n1');
    expect(res).toEqual({ id: 'n1' });
    expect(calls[0].headers?.Authorization).toBe('Bearer old-token');
  });

  it('rejects with {code, message} on a non-zero code', async () => {
    http.defaults.adapter = async (config) => ({
      data: envelope(40901, null, '重名'),
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config,
    });
    await expect(api.post('/notes', {})).rejects.toMatchObject({ code: 40901, message: '重名' });
  });

  it('refreshes once on 40101 and replays the original request with the new token', async () => {
    let n = 0;
    http.defaults.adapter = async (config) => {
      calls.push(config);
      n += 1;
      if (n === 1) {
        return {
          data: envelope(40101, null, '登录过期'),
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        };
      }
      return {
        data: envelope(0, { ok: true }),
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: envelope(0, { access_token: 'new-token', refresh_token: 'refresh-2' }),
      status: 200,
    });

    const res = await api.get<{ ok: boolean }>('/me');
    expect(res).toEqual({ ok: true });
    expect(post).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      { refresh_token: 'refresh-1' },
      expect.anything(),
    );
    expect(setTokens).toHaveBeenCalledWith('new-token', 'refresh-2');
    expect(calls).toHaveLength(2);
    expect(calls[1].headers?.Authorization).toBe('Bearer new-token');
    expect(onLogout).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('logs out when the refresh itself fails', async () => {
    http.defaults.adapter = async (config) => ({
      data: envelope(40101, null, '过期'),
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
    });
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: envelope(40102, null, '请重新登录'),
      status: 401,
    });
    await expect(api.get('/me')).rejects.toMatchObject({ code: 40102 });
    expect(onLogout).toHaveBeenCalled();
    post.mockRestore();
  });

  it('logs out immediately on 40102', async () => {
    http.defaults.adapter = async (config) => ({
      data: envelope(40102, null, '请重新登录'),
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
    });
    await expect(api.get('/me')).rejects.toMatchObject({ code: 40102 });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
