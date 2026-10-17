// JNS 域名总览页的 feature-scoped i18n。
// 零依赖：纯字典 + 响应式 ref；英文为默认语种与兜底；选择持久化到 localStorage。
// 约束（vue-feature-i18n skill）：只服务自建页面，不改全局 App.vue；
// 以 locales/en.ts 为键来源，其余语种标注 I18nDict，漏键/多键即编译失败。

import { ref } from 'vue'
import en from './locales/en'
import zhHans from './locales/zh-Hans'
import zhHant from './locales/zh-Hant'
import ja from './locales/ja'
import ko from './locales/ko'
import de from './locales/de'
import fr from './locales/fr'
import type { I18nDict } from './locales/en'

export type Lang = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko' | 'de' | 'fr'

/** 语言切换器选项 */
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
]

export const DICTS: Record<Lang, I18nDict> = {
  en,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
  de,
  fr,
}

const STORAGE_KEY = 'jns-domains.lang'

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang
  } catch {
    // localStorage 不可用（隐私模式等）→ 回退默认英文
  }
  return 'en'
}

/** 当前语种（响应式：模板中调用 t() 会自动重渲染） */
export const lang = ref<Lang>(readLang())

export function setLang(l: Lang): void {
  lang.value = l
  try { localStorage.setItem(STORAGE_KEY, l) } catch { /* 持久化失败静默 */ }
}

/**
 * 翻译：取当前语种字典，缺失回退英文，再缺失返回键名本身。
 * 支持 {name} 形式的插值参数。
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const current: Record<string, string> = DICTS[lang.value] ?? en
  const fallback: Record<string, string> = en
  let s = current[key] ?? fallback[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v))
    }
  }
  return s
}
