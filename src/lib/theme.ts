/**
 * ライト / ダークを覚えておく Cookie の名前。
 * サーバー(layout.tsx)と画面(theme-toggle.tsx)の両方が読むので、どちら側でもない普通のファイルに置く。
 * ("use client" のファイルから定数を読むと、サーバーでは文字列ではなく「部品への参照」が届いてしまう)
 */
export const THEME_COOKIE = "aiment_theme";
