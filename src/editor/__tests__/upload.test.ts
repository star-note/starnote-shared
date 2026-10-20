import { parseSseLine } from '../aiTransport';
import { shouldCompress, uploadImage, type UploadDeps } from '../upload';

function deps(
  overrides: Partial<UploadDeps> = {},
): UploadDeps & { put: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn> } {
  const compressed = new Blob(['compressed'], { type: 'image/webp' });
  return {
    compress: vi.fn(async () => compressed),
    sha256: vi.fn(async () => 'abc123'),
    presign: vi.fn(async () => ({
      exists: true,
      asset: { hash: 'abc123', url: '/api/v1/assets/abc123', size: 10, mime: 'image/webp' },
    })),
    put: vi.fn(async () => {}),
    complete: vi.fn(async () => ({
      hash: 'abc123',
      url: '/api/v1/assets/abc123',
      size: 10,
      mime: 'image/webp',
    })),
    ...overrides,
  } as never;
}

describe('upload pipeline', () => {
  const png = new File(['x'.repeat(100)], 'a.png', { type: 'image/png' });

  it('compresses, hashes, presigns and skips PUT/complete when the asset exists', async () => {
    const d = deps();
    const asset = await uploadImage(png, d);
    expect(d.compress).toHaveBeenCalledWith(png);
    expect(d.presign).toHaveBeenCalledWith(
      expect.objectContaining({ hash: 'abc123', mime: 'image/webp' }),
    );
    expect(d.put).not.toHaveBeenCalled();
    expect(d.complete).not.toHaveBeenCalled();
    expect(asset.url).toBe('/api/v1/assets/abc123');
  });

  it('PUTs to the presigned url then completes when the asset is new', async () => {
    const d = deps({
      presign: vi.fn(async () => ({
        exists: false,
        asset: { hash: 'abc123', url: '/api/v1/assets/abc123', size: 10, mime: 'image/webp' },
        upload: {
          method: 'PUT' as const,
          url: '/api/v1/assets/upload/abc123',
          headers: { 'x-test': '1' },
        },
      })),
    });
    await uploadImage(png, d);
    expect(d.put).toHaveBeenCalledWith(
      '/api/v1/assets/upload/abc123',
      expect.any(Blob),
      expect.objectContaining({ 'Content-Type': 'image/webp', 'x-test': '1' }),
    );
    expect(d.complete).toHaveBeenCalledWith('abc123');
  });

  it('does not compress gif / svg', async () => {
    expect(shouldCompress('image/gif')).toBe(false);
    expect(shouldCompress('image/svg+xml')).toBe(false);
    expect(shouldCompress('image/jpeg')).toBe(true);
    const gif = new File(['gif'], 'a.gif', { type: 'image/gif' });
    const d = deps();
    await uploadImage(gif, d);
    expect(d.compress).not.toHaveBeenCalled();
    expect(d.presign).toHaveBeenCalledWith(expect.objectContaining({ mime: 'image/gif' }));
  });

  it('rejects non-images', async () => {
    await expect(
      uploadImage(new File(['t'], 'a.txt', { type: 'text/plain' }), deps()),
    ).rejects.toThrow('只支持图片');
  });
});

describe('SSE line parsing (SparkWrite contract)', () => {
  it('extracts text deltas and ends on [DONE]', () => {
    expect(parseSseLine('data: {"text": "你好"}')).toBe('你好');
    expect(parseSseLine('data: [DONE]')).toBeNull();
    expect(parseSseLine('event: ping')).toBeNull();
    expect(parseSseLine('data: {"delta":{"text":"a"}}')).toBe('a');
  });
});
