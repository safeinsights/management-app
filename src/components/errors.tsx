'use client'

import { errorToString, extractActionFailure } from '@/lib/errors'
import { Alert, AlertProps, Group, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { LockIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react/dist/ssr'
import { captureException } from '@sentry/nextjs'
import { FC, ReactNode } from 'react'
import { difference } from 'remeda'

export const reportError = (error: unknown, title = 'An error occurred') => {
    const eventId = captureException(error)
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
