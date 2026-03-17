'use client'

import { useForm, useMutation, z, zodResolver } from '@/common'
import { reportMutationError } from '@/components/errors'
import { reportSuccess } from '@/components/notices'
import { useParams } from 'next/navigation'
import { createOrgDataSourceAction, updateOrgDataSourceAction } from './data-sources.actions'
import { createOrgDataSourceSchema } from './data-sources.schema'
import { ActionSuccessType } from '@/lib/types'

type DataSource = ActionSuccessType<typeof createOrgDataSourceAction>
type FormValues = z.infer<typeof createOrgDataSourceSchema>

export function useDataSourceForm(dataSource: DataSource | undefined, onCompleteAction: () => void) {
    const { orgSlug } = useParams<{ orgSlug: string }>()
    const isEditMode = !!dataSource

    const form = useForm<FormValues>({
        initialValues: {
            name: dataSource?.name || '',
            description: dataSource?.description || '',
            documentationUrl: dataSource?.documentationUrl || '',
            codeEnvId: dataSource?.codeEnvId || '',
        },
        validate: zodResolver(createOrgDataSourceSchema),
    })

    const { mutate: save, isPending } = useMutation({
        mutationFn: async (values: FormValues) => {
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

    const onSubmit = form.onSubmit((values) => save(values))

    return { form, isEditMode, isPending, onSubmit }
}
