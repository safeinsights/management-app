'use client'

import { Button, Paper, Stack } from '@mantine/core'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'

export function SecurityKeyForm() {
    return (
        <Paper p="xxl">
            <Stack gap="lg">
                <FormSectionHeader
                    title="Security key"
                    description="This key is required to access the outputs. It was issued to you during sign-up."
                    required
                />
                <SecurityKeyInput />
                <div>
                    <Button size="sm">View</Button>
                </div>
                <LostKeyPopover />
            </Stack>
        </Paper>
    )
}
