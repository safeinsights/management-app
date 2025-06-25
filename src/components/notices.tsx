import { showNotification } from '@mantine/notifications'
import { CheckCircleIcon } from '@phosphor-icons/react'

export const reportSuccess = (message: string, title = 'Success') => {
    showNotification({
        title,
        message,
        color: 'teal',
        icon: <CheckCircleIcon size={18} />,
    })
}

export const reportMutationSuccess = (message: string, title = 'Success') => {
    return () => reportSuccess(message, title)
}
