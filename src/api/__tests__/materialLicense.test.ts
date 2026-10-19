import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../client';
import { licenseOf, materialsApi, softSearchItems } from '../materials';

afterEach(() => vi.restoreAllMocks());

describe('materials license API', () => {
  it('sends the agreed terms version and hits the contract paths', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'm1' });
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ id: 'm1' });
    const get = vi.spyOn(api, 'get').mockResolvedValue({ items: [], total: 0 });

    await materialsApi.applyLicense('m1', '2026-10-r1');
    expect(post).toHaveBeenCalledWith('/materials/m1/license', { terms_version: '2026-10-r1' });
    await materialsApi.revokeLicense('m1');
    expect(del).toHaveBeenCalledWith('/materials/m1/license');
    await materialsApi.licenseTerms();
    expect(get).toHaveBeenCalledWith('/materials/license-terms');
    await materialsApi.adminLicenses('approved', 2);
    expect(get).toHaveBeenLastCalledWith('/admin/materials/licenses', {
      params: { status: 'approved', page: 2 },
    });
    await materialsApi.reviewLicense('m1', 'reject', '画质太低');
    expect(post).toHaveBeenLastCalledWith('/admin/materials/m1/license/review', {
      action: 'reject',
      note: '画质太低',
    });
    await materialsApi.reviewLicense('m1', 'approve');
    expect(post).toHaveBeenLastCalledWith('/admin/materials/m1/license/review', {
      action: 'approve',
      note: undefined,
    });
  });

  it('search returns items, and [] when the endpoint is missing or fails', async () => {
    const item = {
      id: 'a',
      title: 't',
      tags: [],
      kind: 'gif',
      url: '/u',
      source: 'licensed',
      attribution: '@lu',
    };
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ items: [item] });
    expect(await materialsApi.search('猫', { kind: 'gif', limit: 5 })).toEqual([item]);
    expect(get.mock.calls[0][0]).toBe('/materials/search');
    expect(get.mock.calls[0][1]).toMatchObject({ params: { q: '猫', kind: 'gif', limit: 5 } });

    get.mockResolvedValueOnce({ detail: 'Not Found' });
    expect(await materialsApi.search('猫')).toEqual([]);
    get.mockRejectedValueOnce({ code: 50000, message: 'x' });
    expect(await materialsApi.search('')).toEqual([]);
    expect(softSearchItems(null)).toEqual([]);
  });

  it('licenseOf defaults to none for older APIs', () => {
    expect(licenseOf({}).status).toBe('none');
    expect(
      licenseOf({
        license: {
          status: 'approved',
          version: 'v',
          licensed_at: null,
          revoked_at: null,
          review_note: null,
        },
      }).status,
    ).toBe('approved');
  });
});
