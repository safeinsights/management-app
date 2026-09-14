'use client'

import {
    errorToString,
    extractActionFailure,
    isStaleDeploymentError,
    STALE_DEPLOYMENT_MESSAGE,
    STALE_DEPLOYMENT_TITLE,
} from '@/lib/errors'
import { Alert, AlertProps, Button, Group, Stack, Text } from '@mantine/core'
import { notifications, type NotificationData } from '@mantine/notifications'
import { LockIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react/dist/ssr'
import { captureException } from '@sentry/nextjs'
import { FC, ReactNode } from 'react'
import { difference } from 'remeda'

// Fixed so repeated attempts keep one notification instead of stacking a new one per retry.
export const STALE_DEPLOYMENT_NOTIFICATION_ID = 'stale-deployment'

export const RELOAD_BUTTON_LABEL = 'Reload'

// The body of any notice whose only remedy is a reload. A control rather than an automatic reload:
// the page may hold work that exists nowhere else, so the reader chooses the moment.
export const ReloadNotice: FC<{ message: string }> = ({ message }) => (
    <Stack gap="xs" align="flex-start">
        <Text size="sm">{message}</Text>
        <Button size="compact-sm" onClick={() => window.location.reload()}>
            {RELOAD_BUTTON_LABEL}
        </Button>
    </Stack>
)

// Mantine's `show` is add-if-absent: it keeps the store unchanged when the id is already on screen,
// so a later notice under a shared id would never replace the first. `update` is a no-op for an
// absent id, which makes the pair replace-or-add without reading the store (OTTER-726).
export const showOrReplaceNotification = (notification: NotificationData) => {
    notifications.update(notification)
    notifications.show(notification)
}

// An action id is hashed with the pinned Server Actions key, so it survives an ordinary deploy. It
// stops resolving when the key rotates or the action moved, renamed or was removed between builds,
// and then no request from the open tab can succeed. Answered once here rather than at each call
// site (OTTER-726).
const reportStaleDeployment = () =>
    showOrReplaceNotification({
        id: STALE_DEPLOYMENT_NOTIFICATION_ID,
        color: 'blue',
        autoClose: false,
        title: STALE_DEPLOYMENT_TITLE,
        message: <ReloadNotice message={STALE_DEPLOYMENT_MESSAGE} />,
    })

export const reportError = (error: unknown, title = 'An error occurred') => {
    // Captured on purpose for a stale action id too: these events are the only client-side measure
    // of how often a deploy lands under an open tab. Only the reference id is withheld from the
    // notice, because the copy already says the one thing the reader can do.
    const eventId = captureException(error)

    if (isStaleDeploymentError(error)) {
        reportStaleDeployment()
        return
    }

    notifications.show({
        color: 'red',
        title,
        message: eventId ? `${errorToString(error)}\nReference: ${eventId}` : errorToString(error),
    })
}

type FormErrorHandler = {
    setErrors(errs: Record<string, string>): void
    values: Record<string, unknown>
}
export function handleMutationErrorsWithForm(form: FormErrorHandler) {
    return (err: unknown) => {
        const failure = extractActionFailure(err)
        if (failure) {
            if (typeof failure === 'string') {
                reportError(err)
            } else {
                const formErrorKeys = Object.keys(failure)
                const fieldKeys = Object.keys(form.values)
                // `form` is the catch-all alert key; `code` carries an error code driving its title.
                const nonFieldKeys = formErrorKeys.filter((k) => k !== 'form' && k !== 'code')

                const unknownKeys = difference(nonFieldKeys, fieldKeys)

                if (unknownKeys.length === 0) {
                    form.setErrors(failure)
                } else {
                    reportError(err)
                }
            }
        } else {
            reportError(err)
        }
    }
}

export const reportMutationError = (title: string) => (err: unknown) => reportError(err, title)

type ErrorAlertProps = { error: unknown } & AlertProps

export const ErrorAlert: FC<ErrorAlertProps> = ({ icon = <WarningIcon />, title = 'An error occurred', error }) => {
    return (
        <Alert variant="light" color="red" title={title} icon={icon}>
            {errorToString(error)}
        </Alert>
    )
}

type AccessDeniedAlertProps = { message?: string } & Omit<AlertProps, 'title'>

export const AccessDeniedAlert: FC<AccessDeniedAlertProps> = ({
    icon = <LockIcon />,
    message = 'You do not have permission to access this resource.',
    ...props
}) => {
    return (
        <Alert variant="light" color="yellow" title="Access Denied" icon={icon} {...props}>
            {message}
        </Alert>
    )
}

export const AlertNotFound: FC<{ title: string; message: ReactNode; hideIf?: boolean }> = ({
    title,
    message,
    hideIf,
}) => {
    if (hideIf) return null

    return (
        <Alert w="400" m="auto" variant="filled" color="red" icon={<WarningIcon />} title={title}>
            {message}
        </Alert>
    )
}

export const InputError: FC<{ error: ReactNode }> = ({ error }) => {
    if (!error) return null

    // `component="span"` so this stays valid as a Mantine `error`, which renders inside a `<p>`
    // where a `<div>` is a React nesting error.
    return (
        <Group component="span" gap="xs">
            <WarningCircleIcon size={14} color="var(--mantine-color-error)" weight="fill" />
            <Text c="var(--mantine-color-error)" size="sm" component="span">
                {error}
            </Text>
        </Group>
    )
}
