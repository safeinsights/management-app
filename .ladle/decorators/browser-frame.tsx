import type { ReactNode } from 'react'

// Bounds AppShell* content inside a box that acts like "the browser viewport".
//
// Mantine's AppShell sections (header / navbar / footer) are `position: fixed` — by default
// they resolve against the real viewport, so in Ladle they break out of the story area and
// overlap Ladle's own sidebar/chrome. Giving this wrapper a `transform` makes it the containing
// block for those fixed descendants, so they resolve against THIS box instead, and
// `overflow:hidden` clips any overspill.
//
// By default the frame fills the visible story area via `flex: 1` (the host is a flex column —
// see ladle.css) rather than a viewport-unit height, so there's no grey dead-space below it and
// no scrollbar from overflowing Ladle's padding. The `ladle-browser-frame` class lets ladle.css
// pin the AppShell to the frame's height so the page fills it exactly. Pass an explicit `height`
// to opt out of filling (e.g. a short fixed frame).
export function BrowserFrame({ children, height }: { children: ReactNode; height?: number | string }) {
    return (
        <div
            className="ladle-browser-frame"
            style={{
                position: 'relative',
                width: '100%',
                ...(height === undefined ? { flex: '1 1 auto', minHeight: 0 } : { height }),
                overflow: 'hidden',
                transform: 'translateZ(0)',
                border: '1px solid var(--mantine-color-gray-4)',
                borderRadius: 'var(--mantine-radius-md)',
                boxShadow: 'var(--mantine-shadow-sm)',
            }}
        >
            {children}
        </div>
    )
}
