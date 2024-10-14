import { Alert } from '@mantine/core'
import { IconError404 } from '@tabler/icons-react'

export const AlertNotFound: React.FC<{ title: string; message: React.ReactNode; hideIf?: boolean }> = ({
    title,
    message,
    hideIf,
}) => {
    if (!hideIf) return null

    return (
        <Alert w="400" m="auto" variant="filled" color="red" icon={<IconError404 />} title={title}>
            {message}
        </Alert>
    )
}
