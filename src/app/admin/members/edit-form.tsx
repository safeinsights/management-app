'use client'

import { Form as HookForm, useForm } from 'react-hook-form'
import { Button, Modal } from '@mantine/core'
import { insertMemberAction, updateMemberAction } from './actions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TextInput, Textarea } from 'react-hook-form-mantine'
import { zodResolver } from '@hookform/resolvers/zod'
import { schema, ValidatedMember, NewMember, Member } from './schema'

export const EditMemberForm: React.FC<{ member: Member | NewMember; onComplete: () => void }> = ({
    member,
    onComplete,
}) => {
    const { control } = useForm<ValidatedMember>({
        resolver: zodResolver(schema),
        defaultValues: member,
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
        <HookForm control={control} onSubmit={({ data }) => upsertMember(data)}>
            <TextInput
                label="Identifier"
                placeholder="Enter identifier"
                data-autofocus
                name="identifier"
                control={control}
                required
            />

            <TextInput label="Name" placeholder="Enter your name" name="name" control={control} required />

            <TextInput
                label="Email"
                placeholder="Enter your email"
                description="Used for study notifications"
                name="email"
                control={control}
                required
            />

            <Textarea
                label="Public Key"
                resize="vertical"
                description="Validates server authentication JWT"
                placeholder="Enter your public key"
                name="publicKey"
                control={control}
                required
            />

            <Button type="submit" fullWidth mt="md" loading={isPending}>
                Submit
            </Button>
        </HookForm>
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
