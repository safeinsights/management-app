'use client'

import { notifications } from '@mantine/notifications'
import { Alert, AlertProps, Flex, useMantineTheme } from '@mantine/core'
import { LockIcon, WarningIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, ReactNode } from 'react'
import { errorToString, extractActionFailure } from '@/lib/errors'
import { captureException } from '@sentry/nextjs'
import { difference } from 'remeda'

export * from '@/lib/errors'

export const reportError = (error: unknown, title = 'An error occurred') => {
    captureException(error)
    notifications.show({
        color: 'red',
        title,
        message: errorToString(error),
    })
}

type FormErrorHandler = {
    setErrors(errs: Record<string, string>): void
    values: Record<string, string>
}
export function handleMutationErrorsWithForm(form: FormErrorHandler) {
    return (err: unknown) => {
        const failure = extractActionFailure(err)
        if (failure) {
            const formErrorKeys = Object.keys(failure)
            const fieldKeys = Object.keys(form.values)
            const nonFieldKeys = formErrorKeys.filter((k) => k !== 'form')

            const unknownKeys = difference(nonFieldKeys, fieldKeys)

            if (unknownKeys.length === 0) {
                form.setErrors(failure)
            } else {
                reportError(err)
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

    return (
        <Flex gap="xs" my={2} component="span" data-testid="input-error" bg="#FFEFEF" px="md" py="sm">
            <WarningCircleIcon size={20} color={theme.colors.red[7]} weight="fill" />
            {error}
        </Flex>
    )
}
