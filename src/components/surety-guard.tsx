import { Button, Popover, ActionIcon, Text, Flex } from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'

export const SuretyGuard: React.FC<{ children?: React.ReactNode; message?: string; onConfirmed: () => void }> = ({
    message,
    children,
    onConfirmed,
}) => {
    return (
        <Popover width={300} trapFocus withArrow shadow="md">
            <Popover.Target>
                <ActionIcon size="sm" variant="subtle" color="red">
                    {children || <IconTrash size={18} />}
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <Flex align={'center'}>
                    <Text>{message || 'Are you sure? This cannot be undone.'}</Text>
                    <Button miw="80" variant="filled" color="red" onClick={() => onConfirmed()}>
                        Yes
                    </Button>
                </Flex>
            </Popover.Dropdown>
        </Popover>
    )
}
