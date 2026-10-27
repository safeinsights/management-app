import type { Page } from '@playwright/test'

export async function goto(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    // Set by HydrationMarker once the root Suspense boundary's content has hydrated. Segments with
    // their own loading.tsx hydrate in a nested boundary later, so this does not cover them.
    await page.waitForFunction(() => window.isReactHydrated)
}

export async function reload(page: Page) {
    await page.reload()
    await page.waitForFunction(() => window.isReactHydrated)
}

// Navigate to a protected URL assuming the session is already restored from
// storageState, then wait for hydration.
export const visitAsRole = async (page: Page, url: string) => {
    await goto(page, url)
}
