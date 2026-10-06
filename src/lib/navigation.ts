import type { Route } from 'next'

type Router = {
    push: (href: Route) => void
    refresh: () => void
}

// push() is a no-op when the tab is already at href, leaving the old screen mounted.
// Refreshing after every push would fetch the destination twice.
export function pushDecided(router: Router, pathname: string, href: Route) {
    router.push(href)
    if (pathname === href) router.refresh()
}
