// Unit tests server-render through react-dom, which ships no types of its own; this is the one
// call they make.
declare module 'react-dom/server' {
    import type { ReactNode } from 'react'

    export function renderToString(element: ReactNode): string
}
