'use client'

import { TextInput, Button, Flex, Radio } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { orgAdminInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './invite-user.schema'
import { InputError, reportMutationError } from '@/components/errors'
import { Plus } from '@phosphor-icons/react/dist/ssr'
import { AppModal } from '@/components/modal'
import { zodResolver } from 'mantine-form-zod-resolver'
import { FC } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { PendingUsers } from './pending-users'

interface InviteFormProps {
    orgSlug: string
}

export const InviteForm: FC<InviteFormProps> = ({ orgSlug }) => {
    const queryClient = useQueryClient()

    const studyProposalForm = useForm({
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: {
            email: '',
            role: 'multiple',
        },
    })

    const { mutate: inviteUser, isPending: isInviting } = useMutation({
        mutationFn: (invite: InviteUserFormValues) => orgAdminInviteUserAction({ invite, orgSlug }),
        onError: reportMutationError,
        onSuccess() {
            notifications.show({
                message: 'User invited successfully',
                color: 'green',
            })
            studyProposalForm.reset()
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgSlug] })
        },
    })

    const onSubmit = studyProposalForm.onSubmit((values) =>
        inviteUser({
            ...values,
            role: values.role as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        }),
    )

    return (
        <form onSubmit={onSubmit}>
            <TextInput
                label="Invite by email"
                placeholder="Enter email address"
                type="email"
                mb="md"
                size="md"
                {...studyProposalForm.getInputProps('email')}
                error={studyProposalForm.errors.email && <InputError error={studyProposalForm.errors.email} />}
                data-autofocus
            />
            <Flex mb="sm" fw="semibold">
                <Radio.Group
                    label="Assign Role"
                    styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                    name="role"
                    {...studyProposalForm.getInputProps('role', { type: 'checkbox' })}
                >
                    <Flex gap="md" mt="xs" direction="column">
                        <Radio value="multiple" label="Multiple (can switch between reviewer and researcher roles)" />
                        <Radio value="reviewer" label="Reviewer (can review and approve studies)" />
                        <Radio value="researcher" label="Researcher (can submit studies and access results)" />
                    </Flex>
                </Radio.Group>
            </Flex>

            <Button type="submit" mt="sm" loading={isInviting}>
                Send invitation
            </Button>

            <PendingUsers orgSlug={orgSlug} />
        </form>
    )
}

export const InviteButton: React.FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const [inviteUserOpened, { open: openInviteUser, close: closeInviteUser }] = useDisclosure(false)

    return (
        <>
            <AppModal
                isOpen={inviteUserOpened}
                onClose={closeInviteUser}
                title="Invite others to join your team"
                size="lg"
            >
                <InviteForm orgSlug={orgSlug} />
            </AppModal>

            <Button leftSection={<Plus />} onClick={openInviteUser}>
                Invite People
            </Button>
        </>
    )
}
