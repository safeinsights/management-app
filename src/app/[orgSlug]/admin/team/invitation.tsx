'use client'

import posthog from 'posthog-js'
import { useForm, useMutation, useQueryClient, zodResolver } from '@/common'
import { InputError, handleMutationErrorsWithForm } from '@/components/errors'
import { AppModal } from '@/components/modals/app-modal'
import { SuccessPanel } from '@/components/panel'
import { useSession } from '@/hooks/session'
import { Button } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { PlusIcon } from '@phosphor-icons/react/dist/ssr'
import { type FC, useState } from 'react'
import { orgAdminInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './invite-user.schema'
import { PendingUsers } from './pending-invites'
import { InviteFormView } from './invite-form-view'

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
    const { isLoaded } = useSession()

    const studyProposalForm = useForm({
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: {
            email: '',
            permission: '',
        },
    })

    const { mutate: inviteUser, isPending: isInviting } = useMutation({
        mutationFn: (invite: InviteUserFormValues) => orgAdminInviteUserAction({ invite, orgSlug }),
        onError: handleMutationErrorsWithForm(studyProposalForm),
        onSuccess(data, invite) {
            studyProposalForm.reset()
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgSlug] })
            posthog.capture('team_member_invited', {
                org_slug: orgSlug,
                permission: invite.permission,
                already_invited: data?.alreadyInvited ?? false,
            })
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
        <InviteFormView
            onSubmit={studyProposalForm.onSubmit((values) =>
                inviteUser({
                    ...values,
                    permission: values.permission as 'contributor' | 'admin',
                }),
            )}
            emailProps={studyProposalForm.getInputProps('email')}
            emailError={studyProposalForm.errors.email && <InputError error={studyProposalForm.errors.email} />}
            // Default 'input' type, not 'checkbox': with 'checkbox' Mantine returns `checked`
            // instead of `value`, which Radio.Group ignores, leaving the group uncontrolled so it
            // did not follow form state (a reset after a successful invite left the old choice
            // selected). `withError` defaults to true either way, so the error itself was never
            // the problem here (OTTER-647).
            permissionProps={studyProposalForm.getInputProps('permission')}
            permissionError={
                studyProposalForm.errors.permission && <InputError error={studyProposalForm.errors.permission} />
            }
            isSubmitting={isInviting}
            isSubmitDisabled={!studyProposalForm.isValid() || !isLoaded}
        />
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
