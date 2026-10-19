import { assetHashFromUrl } from '../assetHash';

const H = 'a'.repeat(64);

describe('assetHashFromUrl', () => {
  it('reads the hash out of a local asset URL', () => {
    expect(assetHashFromUrl(`/api/v1/assets/${H}`)).toBe(H);
    expect(assetHashFromUrl(`http://localhost:5174/api/v1/assets/${H}?w=600`)).toBe(H);
  });
  it('reads the hash out of an S3-style key with an extension', () => {
    expect(assetHashFromUrl(`https://cdn.example.com/assets/${H}.webp`)).toBe(H);
  });
  it('returns null for foreign images', () => {
    expect(assetHashFromUrl('https://example.com/pic.png')).toBeNull();
    expect(assetHashFromUrl('')).toBeNull();
    expect(assetHashFromUrl(null)).toBeNull();
  });
});
