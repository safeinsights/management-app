import { notifications } from '@mantine/notifications'
import { Alert, AlertProps } from '@mantine/core'
import { Lock, Warning } from '@phosphor-icons/react/dist/ssr'
import { FC, ReactNode } from 'react'
import { errorToString, isServerActionError } from '@/lib/errors'
import { captureException } from '@sentry/nextjs'

export * from '@/lib/errors'

export const reportError = (error: unknown, title = 'An error occurred') => {
    // TODO: consider whether we should send everything to sentry?
    if (isServerActionError(error)) {
        captureException(error)
    }
    notifications.show({
        color: 'red',
        title,
        message: errorToString(error),
    })
}

type ErrorAlertProps = { error: string | Error } & AlertProps

export const ErrorAlert: FC<ErrorAlertProps> = ({ icon = <Warning />, title = 'An error occurred', error }) => {
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
