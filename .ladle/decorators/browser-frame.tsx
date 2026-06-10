import type { ReactNode } from 'react'

// Bounds AppShell* content inside a box that acts like "the browser viewport".
//
// Mantine's AppShell sections (header / navbar / footer) are `position: fixed` — by default
// they resolve against the real viewport, so in Ladle they break out of the story area and
// overlap Ladle's own sidebar/chrome. Giving this wrapper a `transform` makes it the containing
// block for those fixed descendants, so they resolve against THIS box instead. `overflow:hidden`
// clips the overspill and the fixed height gives a realistic desktop frame.
export function BrowserFrame({ children, height = 760 }: { children: ReactNode; height?: number | string }) {
    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height,
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
