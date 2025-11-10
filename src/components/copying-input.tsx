'use client'

import { Input, UnstyledButton } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import { CheckIcon, CopyIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { InfoTooltip } from './tooltip'

export const CopyingInput: FC<{ value: string; tooltipLabel?: string }> = ({ value, tooltipLabel = 'Copy code' }) => {
    const clipboard = useClipboard({ timeout: 500 })

    return (
        <Input
            value={value}
            styles={{ input: { cursor: 'pointer', backgroundColor: '#eaedff' } }}
            readOnly
            rightSectionPointerEvents="all"
            size="sm"
            onFocus={(event) => event.target.select()}
            rightSection={
                <InfoTooltip label={clipboard.copied ? 'Copied' : tooltipLabel} offset={10}>
                    <UnstyledButton type="button" onClick={() => clipboard.copy(value)} display="flex">
                        {clipboard.copied ? <CheckIcon color="green" /> : <CopyIcon />}
                    </UnstyledButton>
                </InfoTooltip>
            }
        />
    )
}
