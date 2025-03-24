'use client'

import { TextInput, PasswordInput, Button, Input, Checkbox, Text, Flex } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { OrganizationSelect } from './organization-select'
import Link from 'next/link'
import { adminInviteUserAction } from './admin-users.actions'
import { InviteUserFormValues, inviteUserSchema, zodResolver } from './admin-users.schema'
import { randomString } from '@/lib/string'
import { reportError } from '@/components/errors'

export function InviteForm() {
    const studyProposalForm = useForm<InviteUserFormValues>({
        mode: 'uncontrolled',
        validate: zodResolver(inviteUserSchema),
        validateInputOnBlur: true,
        initialValues: {
            firstName: '',
            lastName: '',
            email: '',
            organizationId: '',
            password: randomString(8),
            isReviewer: false,
            isResearcher: false,
        },
    })

    const { mutate: inviteUser, isPending } = useMutation({
        mutationFn: adminInviteUserAction,

        onSettled(result, error) {
            if (error) {
                reportError(error)
            } else if (result) {
                notifications.show({ message: 'User invited successfully', color: 'green' })
                studyProposalForm.reset()
            }
        },
    })

    return (
        <form onSubmit={studyProposalForm.onSubmit((values) => inviteUser(values))}>
            <Flex align={'end'} justify={'space-between'} mb="sm" gap="md">
                <OrganizationSelect {...studyProposalForm.getInputProps('organizationId')} />

                <Link href="/admin/organization" style={{ textDecoration: 'none' }}>
                    <Button variant="outline">New</Button>
                </Link>
            </Flex>
            <TextInput
                withAsterisk
                label="First Name"
                placeholder="Enter first name"
                mb="sm"
                {...studyProposalForm.getInputProps('firstName')}
            />
            <TextInput
                label="Last Name"
                placeholder="Enter last name"
                withAsterisk
                mb="sm"
                {...studyProposalForm.getInputProps('lastName')}
            />
            <div style={{ marginBottom: '1rem' }}>
                <Text fw={500} size="sm" mb={5}>
                    Roles (select at least one)
                </Text>
                <Flex direction="column" gap="sm">
                    <Flex gap="md">
                        <Checkbox label="Reviewer" {...studyProposalForm.getInputProps('isReviewer')} />
                        <Checkbox label="Researcher" {...studyProposalForm.getInputProps('isResearcher')} />
                    </Flex>
                    <Input.Error>{studyProposalForm.errors.role}</Input.Error>
                </Flex>
            </div>
            <TextInput
                label="Email Address"
                withAsterisk
                placeholder="Enter email address"
                type="email"
                mb="sm"
                {...studyProposalForm.getInputProps('email')}
            />
            <PasswordInput
                label="Password"
                withAsterisk
                visible
                placeholder="Enter password"
                mb="sm"
                {...studyProposalForm.getInputProps('password')}
            />
            <Button type="submit" mt="md" fullWidth loading={isPending}>
                Invite
            </Button>
        </form>
    )
}
