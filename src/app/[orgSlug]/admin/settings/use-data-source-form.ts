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
            documents:
                dataSource?.documents.map((d) => ({
                    id: d.id,
                    url: d.url ?? '',
                    description: d.description ?? '',
                })) || [],
            newDocumentUrl: '',
            newDocumentDescription: '',
        },
        validate: zodResolver(dataSourceFormSchema),
    })

    const addDocument = () => {
        form.setValues({
            ...form.values,
            documents: [
                ...form.values.documents,
                { url: form.values.newDocumentUrl, description: form.values.newDocumentDescription },
            ],
            newDocumentUrl: '',
            newDocumentDescription: '',
        })
    }

    const updateDocumentUrl = (index: number, url: string) => {
        const updated = [...form.values.documents]
        updated[index] = { ...updated[index], url }
        form.setFieldValue('documents', updated)
    }

    const updateDocumentDescription = (index: number, description: string) => {
        const updated = [...form.values.documents]
        updated[index] = { ...updated[index], description }
        form.setFieldValue('documents', updated)
    }

    const removeDocument = (index: number) => {
        form.setFieldValue(
            'documents',
            form.values.documents.filter((_, i) => i !== index),
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

    const onSubmit = form.onSubmit(({ newDocumentUrl, newDocumentDescription, ...values }) => {
        // Handle the case where a user may have document data in-progress. We proactively add the
        // document and then validate to surface errors. If everything is fine, we save().
        if (newDocumentUrl !== '' || newDocumentDescription !== '') {
            addDocument()

            form.validate()
            if (!form.isValid()) {
                return
            }

            values.documents = form.getValues().documents
        }
        save(values)
    })

    return {
        form,
        isEditMode,
        isPending,
        onSubmit,
        updateDocumentUrl,
        updateDocumentDescription,
        removeDocument,
        addDocument,
    }
}
