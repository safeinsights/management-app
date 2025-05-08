'use client'

import { useForm } from '@mantine/form'
import { Button, Textarea, TextInput } from '@mantine/core'
import { upsertOrgAction } from '@/server/actions/org.actions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Org, orgSchema, NewOrg, ValidatedOrg } from '@/schema/org'
import { FC } from 'react'
import { zodResolver } from 'mantine-form-zod-resolver'

export const EditOrgForm: FC<{
    org: Org | NewOrg
    onCompleteAction?: () => void
}> = ({ org, onCompleteAction }) => {
    const form = useForm<ValidatedOrg>({
        validate: zodResolver(orgSchema),
        initialValues: org,
    })

    const queryClient = useQueryClient()

    const { isPending, mutate: upsertOrg } = useMutation({
        mutationFn: async (data: ValidatedOrg) => await upsertOrgAction(data),
        onError: (error: unknown) => {
            reportError(error)
        },
        onSettled: async () => {
            await queryClient.invalidateQueries({ queryKey: ['orgs'] })
            onCompleteAction?.()
        },
    })

    return (
        <form onSubmit={form.onSubmit((values) => upsertOrg(values))}>
            <TextInput
                label="Slug"
                placeholder="Enter org slug"
                data-autofocus
                name="slug"
                key={form.key('slug')}
                disabled={'id' in org && !!org.id}
                {...form.getInputProps('slug')}
                required
            />

            <TextInput
                label="Name"
                placeholder="Enter org name"
                name="name"
                key={form.key('name')}
                {...form.getInputProps('name')}
                required
            />

            <TextInput
                label="Email"
                placeholder="Enter org contact email"
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
