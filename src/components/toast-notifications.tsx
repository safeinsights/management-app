import { semanticColor, type SemanticToken } from '@/theme/tokens'
import { notifications, type NotificationData } from '@mantine/notifications'
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

// Kept on the notification itself, so it leaves the store with the toast. Its presence is also what
// marks a notification as a toast: the navigation sweep leaves anything without it alone.
const RAISED_AT = 'data-toast-raised-at'

// `update` shallow-merges, so a notification taking over a toast's id spreads this first, or it keeps
// the toast's icon, live region and raise time.
export const CLEAR_TOAST_KEYS = {
    icon: undefined,
    role: undefined,
    'aria-live': undefined,
    'data-toast-kind': undefined,
    [RAISED_AT]: undefined,
    styles: undefined,
}

/** Exported so a caller whose body varies per firing can pin the id to the part that does not. */
export const derivedToastId = ({ category, title, message }: Toast) => `toast:${category}:${title}:${message ?? ''}`

export const showToast = (toast: Toast) => {
    const { category, title, message, id } = toast
    const spec = CATEGORIES[category]
    const notification = {
        id: id ?? derivedToastId(toast),
        color: spec.color,
        autoClose: spec.autoClose,
        icon: spec.icon,
        title,
        message: message ?? '',
        role: spec.role,
        'aria-live': spec.ariaLive,
        'data-toast-kind': category,
        [RAISED_AT]: Date.now(),
        styles: { icon: { backgroundColor: semanticColor(spec.iconBg) } },
    }

    // `show` is add-if-absent and `update` a no-op for an unknown id, so the pair replaces-or-adds
    // without reading the store. Note the replacement inherits the original's remaining auto-close
    // time: Mantine only restarts the timer when the duration itself changes, so firing the same
    // toast twice in quick succession does not buy the reader a fresh countdown.
    notifications.update(notification)
    notifications.show(notification)
}

export const staleToastIds = (live: NotificationData[], graceMs: number, now = Date.now()) =>
    live
        .filter((notification) => {
            const raisedAt = notification[RAISED_AT]
            return typeof raisedAt === 'number' && now - raisedAt > graceMs
        })
        .flatMap(({ id }) => (id ? [id] : []))
