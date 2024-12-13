import { notifications } from '@mantine/notifications'
import { Alert, AlertProps } from '@mantine/core'
import { IconError404, IconAlertTriangle, IconLockAccess } from '@tabler/icons-react'

type ClerkAPIErrorResponse = {
    errors: Array<{
        code: string
        message: string
        long_message: string
    }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isClerkApiError(error: any): error is ClerkAPIErrorResponse {
    return typeof error == 'object' && Array.isArray(error.errors) && error.errors?.[0].code
}

export const reportError = (error: object, title = 'An error occured') => {
    const message = isClerkApiError(error)
        ? error.errors.map((e: Record<string, string>) => `${e.message}: ${e.longMessage}`).join('\n')
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

export const AlertNotFound: React.FC<{ title: string; message: React.ReactNode; hideIf?: boolean }> = ({
    title,
    message,
    hideIf,
}) => {
    if (hideIf === true) return null

    return (
        <Alert w="400" m="auto" variant="filled" color="red" icon={<IconError404 />} title={title}>
            {message}
        </Alert>
    )
}
