'use client'

import { useForm } from '@mantine/form'
import { Button, Textarea, TextInput } from '@mantine/core'
import { upsertMemberAction } from '@/server/actions/member.actions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Member, memberSchema, NewMember, ValidatedMember } from '@/schema/member'
import { FC } from 'react'
import { zodResolver } from 'mantine-form-zod-resolver'

export const EditMemberForm: FC<{
    member: Member | NewMember
    onCompleteAction?: () => void
}> = ({ member, onCompleteAction }) => {
    const form = useForm<ValidatedMember>({
        validate: zodResolver(memberSchema),
        initialValues: member,
    })

    const queryClient = useQueryClient()

    const { isPending, mutate: upsertMember } = useMutation({
        mutationFn: async (data: ValidatedMember) => await upsertMemberAction(data),
        onError: (error: unknown) => {
            reportError(error)
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: ['members'] })
            onCompleteAction?.()
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => upsertMember(values))}>
            <TextInput
                label="Slug"
                placeholder="Enter slug"
                data-autofocus
                name="slug"
                key={form.key('slug')}
                disabled={'id' in member && !!member.id}
                {...form.getInputProps('slug')}
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
