'use client'

import { Box, Button, Divider, Stack, TextInput, Textarea, Title, Text, Group, ActionIcon } from '@mantine/core'
import { TrashIcon, PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { ActionSuccessType } from '@/lib/types'
import { fetchOrgDataSourcesAction } from './data-sources.actions'
import { useDataSourceForm } from './use-data-source-form'
import { GetInputPropsReturnType } from '@mantine/form'

type DataSource = ActionSuccessType<typeof fetchOrgDataSourcesAction>[number]

interface DataSourceFormProps {
    dataSource?: DataSource
    onCompleteAction: () => void
}

interface SourceUrlLineProps {
    url: string
    description: string
    onUrlChange: (url: string) => void
    onDescriptionChange: (description: string) => void
    urlProps: GetInputPropsReturnType
    descriptionProps: GetInputPropsReturnType
    onRemove: () => void
}

function SourceUrlLine({
    url,
    description,
    onUrlChange,
    onDescriptionChange,
    onRemove,
    urlProps,
    descriptionProps,
}: SourceUrlLineProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput
                {...urlProps}
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="URL"
            />
            <TextInput
                {...descriptionProps}
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="URL description"
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

export function DataSourceForm({ dataSource, onCompleteAction }: DataSourceFormProps) {
    const { form, isEditMode, isPending, onSubmit, updateUrl, updateUrlDescription, removeUrl, addUrl } =
        useDataSourceForm(dataSource, onCompleteAction)

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
                <Divider />
                <Box>
                    <Title order={5} mb={4}>
                        Data source URLs
                    </Title>
                    <Text size="xs" c="dimmed" mb="sm">
                        Define URLs associated with this data source
                    </Text>

                    <Stack gap="xs">
                        {form.values.urls.map((u, index) => (
                            <SourceUrlLine
                                key={index}
                                url={u.url}
                                description={u.description}
                                onUrlChange={(value) => updateUrl(index, value)}
                                onDescriptionChange={(value) => updateUrlDescription(index, value)}
                                onRemove={() => removeUrl(index)}
                                urlProps={form.getInputProps(`urls.${index}.url`)}
                                descriptionProps={form.getInputProps(`urls.${index}.description`)}
                            />
                        ))}

                        <Group gap="xs" align="flex-start">
                            <TextInput {...form.getInputProps('newUrl')} placeholder="URL" style={{ flex: 1 }} />
                            <TextInput
                                {...form.getInputProps('newUrlDescription')}
                                placeholder="URL description"
                                style={{ flex: 1 }}
                            />
                            <ActionIcon color="blue" variant="subtle" aria-label="Add URL" onClick={addUrl} mt={4}>
                                <PlusCircleIcon size={16} />
                            </ActionIcon>
                        </Group>
                    </Stack>
                </Box>
                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Data Source' : 'Save Data Source'}
                </Button>
            </Stack>
        </form>
    )
}
