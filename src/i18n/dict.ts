/**
 * UI strings for the parts of the app that speak more than one language. The app shell stays
 * Chinese for now; a page opts in by reading `useI18n().t.<namespace>` instead of literal copy.
 */
export type Lang = 'zh-CN' | 'en';

export const LANGS: readonly Lang[] = ['zh-CN', 'en'];

export interface Dict {
  nav: {
    publish: string;
    blog: string;
    team: string;
    login: string;
    start: string;
    /** Label of the toggle: names the *other* language. */
    switchTo: string;
    /** Short code shown next to the globe icon: the language the toggle switches *to*. */
    switchShort: string;
    /** Tooltip / accessible name of the toggle. */
    switchAria: string;
    /** Signed-in visitors on the landing: the way back into the app. */
    workspace: string;
    /** The slogan beside the header logo (set as text so it stays legible at header size). */
    slogan: string;
  };
  landing: {
    title: string;
    h1a: string;
    h1b: string;
    sub: string;
    /** Three short value tags under the hero line: earn, monetise, build a personal brand. */
    perks: string[];
    start: string;
    demo: string;
    aiH: string;
    aiWrite: string;
    aiPublish: string;
    reachH: string;
    reachLead: string;
    reachLive: string;
    reachSoon: string;
    /** The handle shown after `starnote.app/` in the fan-out: 「@你的id」 / `@you`. */
    reachSelf: string;
    reachTranslate: string;
    reachMoney: string;
    blogH: string;
    blogBody: string;
    /** Small print under the blog copy: the two hosting options. */
    blogHosting: string;
    blogLink: string;
    teamH: string;
    teamBody: string;
    steps: [string, string, string, string];
    stepsWho: [string, string, string, string];
    hotH: string;
    hotBody: string;
    hotMock: string;
    endH: string;
    endBody: string;
    /** Accessible name of the screen dots on the right of the landing. */
    screens: string;
  };
  /** The login / register modal over the landing, and `/auth/callback/:provider`. */
  auth: {
    dialog: string;
    login: string;
    register: string;
    brandBody: string;
    brandNote: string;
    email: string;
    emailInvalid: string;
    password: string;
    passwordRequired: string;
    passwordMin: string;
    name: string;
    namePh: string;
    nameRequired: string;
    handle: string;
    handleHelp: string;
    handleRequired: string;
    handleInvalid: string;
    handleTaken: string;
    handlePreview: string;
    submitLogin: string;
    submitRegister: string;
    loginFailed: string;
    registerFailed: string;
    or: string;
    github: string;
    wechat: string;
    passkey: string;
    githubOff: string;
    wechatOff: string;
    passkeyOff: string;
    notOpen: string;
    passkeyUnsupported: string;
    passkeyFailed: string;
    passkeyUnavailable: string;
    termsPrefix: string;
    termsAnd: string;
    termsSuffix: string;
    callbackWorking: string;
    callbackFailed: string;
    callbackExpired: string;
    callbackDenied: string;
    callbackRetry: string;
    callbackHome: string;
  };
  footer: {
    support: string;
    copyright: string;
  };
  legal: {
    privacy: string;
    terms: string;
  };
}

