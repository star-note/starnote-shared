import { api } from './client';
import { SOFT } from './soft';

/** `GET /wechat/jssdk-signature?url=` — `enabled: false` unless the server has a verified 公众号 configured. */
export interface WechatJssdkConfig {
  enabled: boolean;
  app_id?: string;
  timestamp?: number;
  nonce_str?: string;
  signature?: string;
}

export const wechatApi = {
  jssdkSignature: (url: string) =>
    api.get<WechatJssdkConfig>('/wechat/jssdk-signature', { ...SOFT, params: { url } }),
};
