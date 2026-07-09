'use client'

import type { ComponentPropsWithoutRef, FormEventHandler, ReactNode } from 'react'
import { Button, Flex, Radio, TextInput } from '@mantine/core'

// Presentational layout for the "Invite People" form: email input + Contributor /
// Administrator radios + "Send invitation" button. It owns no form state, mutation, or
// session — the container (./invitation) wires Mantine form props and the invite mutation
// in via the props below, so this renders in isolation (e.g. Ladle).
export type InviteFormViewProps = {
    onSubmit: FormEventHandler<HTMLFormElement>
    emailProps: Partial<ComponentPropsWithoutRef<typeof TextInput>>
    emailError?: ReactNode
    permissionProps: Partial<ComponentPropsWithoutRef<typeof Radio.Group>>
    isSubmitting: boolean
    isSubmitDisabled: boolean
}

export function InviteFormView({
    onSubmit,
    emailProps,
    emailError,
    permissionProps,
    isSubmitting,
    isSubmitDisabled,
}: InviteFormViewProps) {
    return (
        <form onSubmit={onSubmit}>
            <TextInput
                label="Invite by email"
                placeholder="Enter email address"
                type="email"
                mb="md"
                size="md"
                {...emailProps}
                error={emailError}
            />

            <Flex mb="sm" fw="semibold">
                <Radio.Group
                    label="Assign Permissions"
                    styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                    name="permission"
                    {...permissionProps}
                >
                    <Flex gap="md" mt="xs" direction="column">
                        <Radio
                            value="contributor"
                            label="Contributor (full access within their role; no admin privileges)"
                        />
                        <Radio value="admin" label="Administrator (manages org-level settings and contributors)" />
                    </Flex>
                </Radio.Group>
            </Flex>

            <Button type="submit" mt="sm" loading={isSubmitting} disabled={isSubmitDisabled}>
                Send invitation
            </Button>
        </form>
    )
}
