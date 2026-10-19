import { api } from './client';
import type { Dashboard } from './types';

export const dashboardApi = {
  get: () => api.get<Dashboard>('/me/dashboard'),
};
