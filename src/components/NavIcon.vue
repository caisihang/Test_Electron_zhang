// 内联 SVG 图标，避免引入图标库
<script setup lang="ts">
const props = defineProps<{ name: string; size?: number }>()

const icons: Record<string, string> = {
  dashboard: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6',
  contract: 'M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  schedule: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15h2M13 15h2',
  transaction: 'M4 8h13l-3-3M20 16H7l3 3M4 8v0M20 16v0',
  account: 'M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2',
  category: 'M3 12h7V3H3zM14 12h7V3h-7zM3 21h7v-9H3zM14 21h7v-9h-7z',
  analysis: 'M2 20h20M5 20V11M10 20V5M15 20v-6M20 20V8',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  backup: 'M4 8h16v12H4zM4 8l2-4h12l2 4M9 12h6M12 15v5M9.5 17.5 12 20l2.5-2.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.5',
  invoice: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M9 6l6 6-6 6',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.5-4.5',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  collapse: 'M15 6l-6 6 6 6',
  expand: 'M9 6l6 6-6 6',
  check: 'M5 12.5 9.5 17 19 7',
  alert: 'M12 3.5 2.5 20.5h19zM12 10v4.5M12 17.5v.5',
  close: 'M6 6l12 12M18 6 6 18',
  paperclip: 'M21 11.5 12 20.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  file: 'M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
}
</script>

<template>
  <svg
    :width="props.size ?? 17"
    :height="props.size ?? 17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path :d="icons[props.name] ?? icons.info" />
  </svg>
</template>
