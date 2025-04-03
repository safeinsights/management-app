'use client'

import { Input, Tooltip, UnstyledButton } from '@mantine/core'
import { Check, Copy } from '@phosphor-icons/react/dist/ssr'
import { useClipboard } from '@mantine/hooks'
import { FC } from 'react'

export const CopyingInput: FC<{ value: string; tooltipLabel?: string }> = ({ value, tooltipLabel = 'Copy code' }) => {
    const clipboard = useClipboard({ timeout: 500 })

    return (
        <Input
            value={value}
            styles={{ input: { cursor: 'pointer', backgroundColor: '#eaedff' } }}
            readOnly
            rightSectionPointerEvents="all"
            size="sm"
            my="sm"
            onFocus={(event) => event.target.select()}
            rightSection={
                <Tooltip label={clipboard.copied ? 'Copied' : tooltipLabel} offset={10}>
                    <UnstyledButton type="button" onClick={() => clipboard.copy(value)} display="flex">
                        {clipboard.copied ? <Check color="green" /> : <Copy />}
                    </UnstyledButton>
                </Tooltip>
            }
        />
    )
}
