'use client'

import { useForm, zodResolver, type FC, useMutation, useQueryClient } from '@/common'
import { Button, Textarea, TextInput, Select } from '@mantine/core'
import { updateOrgAction, insertOrgAction, fetchOrgsStatsAction } from '@/server/actions/org.actions'
import { orgSchema, type ValidatedOrg } from '@/schema/org'
import { type ActionSuccessType } from '@/lib/types'
import { reportError } from '@/components/errors'

type Org = Omit<ActionSuccessType<typeof fetchOrgsStatsAction>[number], 'totalStudies'>
type NewOrg = Omit<Org, 'id'>

// Transform org data to match form expectations
const getInitialValues = (orgData?: Org | NewOrg): ValidatedOrg => {
    if (!orgData) {
        return {
            slug: '',
            name: '',
            email: '',
            type: 'enclave',
            settings: { publicKey: '' },
            description: null,
        } as ValidatedOrg
    }

    // Handle both old and new formats
    if (orgData.type === 'enclave') {
        const settings = orgData.settings as { publicKey?: string } | null
        return {
            ...orgData,
            type: 'enclave',
            settings: { publicKey: settings?.publicKey || '' },
        } as ValidatedOrg
    } else {
        return {
            ...orgData,
            type: 'lab',
            settings: {},
        } as ValidatedOrg
    }
}

export const EditOrgForm: FC<{
    org?: Org | NewOrg
    onCompleteAction?: () => void
}> = ({ org, onCompleteAction }) => {
    const form = useForm<ValidatedOrg>({
        validate: zodResolver(orgSchema),
        initialValues: getInitialValues(org),
        validateInputOnBlur: true,
    })

    const queryClient = useQueryClient()

    const { isPending, mutate: upsertOrg } = useMutation({
        mutationFn: async (data: ValidatedOrg) => {
            if (org && 'id' in org) return await updateOrgAction({ id: org.id, ...data })
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

    const isEnclave = form.values.type === 'enclave'

    return (
        <form onSubmit={form.onSubmit((values) => upsertOrg(values))}>
            <TextInput
                label="Slug"
                placeholder="Enter slug"
                data-autofocus
                name="slug"
                key={form.key('slug')}
                disabled={org && 'id' in org && !!org.id}
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

            <Select
                label="Organization Type"
                description="Type determines the role of users in this organization"
                name="type"
                key={form.key('type')}
                data={[
                    { value: 'enclave', label: 'Enclave (Data Organization)' },
                    { value: 'lab', label: 'Lab (Research Organization)' },
                ]}
                {...form.getInputProps('type')}
                onChange={(value) => {
                    form.setFieldValue('type', value as 'enclave' | 'lab')
                    // Reset settings when type changes
                    if (value === 'enclave') {
                        form.setFieldValue('settings', { publicKey: '' })
                    } else {
                        form.setFieldValue('settings', {})
                    }
                }}
                required
            />

            {isEnclave && (
                <Textarea
                    label="Public Key"
                    resize="vertical"
                    description="Validates server authentication JWT"
                    placeholder="Enter your public key"
                    name="settings.publicKey"
                    key={form.key('settings.publicKey')}
                    {...form.getInputProps('settings.publicKey')}
                    required
                />
            )}

            <Button type="submit" fullWidth mt="md" loading={isPending}>
                Submit
            </Button>
        </form>
    )
}
