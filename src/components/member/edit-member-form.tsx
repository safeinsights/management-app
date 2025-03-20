'use client'

import { useForm } from '@mantine/form'
import { Button, Textarea, TextInput } from '@mantine/core'
import { upsertMemberAction } from '@/server/actions/member-actions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Member, memberSchema, NewMember, ValidatedMember, zodResolver } from '@/schema/member'
import { FC } from 'react'

export const EditMemberForm: FC<{
  member: Member | NewMember
  onCompleteAction?: () => void
  onError?: (err: string) => void
}> = ({ member, onCompleteAction, onError }) => {
  const form = useForm<ValidatedMember>({
    validate: zodResolver(memberSchema),
    initialValues: member,
  })

  const queryClient = useQueryClient()

  const { isPending, mutate: upsertMember } = useMutation({
    mutationFn: async (data: ValidatedMember) => await upsertMemberAction(data),
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update member'
      onError?.(errorMessage)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      onCompleteAction?.()
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
                disabled={'id' in member && !!member.id}
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
