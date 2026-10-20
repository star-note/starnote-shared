/**
 * Single import point for the publish SDK so the rest of the app never depends
 * on package internals. Both packages are local `link:` workspaces.
 */
import { chenjiAdapter, chenjiSchema } from '@starnote/publish-chenji';
import {
  commonSchema,
  convert,
  convertWechat,
  createPublisher,
  zodFieldMeta,
  zodToAntdRules,
} from '@starnote/publish-core';

export type {
  Adapter,
  Doc,
  FieldMeta,
  JobResult,
  PrefillContext,
  PublishEvent,
  PublishEventAction,
  PublishJob,
  Publisher,
  TiptapJSON,
  TocItem,
  WechatOptions,
  WechatResult,
} from '@starnote/publish-core';
export type { ChenjiForm, ChenjiFormInput } from '@starnote/publish-chenji';

export {
  chenjiAdapter,
  chenjiSchema,
  commonSchema,
  convert,
  convertWechat,
  createPublisher,
  zodFieldMeta,
  zodToAntdRules,
};
