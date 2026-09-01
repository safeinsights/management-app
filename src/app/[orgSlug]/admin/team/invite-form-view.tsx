'use client'

import type { ComponentPropsWithoutRef, FocusEvent, FormEventHandler, ReactNode } from 'react'
import { Button, Flex, Radio, TextInput } from '@mantine/core'
import { useWidgetBlur } from '@/components/form-field'

// Presentational only; ./invitation wires the form state and mutation in, so this renders in
// isolation (e.g. Ladle).
export type InviteFormViewProps = {
    onSubmit: FormEventHandler<HTMLFormElement>
    emailProps: Partial<ComponentPropsWithoutRef<typeof TextInput>>
    emailError?: ReactNode
    permissionProps: Partial<ComponentPropsWithoutRef<typeof Radio.Group>>
    permissionError?: ReactNode
    isSubmitting: boolean
    isSubmitDisabled: boolean
}

export function InviteFormView({
    onSubmit,
    emailProps,
    emailError,
    permissionProps,
    permissionError,
    isSubmitting,
    isSubmitDisabled,
}: InviteFormViewProps) {
    // Every radio is in the tab order until one is chosen, so an unguarded validating onBlur
    // flashes the error while the user moves between options (OTTER-647).
    const { onBlur: validatePermission, onFocus: touchPermission, ...permissionRest } = permissionProps
    const {
        ref: permissionRef,
        onFocus: enterPermissionGroup,
        onBlur: leavePermissionGroup,
    } = useWidgetBlur<HTMLDivElement>(validatePermission as (() => void) | undefined)

    const handlePermissionFocus = (event: FocusEvent<HTMLDivElement>) => {
        touchPermission?.(event)
        enterPermissionGroup()
    }

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

            <Flex mb="sm" fw="semibold" direction="column">
                <Radio.Group
                    label="Assign Permissions"
                    withAsterisk
                    styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                    name="permission"
                    {...permissionRest}
                    ref={permissionRef}
                    onFocus={handlePermissionFocus}
                    onBlur={leavePermissionGroup}
                    error={permissionError}
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
