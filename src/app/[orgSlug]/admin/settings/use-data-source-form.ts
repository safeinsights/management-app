'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { useParams } from 'next/navigation'
import { createOrgDataSourceAction, fetchOrgDataSourcesAction, updateOrgDataSourceAction } from './data-sources.actions'
import { dataSourceFormSchema, createOrgDataSourceSchema, editOrgDataSourceSchema } from './data-sources.schema'
import { ActionSuccessType } from '@/lib/types'

type DataSource = ActionSuccessType<typeof fetchOrgDataSourcesAction>[number]
type FormValues = z.infer<typeof dataSourceFormSchema>
type CreateFormValues = z.infer<typeof createOrgDataSourceSchema>
type EditFormValues = z.infer<typeof editOrgDataSourceSchema>

export function useDataSourceForm(dataSource: DataSource | undefined, onCompleteAction: () => void) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const isEditMode = !!dataSource

    const form = useForm<FormValues>({
        initialValues: {
            name: dataSource?.name || '',
            description: dataSource?.description || '',
            urls:
                dataSource?.urls.map((u) => ({
                    id: u.id,
                    url: u.url ?? '',
                    description: u.description ?? '',
                })) || [],
            newUrl: '',
            newUrlDescription: '',
        },
        validate: zodResolver(dataSourceFormSchema),
    })

    const addUrl = () => {
        form.setValues({
            ...form.values,
            urls: [...form.values.urls, { url: form.values.newUrl, description: form.values.newUrlDescription }],
            newUrl: '',
            newUrlDescription: '',
        })
    }

    const updateUrl = (index: number, url: string) => {
        const updated = [...form.values.urls]
        updated[index] = { ...updated[index], url }
        form.setFieldValue('urls', updated)
    }

    const updateUrlDescription = (index: number, description: string) => {
        const updated = [...form.values.urls]
        updated[index] = { ...updated[index], description }
        form.setFieldValue('urls', updated)
    }

    const removeUrl = (index: number) => {
        form.setFieldValue(
            'urls',
            form.values.urls.filter((_, i) => i !== index),
        )
    }

    const { mutate: save, isPending } = useMutation({
        mutationFn: async (values: CreateFormValues | EditFormValues) => {
            if (isEditMode) {
                return updateOrgDataSourceAction({ orgSlug, dataSourceId: dataSource.id, ...values })
            }
            return createOrgDataSourceAction({ orgSlug, ...values })
        },
        onSuccess: () => {
            reportSuccess(isEditMode ? 'Data source updated successfully' : 'Data source added successfully')
            onCompleteAction()
        },
        onError: reportMutationError(isEditMode ? 'Failed to update data source' : 'Failed to add data source'),
    })

    const onSubmit = form.onSubmit(({ newUrl, newUrlDescription, ...values }) => {
        if (newUrl !== '' || newUrlDescription !== '') {
            values = {
                ...values,
                urls: [...form.values.urls, { url: form.values.newUrl, description: form.values.newUrlDescription }],
            }
        }
        save(values)
    })

    return {
        form,
        isEditMode,
        isPending,
        onSubmit,
        updateUrl,
        updateUrlDescription,
        removeUrl,
        addUrl,
    }
}
