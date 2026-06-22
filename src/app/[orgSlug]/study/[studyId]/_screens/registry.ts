import type React from 'react'
import type { ScreenId } from '@/lib/study-screen'
import type { ScreenComponentProps } from './types'

export type ScreenComponent = React.ComponentType<ScreenComponentProps>

// Each entry is wired in its own task. Until then the renderer falls back to the legacy page
// output (see study-screen-renderer.tsx). Partial now; tightened to a full Record<ScreenId, …>
// once every screen is wired.
export const SCREEN_COMPONENTS: Partial<Record<ScreenId, ScreenComponent>> = {}
