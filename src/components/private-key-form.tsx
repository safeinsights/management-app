'use client'

import type { FC, FormEventHandler } from 'react'
import { Button, Group, Stack, Text, Textarea } from '@mantine/core'
import type { UseFormReturnType } from '@mantine/form'

export type PrivateKeyFormValues = { privateKey: string }

type PrivateKeyFormProps = {
    isVisible?: boolean
    form: UseFormReturnType<PrivateKeyFormValues>
    onSubmit: FormEventHandler<HTMLFormElement>
    isDecrypting: boolean
    isDisabled?: boolean
    submitLabel: string
}

// Private-key entry form shared by the reviewer decrypt panel (encrypted-files-panel.tsx) and the
// researcher results view (job-results.tsx). The key never leaves the browser — it only feeds
// useDecryptFiles. "Results Key" is the role-neutral term: the same kind of key decrypts for
// reviewers and researchers alike.
export const PrivateKeyForm: FC<PrivateKeyFormProps> = ({
    isVisible = true,
    form,
    onSubmit,
    isDecrypting,
    isDisabled = false,
    submitLabel,
}) => {
    if (!isVisible) return null

    return (
        <form onSubmit={onSubmit}>
            <Stack>
                <Textarea
                    label={<Text mb="sm">Enter your Results Key</Text>}
                    resize="vertical"
                    placeholder="Enter your Results Key to access encrypted content."
                    {...form.getInputProps('privateKey')}
                    key={form.key('privateKey')}
                />
                <Group>
                    <Button type="submit" disabled={!form.isValid() || isDisabled} loading={isDecrypting}>
                        {submitLabel}
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}
