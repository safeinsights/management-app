'use client'

import { Input, Tooltip, UnstyledButton } from '@mantine/core'
import { IconCopy, IconCheck } from '@tabler/icons-react'
import { useClipboard } from '@mantine/hooks'

export const CopyingInput: React.FC<{ value: string }> = ({ value }) => {
    const clipboard = useClipboard({ timeout: 500 })

    return (
        <>
            <Input
                value={value}
                readOnly
                rightSectionPointerEvents="all"
                size="sm"
                my="sm"
                onFocus={(event) => event.target.select()}
                rightSection={
                    <Tooltip label={clipboard.copied ? 'Copied' : 'Copy code'} offset={10}>
                        <UnstyledButton type="button" onClick={() => clipboard.copy(value)} display="flex">
                            {clipboard.copied ? <IconCheck color="green" /> : <IconCopy />}
                        </UnstyledButton>
                    </Tooltip>
                }
            />
        </>
    )
}
