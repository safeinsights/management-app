'use client'

import { Button, Paper, Stack, Textarea } from '@mantine/core'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { LostKeyPopover } from '@/components/study/lost-key-popover'

export function SecurityKeyForm() {
    return (
        <Paper p="xxl">
            <Stack gap="lg">
                <FormSectionHeader
                    title="Security key"
                    description="This key is required to access the outputs. It was issued to you during sign-up."
                    required
                />
                <Textarea
                    autoComplete="off"
                    aria-required
                    styles={{ input: { minHeight: 72, borderColor: 'var(--mantine-color-blue-7)' } }}
                    maw={800}
                />
                <div>
                    <Button size="sm">View</Button>
                </div>
                <LostKeyPopover />
            </Stack>
        </Paper>
    )
}
