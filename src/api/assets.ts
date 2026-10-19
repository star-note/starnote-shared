import { api } from './client';
import type { Asset, PresignResult } from './types';

export const assetsApi = {
  presign: (body: { hash: string; size: number; mime: string; width?: number; height?: number }) =>
    api.post<PresignResult>('/assets/presign', body),
  complete: (hash: string) => api.post<Asset>(`/assets/${hash}/complete`),
};
