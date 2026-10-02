import { notifications } from '@mantine/notifications'
import type { ReactNode } from 'react'

/**
 * Not toasts. Reserved for notifications whose remedy needs a control with no text equivalent, and
 * for any notification hidden by id from one of those. These never auto-close and are never
 * dismissed on navigation. Adding an entry is a design decision, not a coding one — check before
 * extending this list.
 */
export type SystemNotification = {
    id: string
    title?: string
    message: ReactNode
    withCloseButton?: boolean
    /** Mantine colour key. Omitted leaves the primary accent, which reads as neutral. */
    color?: string
}

export const showSystemNotification = ({ id, title, message, withCloseButton = true, color }: SystemNotification) => {
    const notification = { id, title, message, withCloseButton, color, autoClose: false as const }
    // `show` is add-if-absent and `update` a no-op for an unknown id, so the pair replaces-or-adds
    // without reading the store.
    notifications.update(notification)
    notifications.show(notification)
}
