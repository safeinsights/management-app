import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

// False during server render and hydration only, so markup that depends on the browser's zone or
// clock can never mismatch the server HTML. Later client mounts read true at once.
export const useIsHydrated = () =>
    useSyncExternalStore(
        subscribe,
        () => true,
        () => false,
    )
