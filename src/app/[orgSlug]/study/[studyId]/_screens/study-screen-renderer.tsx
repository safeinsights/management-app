import type React from 'react'
import type { ScreenComponentProps } from './types'
import { SCREEN_COMPONENTS } from './registry'

// Renders the registered component for descriptor.screen. When a screen isn't wired yet,
// `fallback` (the legacy page output) is rendered so the app keeps working during migration.
export function StudyScreenRenderer({ props, fallback }: { props: ScreenComponentProps; fallback: React.ReactNode }) {
    const Component = SCREEN_COMPONENTS[props.descriptor.screen]
    if (!Component) return <>{fallback}</>
    return <>{Component(props)}</>
}
