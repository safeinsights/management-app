'use client'

import { TextInput, Button, Flex, Radio, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { adminInviteUserAction, getPendingOrgUsersAction, reInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './admin-users.schema'
import { reportError } from '@/components/errors'
import { zodResolver } from 'mantine-form-zod-resolver'
import { FC, useEffect, useState } from 'react'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { randomString } from '@/lib/string'

const initialValues = (orgSlug: string = '') => ({
    email: '',
    password: randomString(8),
    isResearcher: false,
    isReviewer: false,
    orgSlug: orgSlug,
})

interface InviteFormProps {
    onCompleteAction?: () => void
    orgSlug: string
}

export const InviteForm: FC<InviteFormProps> = ({ onCompleteAction, orgSlug }) => {
    const queryClient = useQueryClient()
    const [selectedRole, setSelectedRole] = useState('')
    const [reinvitingEmail, setReinvitingEmail] = useState<string | null>(null)

    const { data: pendingUsers, isLoading: isLoadingPending } = useQuery({
        queryKey: ['pendingUsers', orgSlug],
        queryFn: () => getPendingOrgUsersAction({ orgSlug }),
        enabled: !!orgSlug,
    })

    const studyProposalForm = useForm<InviteUserFormValues>({
        mode: 'controlled',
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: initialValues(orgSlug),
    })

    useEffect(() => {
        if (orgSlug) {
            studyProposalForm.setValues({
                ...studyProposalForm.values,
                orgSlug: orgSlug,
            })
            studyProposalForm.setInitialValues(initialValues(orgSlug))
        }
    }, [orgSlug])

    useEffect(() => {
        studyProposalForm.setFieldValue('isReviewer', selectedRole === 'multiple' || selectedRole === 'reviewer')
        studyProposalForm.setFieldValue('isResearcher', selectedRole === 'multiple' || selectedRole === 'researcher')
        studyProposalForm.validateField('isResearcher')
    }, [selectedRole])

    const { mutate: inviteUser, isPending: isInviting } = useMutation({
        mutationFn: adminInviteUserAction,
        onError(error) {
            reportError(error)
        },
        onSuccess(info) {
            notifications.show({ message: `User invited successfully\nClerk ID: ${info.clerkId}`, color: 'green' })
            studyProposalForm.reset()
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgSlug] })
            onCompleteAction?.()
        },
    })

    const { mutate: reInviteUser, isPending: isReinviting } = useMutation({
        mutationFn: reInviteUserAction,
        onMutate: (variables) => {
            setReinvitingEmail(variables.email)
        },
        onError(error) {
            reportError(error)
        },
        onSuccess(_, variables) {
            notifications.show({ message: `Re-invitation sent to ${variables.email}`, color: 'green' })
        },
        onSettled: () => {
            setReinvitingEmail(null)
        },
    })

    return (
        <form onSubmit={studyProposalForm.onSubmit((values) => inviteUser(values))}>
            <TextInput
                label="Invite by email"
                placeholder="Enter email address"
                type="email"
                mb="sm"
                styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                {...studyProposalForm.getInputProps('email')}
                error={false}
            />
            {studyProposalForm.errors.email && (
                <Flex align="center" gap={4} my={2}>
                    <WarningCircle size={16} color="var(--mantine-color-error)" />
                    <Text c="red" size="xs">
                        {studyProposalForm.errors.email}
                    </Text>
                </Flex>
            )}
            <div style={{ marginBottom: '1rem', fontWeight: 600 }}>
                <Radio.Group
                    label="Assign Role"
                    styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                    value={selectedRole}
                    onChange={setSelectedRole}
                >
                    <Flex gap="md" mt="xs" direction="column">
                        <Radio value="multiple" label="Multiple (can switch between reviewer and researcher roles)" />
                        <Radio value="reviewer" label="Reviewer (can review and approve studies)" />
                        <Radio value="researcher" label="Researcher (can submit studies and access results)" />
                    </Flex>
                </Radio.Group>
            </div>

            <Button type="submit" mt="sm" loading={isInviting} disabled={!studyProposalForm.isValid()}>
                Send invitation
            </Button>

            <hr style={{ margin: '32px 0', color: '#D9D9D9' }} />

            <div>
                <Text fw={600} mb="md">
                    Pending invitations ({pendingUsers?.length ?? 0})
                </Text>
                {isLoadingPending && <Text size="sm">Loading pending invitations...</Text>}
                {!isLoadingPending && (!pendingUsers || pendingUsers.length === 0) && (
                    <Text size="sm" c="dimmed">
                        No pending invitations for this organization.
                    </Text>
                )}
                {pendingUsers && pendingUsers.length > 0 && (
                    <Flex direction="column" gap="xs">
                        {pendingUsers.map((user) => (
                            <Flex key={user.id} justify="space-between" align="center">
                                <Text size="sm" truncate>
                                    {user.email}
                                </Text>
                                <Button
                                    variant="outline"
                                    size="xs"
                                    onClick={() => reInviteUser({ email: user.email })}
                                    loading={isReinviting && reinvitingEmail === user.email}
                                    disabled={isReinviting}
                                >
                                    Re-invite
                                </Button>
                            </Flex>
                        ))}
                    </Flex>
                )}
            </div>
        </form>
    )
}
