// Shim for `next/link` so components that use it render in Ladle (Vite, no Next).
// Maps the small slice of the Next.js Link API we use to a plain anchor.
import type { AnchorHTMLAttributes, PropsWithChildren } from 'react'

type Props = PropsWithChildren<
    AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string
        prefetch?: boolean
        replace?: boolean
        scroll?: boolean
        shallow?: boolean
    }
>

export default function Link({ href, prefetch, replace, scroll, shallow, children, ...rest }: Props) {
    void prefetch
    void replace
    void scroll
    void shallow
    return (
        <a href={href} {...rest}>
            {children}
        </a>
    )
}
