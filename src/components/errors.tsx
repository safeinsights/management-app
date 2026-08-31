'use client'

import { errorToString, extractActionFailure } from '@/lib/errors'
import { Alert, AlertProps, Group, Text, useMantineTheme } from '@mantine/core'
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
    // Only the keys are read, so the value type is deliberately unconstrained: forms carry
    // non-string fields too (booleans, files, arrays).
    values: Record<string, unknown>
}
export function handleMutationErrorsWithForm(form: FormErrorHandler) {
    return (err: unknown) => {
        const failure = extractActionFailure(err)
        if (failure) {
            // Handle both string and object errors
            if (typeof failure === 'string') {
                reportError(err)
            } else {
                const formErrorKeys = Object.keys(failure)
                const fieldKeys = Object.keys(form.values)
                // `form` is the catch-all alert key; `code` is a reserved companion that lets
                // callers pass an error code (e.g. a Clerk code) to drive an alert title.
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
    const theme = useMantineTheme()
    if (!error) return null

    // `component="span"`, so this node stays valid wherever it is used as a Mantine `error`.
    // Mantine renders an input's error inside a `<p>`, and a `<div>` there is invalid HTML that
    // React reports as a nesting error. Rendering inline also lets call sites hand this straight
    // to Mantine instead of suppressing the built-in error and rendering an unassociated copy,
    // which left the message out of `aria-describedby`.
    return (
        <Group component="span" gap="xs">
            <WarningCircleIcon size={14} color={theme.colors.red[10]} weight="fill" />
            <Text c="red.10" size="sm" component="span">
                {error}
            </Text>
        </Group>
    )
}
