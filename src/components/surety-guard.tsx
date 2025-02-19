import { ActionIcon, Button, Flex, Popover, Text } from '@mantine/core'
import { Trash } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'

export const SuretyGuard: FC<{ children?: React.ReactNode; message?: string; onConfirmed: () => void }> = ({
    message,
    children,
    onConfirmed,
}) => {
    return (
        <Popover width={300} trapFocus withArrow shadow="md">
            <Popover.Target>
                <ActionIcon size="sm" variant="subtle" color="red">
                    {children || <Trash />}
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
