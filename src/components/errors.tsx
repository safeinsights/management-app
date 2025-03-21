import { notifications } from '@mantine/notifications'
import { Alert, AlertProps } from '@mantine/core'
import { Lock, Warning } from '@phosphor-icons/react/dist/ssr'
import { FC, ReactNode } from 'react'

type ClerkAPIErrorResponse = {
    errors: Array<{
        meta?: {
            paramName: string
        }
        code: string
        message: string
        longMessage: string
    }>
}

export function isClerkApiError(error: unknown): error is ClerkAPIErrorResponse {
    return (
        error != null &&
        typeof error === 'object' &&
        'errors' in error &&
        Array.isArray(error.errors) &&
        error.errors?.[0].code
    )
}

type ServerActionError = {
    digest: string
    name: string
    Error: string
    stack?: string
    environmentName: 'Server'
}

export function isServerActionError(error: unknown): error is ServerActionError {
    return (
        error != null &&
        typeof error === 'object' &&
        'environmentName' in error &&
        error['environmentName'] === 'Server'
    )
}

export const errorToString = (error: unknown) => {
    if (!error) return ''

    if (typeof error === 'string') {
        return error
    }

    if (isServerActionError(error)) {
        return `An unexpected error occurred on the server.\nDigest: ${error.digest}`
    }

    if (isClerkApiError(error)) {
        return error.errors.map((e) => `${e.message}: ${e.longMessage}`).join('\n')
    }

    if (error instanceof Error) {
        return String(error)
    }
}

export const reportError = (error: unknown, title = 'An error occured') => {
    notifications.show({
        color: 'red',
        title,
        message: errorToString(error),
    })
}

type ErrorAlertProps = { error: string | Error } & AlertProps

export const ErrorAlert: FC<ErrorAlertProps> = ({ icon = <Warning />, title = 'An error occured', error }) => {
    return (
        <Alert variant="light" color="red" title={title} icon={icon}>
            {error.toString()}
        </Alert>
    )
}

type AccessDeniedAlertProps = { message?: string } & Omit<AlertProps, 'title'>

export const AccessDeniedAlert: FC<AccessDeniedAlertProps> = ({
    icon = <Lock />,
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
        <Alert w="400" m="auto" variant="filled" color="red" icon={<Warning />} title={title}>
            {message}
        </Alert>
    )
}
