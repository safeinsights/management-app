import { notifications } from '@mantine/notifications'
import { Alert, AlertProps } from '@mantine/core'
import { IconAlertTriangle, IconLockAccess } from '@tabler/icons-react'

type ClerkAPIErrorResponse = {
    errors: Array<{
        code: string
        message: string
        long_message: string
    }>
}

export function isClerkApiError(error: any): error is ClerkAPIErrorResponse {
    return typeof error == 'object' && Array.isArray(error.errors) && error.errors?.[0].code
}

export const reportError = (error: any, title = 'An error occured') => {
    const message = isClerkApiError(error)
        ? error.errors.map((e: any) => `${e.message}: ${e.longMessage}`).join('\n')
        : JSON.stringify(error, null, 2)

    console.error('Error:', message)

    notifications.show({
        color: 'red',
        title,
        message,
    })
}

type ErrorAlertProps = { error: string | Error } & AlertProps

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
    icon = <IconAlertTriangle />,
    title = 'An error occured',
    error,
}) => {
    return (
        <Alert variant="light" color="red" title={title} icon={icon}>
            {error.toString()}
        </Alert>
    )
}

type AccessDeniedAlertProps = { message?: string } & Omit<AlertProps, 'title'>

export const AccessDeniedAlert: React.FC<AccessDeniedAlertProps> = ({
    icon = <IconLockAccess />,
    message = 'You do not have permission to access this resource.',
    ...props
}) => {
    return (
        <Alert variant="light" color="yellow" title="Access Denied" icon={icon} {...props}>
            {message}
        </Alert>
    )
}
