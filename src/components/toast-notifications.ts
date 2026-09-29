import { notifications } from '@mantine/notifications'

/**
 * OTTER-693 asks for toasts to be categorised as Success or Error rather than merely coloured,
 * because later work keys off the category. `data-toast-kind` carries that through to the DOM, so
 * it is readable without parsing copy or inspecting a colour.
 *
 * Deliberately narrow: `reportError` remains the path for anything with an exception behind it,
 * and toasts needing a JSX body, an id or a non-success/error colour still call Mantine directly.
 */
export type ToastKind = 'success' | 'error'

export const showToast = (kind: ToastKind, title: string, message: string) =>
    notifications.show({
        color: kind === 'error' ? 'red' : 'green',
        title,
        message,
        'data-toast-kind': kind,
    })
