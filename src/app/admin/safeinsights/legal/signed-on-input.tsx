'use client'

import type { FC } from '@/common'
import { TextInput } from '@mantine/core'
import dayjs from 'dayjs'

// Kept a plain YYYY-MM-DD string; a Date would land a day early west of the server.
export const SignedOnInput: FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => (
    <TextInput
        type="date"
        label="Signed on"
        description="The date the signatories signed the agreement"
        value={value}
        max={dayjs().format('YYYY-MM-DD')}
        onChange={(event) => onChange(event.currentTarget.value)}
    />
)
