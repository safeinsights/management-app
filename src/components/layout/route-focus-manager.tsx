'use client'

import { useRouteFocus } from '@/hooks/use-route-focus'

// Mounted once in the root layout, outside any shell: the shells remount when a navigation crosses
// top-level layouts, and a manager that remounted with them would read every such move as a first
// load and skip it.
export function RouteFocusManager() {
    useRouteFocus()

    return null
}
