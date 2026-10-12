'use client'

import type { FC } from '@/common'
import { TextInput } from '@mantine/core'
import dayjs from 'dayjs'

// Kept a plain YYYY-MM-DD string; a Date would land a day early west of the server.
export const SignedOnInput: FC<{ value: string; onChange: (value: string) => void; error?: string }> = ({
    value,
    onChange,
    error,
}) => (
    <TextInput
        type="date"
        label="Signed on"
        description="The date the signatories signed the agreement"
        value={value}
        // Honored by the picker only, not manual entry. Stricter than schema (doesn't allow +1 day).
        max={dayjs().format('YYYY-MM-DD')}
        error={error}
        onChange={(event) => onChange(event.currentTarget.value)}
    />
)
