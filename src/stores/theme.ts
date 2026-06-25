import { defineStore } from 'pinia'
import { ref, computed, watchEffect } from 'vue'
import { darkTheme } from 'naive-ui'
import { jvLightTheme, jvDarkTheme } from '../design-system/theme'

export type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(
    (localStorage.getItem('jv-theme') as ThemeMode) ?? 'system'
  )

  const systemIsDark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches)

  const isDark = computed(() => {
    if (mode.value === 'dark') return true
    if (mode.value === 'light') return false
    return systemIsDark.value
  })

  /* Naive UI 主题对象：dark 模式传 darkTheme，否则 null（内置浅色） */
  const naiveTheme = computed(() => isDark.value ? darkTheme : null)

  /* Naive UI 主题覆盖 */
  const naiveThemeOverrides = computed(() =>
    isDark.value ? jvDarkTheme : jvLightTheme
  )

  /* 监听系统主题变化 */
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', (e) => { systemIsDark.value = e.matches })

  /* 同步 data-theme 属性到 <html>，供 tokens.css 使用 */
  watchEffect(() => {
    const html = document.documentElement
    if (mode.value === 'system') {
      html.setAttribute('data-theme', 'system')
    } else {
      html.setAttribute('data-theme', mode.value)
    }
  })

  function setMode(m: ThemeMode) {
    mode.value = m
    localStorage.setItem('jv-theme', m)
  }

  function toggle() {
    setMode(isDark.value ? 'light' : 'dark')
  }

  return { mode, isDark, naiveTheme, naiveThemeOverrides, setMode, toggle }
})
