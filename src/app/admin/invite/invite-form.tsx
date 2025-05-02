'use client'

import { TextInput, Button, Flex, Radio, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { adminInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema } from './admin-users.schema'
import { reportError } from '@/components/errors'
import { zodResolver } from 'mantine-form-zod-resolver'
import { FC, useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { randomString } from '@/lib/string'

const initialValues = (organizationId: string = '') => ({
    email: '',
    password: randomString(8),
    isResearcher: false,
    isReviewer: false,
    organizationId: organizationId,
})

export const InviteForm: FC<{ onCompleteAction?: () => void }> = ({ onCompleteAction }) => {
    const { user } = useUser()
    const [selectedRole, setSelectedRole] = useState('')

    const organizationId = user?.organizationMemberships?.[0]?.organization.id

    const studyProposalForm = useForm<InviteUserFormValues>({
        mode: 'controlled',
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: initialValues(),
    })

    useEffect(() => {
        if (organizationId) {
            studyProposalForm.setValues({
                ...studyProposalForm.values,
                organizationId: organizationId,
            })
            studyProposalForm.setInitialValues(initialValues(organizationId))
        }
    }, [organizationId])

    useEffect(() => {
        studyProposalForm.setFieldValue('isReviewer', selectedRole === 'multiple' || selectedRole === 'reviewer')
        studyProposalForm.setFieldValue('isResearcher', selectedRole === 'multiple' || selectedRole === 'researcher')
        studyProposalForm.validateField('isResearcher')
    }, [selectedRole])

    const { mutate: inviteUser, isPending } = useMutation({
        mutationFn: adminInviteUserAction,
        onError(error) {
            reportError(error)
        },
        onSuccess(info) {
            notifications.show({ message: `User invited successfully\nClerk ID: ${info.clerkId}`, color: 'green' })
            studyProposalForm.reset()
            onCompleteAction?.()
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

            <Button type="submit" mt="sm" loading={isPending} disabled={!studyProposalForm.isValid()}>
                Send invitation
            </Button>

            <hr style={{ margin: '32px 0', color: '#D9D9D9' }} />

            <div>
                <Text fw={600} mb="md">
                    Pending invitations
                </Text>
                {/* Placeholder for pending invitations list */}
                <Flex justify="space-between" align="center" mb="xs">
                    <Text size="sm">placeholder@example.com</Text>
                    <Button variant="outline" size="xs">
                        Re-invite
                    </Button>
                </Flex>
            </div>
        </form>
    )
}
