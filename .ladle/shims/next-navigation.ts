// Shim for `next/navigation` so client components that call the App Router hooks
// (useRouter/usePathname/useSearchParams/useParams) can render in Ladle. All
// navigation is inert; redirect/notFound throw so a story that hits them is an
// obvious signal that it needs a fixture rather than a leaf-component story.
const noop = () => {}

export function useRouter() {
    return { push: noop, replace: noop, back: noop, forward: noop, refresh: noop, prefetch: noop }
}

export function usePathname(): string {
    return '/'
}

export function useSearchParams(): URLSearchParams {
    return new URLSearchParams()
}

export function useParams<T = Record<string, string>>(): T {
    return {} as T
}

export function useSelectedLayoutSegment(): string | null {
    return null
}

export function useSelectedLayoutSegments(): string[] {
    return []
}

// Mirrors next/navigation's RedirectType enum so callers passing redirect(url, RedirectType.replace) resolve.
export enum RedirectType {
    push = 'push',
    replace = 'replace',
}

export function redirect(url: string, _type?: RedirectType): never {
    throw new Error(`next/navigation redirect() called in Ladle (needs a fixture): ${url}`)
}

export function permanentRedirect(url: string, _type?: RedirectType): never {
    throw new Error(`next/navigation permanentRedirect() called in Ladle (needs a fixture): ${url}`)
}

export function notFound(): never {
    throw new Error('next/navigation notFound() called in Ladle (needs a fixture)')
}
