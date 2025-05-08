'use client'

import { TextInput, Button, Flex, Radio, useMantineTheme, Text, Anchor } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { adminInviteUserAction, getPendingUsersAction, reInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './admin-users.schema'
import { InputError, reportError } from '@/components/errors'
import { zodResolver } from 'mantine-form-zod-resolver'
import { FC, useEffect, useState } from 'react'
import { randomString } from '@/lib/string'
import { PendingUsers } from './pending-users'
import { CheckCircle } from '@phosphor-icons/react/dist/ssr'

const initialValues = (orgId: string = '') => ({
    email: '',
    password: randomString(8),
    isResearcher: false,
    isReviewer: false,
    orgId: orgId,
})

interface InviteFormProps {
    orgId: string
}

export const InviteForm: FC<InviteFormProps> = ({ orgId }) => {
    const theme = useMantineTheme()
    const queryClient = useQueryClient()
    const [selectedRole, setSelectedRole] = useState('')
    const [reinvitingEmail, setReinvitingEmail] = useState<string | null>(null)
    const [isInviteSuccessful, setIsInviteSuccessful] = useState(false)

    const { data: pendingUsers = [], isLoading: isLoadingPending } = useQuery({
        queryKey: ['pendingUsers', orgId],
        queryFn: () => getPendingUsersAction({ orgId }),
        enabled: !!orgId,
    })

    const studyProposalForm = useForm<InviteUserFormValues>({
        mode: 'controlled',
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: initialValues(orgId),
    })

    useEffect(() => {
        if (orgId) {
            studyProposalForm.setValues({
                ...studyProposalForm.values,
                orgId: orgId,
            })
            studyProposalForm.setInitialValues(initialValues(orgId))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orgId])

    useEffect(() => {
        studyProposalForm.setFieldValue('isReviewer', selectedRole === 'multiple' || selectedRole === 'reviewer')
        studyProposalForm.setFieldValue('isResearcher', selectedRole === 'multiple' || selectedRole === 'researcher')
        studyProposalForm.validateField('isResearcher')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRole])

    const { mutate: inviteUser, isPending: isInviting } = useMutation({
        mutationFn: adminInviteUserAction,
        onError(error) {
            reportError(error)
            setIsInviteSuccessful(false)
        },
        onSuccess(info) {
            if ('clerkId' in info) {
                setIsInviteSuccessful(true)
            } else {
                notifications.show({ message: `Re-invitation sent successfully`, color: 'green' })
            }
            studyProposalForm.reset()
            queryClient.invalidateQueries({ queryKey: ['pendingUsers', orgId] })
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
            {isInviteSuccessful ? (
                <>
                    <Flex direction="column" justify="center" align="center" gap="xs" mb="sm" fw="semibold">
                        <CheckCircle size={28} color={theme.colors.green[9]} weight="fill" />
                        <Text c="green.9" size="md" fw="bold">
                            Invitation sent successfully!
                        </Text>
                        <Anchor
                            component="button"
                            mt={16}
                            size="sm"
                            c="blue.8"
                            fw={600}
                            onClick={() => setIsInviteSuccessful(false)}
                        >
                            Continue to invite people
                        </Anchor>
                    </Flex>
                </>
            ) : (
                <>
                    <TextInput
                        label="Invite by email"
                        placeholder="Enter email address"
                        type="email"
                        mb="sm"
                        styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                        {...studyProposalForm.getInputProps('email')}
                        error={studyProposalForm.errors.email && <InputError error={studyProposalForm.errors.email} />}
                    />
                    <Flex mb="sm" fw="semibold">
                        <Radio.Group
                            label="Assign Role"
                            styles={{ label: { fontWeight: 600, marginBottom: 4 } }}
                            value={selectedRole}
                            onChange={setSelectedRole}
                        >
                            <Flex gap="md" mt="xs" direction="column">
                                <Radio
                                    value="multiple"
                                    label="Multiple (can switch between reviewer and researcher roles)"
                                />
                                <Radio value="reviewer" label="Reviewer (can review and approve studies)" />
                                <Radio value="researcher" label="Researcher (can submit studies and access results)" />
                            </Flex>
                        </Radio.Group>
                    </Flex>

                    <Button type="submit" mt="sm" loading={isInviting} disabled={!studyProposalForm.isValid()}>
                        Send invitation
                    </Button>

                    <PendingUsers
                        pendingUsers={pendingUsers}
                        isLoadingPending={isLoadingPending}
                        reInviteUser={reInviteUser}
                        isReinviting={isReinviting}
                        reinvitingEmail={reinvitingEmail}
                    />
                </>
            )}
        </form>
    )
}
