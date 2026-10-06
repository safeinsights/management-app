import type { Icon } from '@phosphor-icons/react'

export const NAV_ICON_SIZE = 16

// Every nav glyph is decorative: the row label names the destination.
export const navIcon = (Glyph: Icon, size = NAV_ICON_SIZE) => <Glyph size={size} aria-hidden />
