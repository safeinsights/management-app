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

    // Validate the draft pair before committing it. Appending unconditionally created a row
    // that could only fail later, against the stricter row schema, on a field the user was no
    // longer looking at (OTTER-647).
    const addUrl = () => {
        const urlValid = !form.validateField('newUrl').hasError
        const descriptionValid = !form.validateField('newUrlDescription').hasError
        if (!urlValid || !descriptionValid) return

        const url = form.values.newUrl.trim()
        const description = form.values.newUrlDescription.trim()
        // Both empty: say so rather than no-op. The pair schema only flags a *half*-filled
        // draft, so without this the button silently did nothing (OTTER-647).
        if (!url && !description) {
            form.setFieldError('newUrl', 'Enter a URL to add')
            form.setFieldError('newUrlDescription', 'URL description is required')
            return
        }

        form.setValues({
            ...form.values,
            urls: [...form.values.urls, { url, description }],
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

    // `removeListItem`, not a filtered `setFieldValue`: these rows read their errors from indexed
    // paths (`urls.0.url`), and replacing the parent array leaves those keys untouched. Deleting an
    // invalid first row therefore moved its error onto the valid row that slid into index 0.
    // `removeListItem` shifts the nested error indices to match (OTTER-647).
    const removeUrl = (index: number) => {
        form.removeListItem('urls', index)
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
        // Trim before deciding whether a draft pair exists. Comparing the raw strings against
        // '' treated a whitespace-only draft as present, appending it as a URL row that the
        // form schema had already judged absent, so it failed server-side instead (OTTER-647).
        const draftUrl = newUrl.trim()
        const draftDescription = newUrlDescription.trim()
        if (draftUrl !== '' || draftDescription !== '') {
            values = {
                ...values,
                urls: [...form.values.urls, { url: draftUrl, description: draftDescription }],
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
