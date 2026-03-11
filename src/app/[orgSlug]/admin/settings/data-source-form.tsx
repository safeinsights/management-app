'use client'

import { Button, Stack, TextInput, Textarea, Select } from '@mantine/core'
import { ActionSuccessType } from '@/lib/types'
import { createOrgDataSourceAction } from './data-sources.actions'
import { useDataSourceForm } from './use-data-source-form'

type DataSource = ActionSuccessType<typeof createOrgDataSourceAction>

interface DataSourceFormProps {
    dataSource?: DataSource
    codeEnvOptions: { value: string; label: string }[]
    onCompleteAction: () => void
}

export function DataSourceForm({ dataSource, codeEnvOptions, onCompleteAction }: DataSourceFormProps) {
    const { form, isEditMode, isPending, onSubmit } = useDataSourceForm(dataSource, onCompleteAction)

    return (
        <form onSubmit={onSubmit}>
            <Stack>
                <TextInput label="Name" placeholder="e.g., Student Records" {...form.getInputProps('name')} />
                <Textarea
                    label="Description"
                    placeholder="Brief description of this data source"
                    autosize
                    minRows={2}
                    maxRows={5}
                    {...form.getInputProps('description')}
                />
                <TextInput
                    label="Documentation URL"
                    placeholder="https://example.com/docs"
                    {...form.getInputProps('documentationUrl')}
                />
                <Select
                    label="Code Environment"
                    placeholder="Select a code environment"
                    data={codeEnvOptions}
                    {...form.getInputProps('codeEnvId')}
                />
                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Data Source' : 'Save Data Source'}
                </Button>
            </Stack>
        </form>
    )
}
