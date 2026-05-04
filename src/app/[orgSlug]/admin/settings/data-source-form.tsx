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

interface SourceDocumentLineProps {
    document: { url: string; description: string }
    onUrlChange: (url: string) => void
    onDescriptionChange: (description: string) => void
    urlProps: GetInputPropsReturnType
    descriptionProps: GetInputPropsReturnType
    onRemove: () => void
}

function SourceDocumentLine({
    document,
    onUrlChange,
    onDescriptionChange,
    onRemove,
    urlProps,
    descriptionProps,
}: SourceDocumentLineProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput
                {...urlProps}
                value={document.url}
                onChange={(e) => onUrlChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="URL for document"
            />
            <TextInput
                {...descriptionProps}
                value={document.description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="Description of document"
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

export function DataSourceForm({ dataSource, onCompleteAction }: DataSourceFormProps) {
    const {
        form,
        isEditMode,
        isPending,
        onSubmit,
        updateDocumentUrl,
        updateDocumentDescription,
        removeDocument,
        addDocument,
    } = useDataSourceForm(dataSource, onCompleteAction)

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
                        Data source documents
                    </Title>
                    <Text size="xs" c="dimmed" mb="sm">
                        Define documents associated with this data source
                    </Text>

                    <Stack gap="xs">
                        {form.values.documents.map((doc, index) => (
                            <SourceDocumentLine
                                key={index}
                                document={doc}
                                onUrlChange={(name) => updateDocumentUrl(index, name)}
                                onDescriptionChange={(value) => updateDocumentDescription(index, value)}
                                onRemove={() => removeDocument(index)}
                                urlProps={form.getInputProps(`documents.${index}.url`)}
                                descriptionProps={form.getInputProps(`documents.${index}.description`)}
                            />
                        ))}

                        <Group gap="xs" align="flex-start">
                            <TextInput
                                {...form.getInputProps('newDocumentUrl')}
                                placeholder="URL for document"
                                style={{ flex: 1 }}
                            />
                            <TextInput
                                {...form.getInputProps('newDocumentDescription')}
                                placeholder="Description of document"
                                style={{ flex: 1 }}
                            />
                            <ActionIcon color="blue" variant="subtle" onClick={addDocument} mt={4}>
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
