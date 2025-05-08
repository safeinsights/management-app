'use client'

import { useDisclosure } from '@mantine/hooks'
import { Divider, TextInput, Button, Flex, Radio, useMantineTheme, Anchor, Text } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@mantine/form'
import { orgAdminInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './invite-user.schema'
import { InputError, reportMutationError } from '@/components/errors'
import { CheckCircle, Plus } from '@phosphor-icons/react/dist/ssr'
import { AppModal } from '@/components/modal'
import { zodResolver } from 'mantine-form-zod-resolver'
import { type FC, useState } from 'react'

import { PendingUsers } from './pending-invites'

interface InviteFormProps {
    orgSlug: string
}

const InviteSuccess: FC<{ onContinue: () => void }> = ({ onContinue }) => {
    const theme = useMantineTheme()

    return (
        <Flex direction="column" justify="center" align="center" gap="xs" mb="sm" fw="semibold">
            <CheckCircle size={28} color={theme.colors.green[9]} weight="fill" />
            <Text c="green.9" size="md" fw="bold">
                Invitation sent successfully!
            </Text>
            <Anchor component="button" mt={16} size="sm" c="blue.8" fw={600} onClick={onContinue}>
                Continue to invite people
            </Anchor>
        </Flex>
    )
}

const InviteForm: FC<{ orgSlug: string; onInvited: () => void }> = ({ orgSlug, onInvited }) => {
    const queryClient = useQueryClient()

    const studyProposalForm = useForm({
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: {
            email: '',
            role: '',
        },
    })

    const { mutate: inviteUser, isPending: isInviting } = useMutation({
        mutationFn: (invite: InviteUserFormValues) => orgAdminInviteUserAction({ invite, orgSlug }),
        onError: (error) => {
            reportMutationError(error)
        },
        onSuccess() {
            studyProposalForm.reset()
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgSlug] })
            onInvited()
        },
    })

    return (
        <form
            onSubmit={studyProposalForm.onSubmit((values) =>
                inviteUser({
                    ...values,
                    role: values.role as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                }),
            )}
        >
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

            <Button type="submit" mt="sm" loading={isInviting} disabled={!studyProposalForm.isValid()}>
                Send invitation
            </Button>
        </form>
    )
}

const InvitePanel: FC<InviteFormProps> = ({ orgSlug }) => {
    const [wasInvited, setWasInvited] = useState(false)

    const body = wasInvited ? (
        <InviteSuccess onContinue={() => setWasInvited(false)} />
    ) : (
        <InviteForm orgSlug={orgSlug} onInvited={() => setWasInvited(true)} />
    )

    return (
        <>
            {body}
            <Divider c="charcoal.1" my="xl" />
            <PendingUsers orgSlug={orgSlug} />
        </>
    )
}

export const InviteButton: FC<{ orgSlug: string }> = ({ orgSlug }) => {
    const [inviteUserOpened, { open: openInviteUser, close: closeInviteUser }] = useDisclosure(false)

    return (
        <>
            <AppModal
                isOpen={inviteUserOpened}
                onClose={closeInviteUser}
                title="Invite others to join your team"
                size="lg"
            >
                <InvitePanel orgSlug={orgSlug} />
            </AppModal>

            <Button leftSection={<Plus />} onClick={openInviteUser}>
                Invite People
            </Button>
        </>
    )
}
