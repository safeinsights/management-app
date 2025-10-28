'use client'

import { useForm, useMutation, useQueryClient, zodResolver } from '@/common'
import { InputError, handleMutationErrorsWithForm } from '@/components/errors'
import { AppModal } from '@/components/modal'
import { SuccessPanel } from '@/components/panel'
import { useSession } from '@/hooks/session'
import { Button, Flex, Radio, TextInput } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC, useState } from 'react'
import { orgAdminInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './invite-user.schema'
import { PendingUsers } from './pending-invites'

interface InviteFormProps {
    orgSlug: string
}

const InviteSuccess: FC<{ onContinue: () => void }> = ({ onContinue }) => {
    return (
        <SuccessPanel title="Invitation sent successfully!" onContinue={onContinue}>
            Continue to invite people
        </SuccessPanel>
    )
}

const InviteForm: FC<{ orgSlug: string; onInvited: () => void }> = ({ orgSlug, onInvited }) => {
    const queryClient = useQueryClient()
    const { session, isLoaded } = useSession()

    const studyProposalForm = useForm({
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: {
            email: '',
            permission: '',
        },
    })

    const { mutate: inviteUser, isPending: isInviting } = useMutation({
        mutationFn: (invite: InviteUserFormValues) =>
            orgAdminInviteUserAction({ invite, orgSlug, invitedByUserId: session?.user.id ?? '' }),
        onError: handleMutationErrorsWithForm(studyProposalForm),
        onSuccess(data) {
            studyProposalForm.reset()
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgSlug] })
            if (data?.alreadyInvited) {
                notifications.show({
                    color: 'green',
                    title: 'Invite resent',
                    message: 'This user has already been invited. Resending invite.',
                })
            } else {
                onInvited()
            }
        },
    })

    return (
        <form
            onSubmit={studyProposalForm.onSubmit((values) =>
                inviteUser({
                    ...values,
                    permission: values.permission as 'contributor' | 'admin',
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
            />

            <Flex mb="sm" fw="semibold">
                <Radio.Group
                    label="Assign Permissions"
                    styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                    name="permission"
                    {...studyProposalForm.getInputProps('permission', { type: 'checkbox' })}
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

            <Button
                type="submit"
                mt="sm"
                loading={isInviting}
                disabled={!studyProposalForm.isValid() || !isLoaded || !session}
            >
                Send invitation
            </Button>
        </form>
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

            <Button leftSection={<PlusIcon />} onClick={openInviteUser}>
                Invite People
            </Button>
        </>
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
            {!wasInvited && <PendingUsers orgSlug={orgSlug} />}
        </>
    )
}
