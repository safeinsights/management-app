import { useState } from 'react'

export function usePopover() {
    const [activePopover, setActivePopover] = useState<string | null>(null)

    const getPopoverProps = (id: string) => ({
        opened: activePopover === id,
        onOpenChange: (open: boolean) =>
            setActivePopover((current) => {
                if (open) return id
                return current === id ? null : current
            }),
    })

    return { getPopoverProps }
}