const zh: Dict = {
  nav: {
    publish: '发布',
    blog: '博客',
    team: '团队',
    login: '登录',
    start: '免费开始',
    switchTo: 'English',
    switchShort: 'EN',
    switchAria: '切换到 English',
    slogan: '笔落成星，文达四海',
    workspace: '进入工作台',
  },
  landing: {
    title: '辰记 StarNote · 笔落成星，文达四海',
    h1a: '笔落成星，',
    h1b: '文达四海。',
    sub: '在辰记写作，AI 帮你润色、翻译，一键发布到你的博客和海内外平台。',
    perks: ['创作分成', '广告与打赏', '个人品牌'],
    start: '免费开始',
    demo: '看示例博客',
    aiH: 'AI 写作，AI 发布',
    aiWrite: '写的时候，AI 续写、改写、摘要、建议标题，生成的都是可编辑的正文，不是另一个聊天框。',
    aiPublish: '发的时候，AI 翻译成英文、日文，按每个平台的格式重新排好，一键发到多个平台。',
    reachH: '海内外发布，\n顺便赚钱',
    reachLead: '同一篇文章，免费翻译，发到',
    reachLive: '已接入',
    reachSoon: '接入中',
    reachSelf: '@你的id',
    reachTranslate: '翻译免费，格式、图片、目录都替你排好；中文写一遍，英文、日文读者也能读到。',
    reachMoney:
      '文章页的广告位和打赏码由你开关，收入归你；各平台创作者计划的申请入口在官方群组里整理好了。',
    blogH: '你的博客，\n/@你的id',
    blogBody:
      '发布的文章自动成为你的博客：带你自己的 id，搜索引擎可收录，广告与打赏收入归你。它就是你的个人品牌主页。',
    blogHosting:
      '博客有两种托管方式：放在辰记（starnote.app/@你的id），或导出到你自己的 GitHub Pages。两边都能随时编辑、重新发布。',
    blogLink: '看示例博客',
    teamH: '团队一起发',
    teamBody:
      '创作者、编辑、发布者在群组里各司其职。审批不通过就退回修改，每一步谁改了什么都有记录。文档、图片、表格、数据乃至视频，都走同一条流程。',
    steps: ['创作', '编辑', '审批', '发布'],
    stepsWho: ['创作者起草', '编辑修改', '发布者把关', '博客与各平台'],
    hotH: '各平台\n正在传播什么',
    hotBody: '登录后首页每天更新，作为选题的灵感来源。',
    hotMock: '示例数据',
    endH: '现在就写第一篇。',
    endBody: '注册即有自己的博客。写完点「发布」，文章就上线了，再一键发往各个平台。',
    screens: '跳到某一屏',
  },
  auth: {
    dialog: '登录或注册辰记',
    login: '登录',
    register: '注册',
    brandBody: '笔记、博客和群组都在同一个工作台里。写完一次，发到你的博客和各个平台。',
    brandNote: '注册即得一个带你 id 的博客。',
    email: '邮箱',
    emailInvalid: '请输入有效邮箱',
    password: '密码',
    passwordRequired: '请输入密码',
    passwordMin: '至少 8 位',
    name: '昵称',
    namePh: '怎么称呼你',
    nameRequired: '请输入昵称',
    handle: '博客 ID',
    handleHelp: '3 到 24 位小写字母、数字或下划线，将作为博客地址 /@id',
    handleRequired: '请输入 ID',
    handleInvalid: '只能是 3 到 24 位小写字母、数字或下划线',
    handleTaken: 'ID 已被占用',
    handlePreview: '博客地址：',
    submitLogin: '登录',
    submitRegister: '注册并开始写',
    loginFailed: '登录失败',
    registerFailed: '注册失败',
    or: '或',
    github: '使用 GitHub 登录',
    wechat: '微信扫码登录',
    passkey: '使用通行密钥（Passkey）',
    githubOff: '服务器尚未配置 GitHub 登录',
    wechatOff: '服务器尚未配置微信登录',
    passkeyOff: '服务器尚未开启通行密钥',
    notOpen: '这种登录方式暂未开放',
    passkeyUnsupported: '这个浏览器不支持通行密钥',
    passkeyFailed: '通行密钥验证没有通过，请重试或换一种方式登录',
    passkeyUnavailable: '通行密钥登录暂不可用',
    termsPrefix: '继续即表示你同意',
    termsAnd: '和',
    termsSuffix: '。',
    callbackWorking: '正在完成登录…',
    callbackFailed: '登录没有完成',
    callbackExpired: '登录链接已过期或已经用过，请重新登录。',
    callbackDenied: '你取消了授权，没有登录。',
    callbackRetry: '重新登录',
    callbackHome: '回到首页',
  },
  footer: {
    support: '写信给我们',
    copyright: '辰记 StarNote',
  },
  legal: {
    privacy: '隐私政策',
    terms: '服务条款',
  },
};

