import { ActionIcon, Button, Flex, Popover, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, useState } from 'react'

export const SuretyGuard: FC<{
    children?: React.ReactNode
    message?: string
    onConfirmed: () => void | Promise<void>
}> = ({ message, children, onConfirmed }) => {
    const [opened, { close, open }] = useDisclosure(false)
    const [pending, setPending] = useState(false)

    const onConfirm = async () => {
        setPending(true)
        await onConfirmed()
        close()
        setPending(false)
    }

    return (
        <Popover width={300} trapFocus withArrow shadow="md" opened={opened} onChange={close} closeOnClickOutside>
            <Popover.Target>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={open} disabled={opened}>
                    {children || <TrashIcon />}
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <Flex align={'center'}>
                    <Text>{message || 'Are you sure? This cannot be undone.'}</Text>
                    <Button miw="80" variant="filled" color="red" onClick={onConfirm} loading={pending}>
                        Yes
                    </Button>
                </Flex>
            </Popover.Dropdown>
        </Popover>
    )
}
