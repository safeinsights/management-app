import { showNotification } from '@mantine/notifications'
import { CheckCircle } from '@phosphor-icons/react/dist/ssr'

export const reportSuccess = (message: string, title = 'Success') => {
    showNotification({
        title,
        message,
        color: 'teal',
        icon: <CheckCircle size={18} />,
    })
}

export const reportMutationSuccess = (message: string, title = 'Success') => {
    return () => reportSuccess(message, title)
}