const en: Dict = {
  nav: {
    publish: 'Publish',
    blog: 'Blog',
    team: 'Teams',
    login: 'Log in',
    start: 'Start free',
    switchTo: '中文',
    switchShort: '中',
    switchAria: 'Switch to 中文',
    slogan: 'Write it. Send it everywhere.',
    workspace: 'Open workspace',
  },
  landing: {
    title: 'StarNote · Write it. Send it everywhere.',
    h1a: 'Write it.',
    h1b: 'Send it everywhere.',
    sub: 'Write in StarNote. AI polishes and translates, then publishes to your blog and platforms worldwide in one click.',
    perks: ['Creator revenue', 'Ads and tips', 'Your personal brand'],
    start: 'Start free',
    demo: 'See a demo blog',
    aiH: 'AI writes. AI publishes.',
    aiWrite:
      'While you write, AI continues, rewrites, summarises and suggests titles. Everything it produces is editable text, not another chat box.',
    aiPublish:
      'When you publish, AI translates into English and Japanese, reformats for each platform, and sends to several at once.',
    reachH: 'Publish at home and abroad.\nEarn along the way.',
    reachLead: 'One post, translated for free, sent to',
    reachLive: 'live',
    reachSoon: 'coming',
    reachSelf: '@you',
    reachTranslate:
      'Translation is free; layout, images and the table of contents are handled for you. Write once in Chinese and readers in English and Japanese can read it.',
    reachMoney:
      'Ad slots and tip codes on your post pages are yours to switch on, and the income is yours. Links to each platform’s creator programme are collected in the official group.',
    blogH: 'Your blog,\nat /@you',
    blogBody:
      'What you publish becomes your blog: at your own id, indexed by search engines, with ad and tip income going to you. It is the home of your personal brand.',
    blogHosting:
      'Two ways to host it: on StarNote (starnote.app/@you) or exported to your own GitHub Pages. Edit and republish either one at any time.',
    blogLink: 'See a demo blog',
    teamH: 'Teams publish together',
    teamBody:
      'Writers, editors and publishers each have a role in a group. A rejected draft goes back for changes, and every step records who changed what. Documents, images, tables, data and video all follow the same flow.',
    steps: ['Write', 'Edit', 'Approve', 'Publish'],
    stepsWho: ['writer drafts', 'editor revises', 'publisher signs off', 'blog and platforms'],
    hotH: 'What is spreading\nright now',
    hotBody: 'Updated daily on your home page once you log in, as a source of ideas.',
    hotMock: 'sample data',
    endH: 'Write the first one now.',
    endBody:
      'Signing up gives you your own blog. Press Publish and the post is live, then send it to every platform in one click.',
    screens: 'Jump to a screen',
  },
  auth: {
    dialog: 'Log in or sign up to StarNote',
    login: 'Log in',
    register: 'Sign up',
    brandBody:
      'Notes, your blog and your groups live in one workspace. Write once, then send it to your blog and every platform.',
    brandNote: 'Sign up and get a blog at your own id.',
    email: 'Email',
    emailInvalid: 'Enter a valid email address',
    password: 'Password',
    passwordRequired: 'Enter your password',
    passwordMin: 'At least 8 characters',
    name: 'Name',
    namePh: 'What should we call you',
    nameRequired: 'Enter your name',
    handle: 'Blog ID',
    handleHelp: '3–24 lowercase letters, digits or underscores; your blog lives at /@id',
    handleRequired: 'Choose an ID',
    handleInvalid: 'Use 3–24 lowercase letters, digits or underscores',
    handleTaken: 'That ID is taken',
    handlePreview: 'Your blog: ',
    submitLogin: 'Log in',
    submitRegister: 'Sign up and start writing',
    loginFailed: 'Could not log in',
    registerFailed: 'Could not sign up',
    or: 'or',
    github: 'Continue with GitHub',
    wechat: 'Scan with WeChat',
    passkey: 'Use a passkey',
    githubOff: 'GitHub sign-in is not configured on this server',
    wechatOff: 'WeChat sign-in is not configured on this server',
    passkeyOff: 'Passkeys are not enabled on this server',
    notOpen: 'This sign-in method is not available yet',
    passkeyUnsupported: 'This browser does not support passkeys',
    passkeyFailed: 'The passkey was not accepted. Try again or use another method.',
    passkeyUnavailable: 'Passkey sign-in is not available right now',
    termsPrefix: 'By continuing you agree to the ',
    termsAnd: ' and ',
    termsSuffix: '.',
    callbackWorking: 'Finishing sign-in…',
    callbackFailed: 'Sign-in did not finish',
    callbackExpired: 'This sign-in link has expired or was already used. Log in again.',
    callbackDenied: 'You cancelled the authorisation, so you are not signed in.',
    callbackRetry: 'Log in again',
    callbackHome: 'Back to home',
  },
  footer: {
    support: 'Write to us',
    copyright: 'StarNote',
  },
  legal: {
    privacy: 'Privacy',
    terms: 'Terms',
  },
};

export const DICT: Record<Lang, Dict> = { 'zh-CN': zh, en };
