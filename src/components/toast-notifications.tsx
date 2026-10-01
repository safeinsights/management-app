import { semanticColor, type SemanticToken } from '@/theme/tokens'
import { notifications } from '@mantine/notifications'
import { CheckCircleIcon, InfoIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react/dist/ssr'
import type { ReactNode } from 'react'

export type ToastCategory = 'success' | 'warning' | 'info' | 'error'

export type Toast = {
    category: ToastCategory
    title: string
    /** Text only. A notification needing a control belongs in system-notifications. */
    message?: string
    /** For an event whose copy changes between firings; otherwise derived from the content. */
    id?: string
}

type CategorySpec = {
    color: string
    autoClose: number | false
    icon: ReactNode
    iconBg: SemanticToken
    role: 'status' | 'alert'
    ariaLive: 'polite' | 'assertive'
}

// The only place a toast colour, timeout, icon or ARIA role is named, so the four categories
// cannot drift apart as call sites are added.
const CATEGORIES: Record<ToastCategory, CategorySpec> = {
    success: {
        color: 'green',
        autoClose: 4_000,
        icon: <CheckCircleIcon weight="fill" />,
        iconBg: 'success.bg.dark',
        role: 'status',
        ariaLive: 'polite',
    },
    warning: {
        color: 'yellow',
        autoClose: 12_000,
        icon: <WarningIcon weight="fill" />,
        iconBg: 'warning.bg.dark',
        role: 'status',
        ariaLive: 'polite',
    },
    info: {
        color: 'blue',
        autoClose: 12_000,
        icon: <InfoIcon weight="fill" />,
        iconBg: 'info.bg.dark',
        role: 'status',
        ariaLive: 'polite',
    },
    // The only category that never auto-closes: an error the reader has not acted on must not
    // disappear on its own.
    error: {
        color: 'red',
        autoClose: false,
        icon: <XCircleIcon weight="fill" />,
        iconBg: 'error.bg.dark',
        role: 'alert',
        ariaLive: 'assertive',
    },
}

// Doubles as the ownership record: an id absent here was not raised as a toast, so the navigation
// sweep leaves it alone. That is what keeps system notifications out of its reach without the hook
// needing to know they exist.
const raisedAt = new Map<string, number>()

/** Exported so a caller whose body varies per firing can pin the id to the part that does not. */
export const derivedToastId = ({ category, title, message }: Toast) => `toast:${category}:${title}:${message ?? ''}`

/**
 * Hands an id back to a non-toast path that is taking the notification over, so the navigation sweep
 * stops treating it as one of ours.
 */
export const forgetToast = (id: string) => {
    raisedAt.delete(id)
}

export const showToast = (toast: Toast) => {
    const { category, title, message, id } = toast
    const spec = CATEGORIES[category]
    const notificationId = id ?? derivedToastId(toast)

    raisedAt.set(notificationId, Date.now())

    const notification = {
        id: notificationId,
        color: spec.color,
        autoClose: spec.autoClose,
        icon: spec.icon,
        title,
        message: message ?? '',
        role: spec.role,
        'aria-live': spec.ariaLive,
        'data-toast-kind': category,
        styles: { icon: { backgroundColor: semanticColor(spec.iconBg) } },
    }

    // `show` is add-if-absent and `update` a no-op for an unknown id, so the pair replaces-or-adds
    // without reading the store. Note the replacement inherits the original's remaining auto-close
    // time: Mantine only restarts the timer when the duration itself changes, so firing the same
    // toast twice in quick succession does not buy the reader a fresh countdown.
    notifications.update(notification)
    notifications.show(notification)
}

/**
 * Ids this module raised more than `graceMs` ago, after forgetting any no longer in `liveIds`.
 * `liveIds` must cover the queue as well as the visible list, or a pending toast is forgotten and
 * then never dismissed.
 */
export const staleToastIds = (liveIds: string[], graceMs: number, now = Date.now()) => {
    const live = new Set(liveIds)
    for (const id of raisedAt.keys()) {
        if (!live.has(id)) raisedAt.delete(id)
    }
    return [...raisedAt.entries()].filter(([, at]) => now - at > graceMs).map(([id]) => id)
}
