'use client'

import { useForm } from '@mantine/form'
import { Button, Textarea, TextInput } from '@mantine/core'
import { upsertMemberAction } from '@/server/actions/member-actions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Member, memberSchema, ValidatedMember, zodResolver } from '@/schema/member'
import { FC } from 'react'

export const EditMemberForm: FC<{ member: Member; onCompleteAction?: () => void }> = ({ member, onCompleteAction }) => {
    const form = useForm<ValidatedMember>({
        validate: zodResolver(memberSchema),
        initialValues: member,
    })

    const queryClient = useQueryClient()

    const { isPending, mutate: upsertMember } = useMutation({
        mutationFn: async (data: ValidatedMember) => {
            return await upsertMemberAction(data)
            // return await (member.createdAt ? updateMemberAction(member.identifier, data) : insertMemberAction(data))
        },
        onSettled: async () => {
            const result = await queryClient.invalidateQueries({ queryKey: ['members'] })
            onCompleteAction?.()
            return result
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => upsertMember(values))}>
            <TextInput
                label="Identifier"
                placeholder="Enter identifier"
                data-autofocus
                name="identifier"
                key={form.key('identifier')}
                disabled={!!member.id}
                {...form.getInputProps('identifier')}
                required
            />

            <TextInput
                label="Name"
                placeholder="Enter your name"
                name="name"
                key={form.key('name')}
                {...form.getInputProps('name')}
                required
            />

            <TextInput
                label="Email"
                placeholder="Enter your email"
                description="Used for study notifications"
                name="email"
                key={form.key('email')}
                {...form.getInputProps('email')}
                required
            />

            <Textarea
                label="Public Key"
                resize="vertical"
                description="Validates server authentication JWT"
                placeholder="Enter your public key"
                name="publicKey"
                key={form.key('publicKey')}
                {...form.getInputProps('publicKey')}
                required
            />

            <Button type="submit" fullWidth mt="md" loading={isPending}>
                Submit
            </Button>
        </form>
    )
}
