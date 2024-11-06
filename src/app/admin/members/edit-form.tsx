'use client'

import { useForm } from '@mantine/form'
import { Button, Modal, TextInput, Textarea  } from '@mantine/core'
import { insertMemberAction, updateMemberAction } from './actions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { zodResolver, schema, ValidatedMember, NewMember, Member } from './schema'

export const EditMemberForm: React.FC<{ member: Member | NewMember; onComplete: () => void }> = ({
    member,
    onComplete,
}) => {
    const form = useForm<ValidatedMember>({
        validate: zodResolver(schema),
        initialValues: member,
    })

    const queryClient = useQueryClient()

    const { isPending, mutate: upsertMember } = useMutation({
        mutationFn: async (data: ValidatedMember) => {
            return await (member.createdAt ? updateMemberAction(member.identifier, data) : insertMemberAction(data))
        },
        onSettled: async () => {
            const result = await queryClient.invalidateQueries({ queryKey: ['members'] })
            onComplete()
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
                {...form.getInputProps('identifier')}
                required
            />

            <TextInput label="Name" placeholder="Enter your name" name="name"
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

export const EditModal: React.FC<{ editing: Member | NewMember | null; onComplete: () => void }> = ({
    editing,
    onComplete,
}) => {
    return (
        <Modal opened={!!editing} onClose={onComplete} title={editing ? 'Edit Member' : 'Add new Member'}>
            {editing && <EditMemberForm member={editing} onComplete={onComplete} />}
        </Modal>
    )
}
