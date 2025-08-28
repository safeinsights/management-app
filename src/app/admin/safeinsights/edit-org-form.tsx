'use client'

import { useForm, zodResolver, type FC, useMutation, useQueryClient } from '@/components/common'
import { Button, Textarea, TextInput } from '@mantine/core'
import { updateOrgAction, insertOrgAction, fetchOrgsStatsAction } from '@/server/actions/org.actions'
import { orgSchema, type ValidatedOrg } from '@/schema/org'
import { type ActionSuccessType } from '@/lib/types'
import { reportError } from '@/components/errors'

type Org = Omit<ActionSuccessType<typeof fetchOrgsStatsAction>[number], 'totalStudies'>
type NewOrg = Omit<Org, 'id'>

export const EditOrgForm: FC<{
    org: Org | NewOrg
    onCompleteAction?: () => void
}> = ({ org, onCompleteAction }) => {
    const form = useForm<ValidatedOrg>({
        validate: zodResolver(orgSchema),
        initialValues: org,
        validateInputOnBlur: true,
    })

    const queryClient = useQueryClient()

    const { isPending, mutate: upsertOrg } = useMutation({
        mutationFn: async (data: ValidatedOrg) => {
            if ('id' in org) return await updateOrgAction({ id: org.id, ...data })
            return await insertOrgAction(data)
        },
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
                placeholder="Enter slug"
                data-autofocus
                name="slug"
                key={form.key('slug')}
                disabled={'id' in org && !!org.id}
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
