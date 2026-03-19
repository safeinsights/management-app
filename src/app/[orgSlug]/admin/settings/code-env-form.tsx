'use client'

import {
    Button,
    Checkbox,
    Divider,
    FileInput,
    Flex,
    MultiSelect,
    Radio,
    Select,
    Stack,
    TextInput,
    Text,
    Title,
    Group,
    ActionIcon,
    Box,
} from '@mantine/core'
import { ActionSuccessType, DATA_SOURCE_TYPES } from '@/lib/types'
import { basename } from '@/lib/paths'
import { EnvVar } from '@/database/types'
import { TrashIcon, PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { fetchOrgCodeEnvsAction } from './code-envs.actions'
import { useCodeEnvForm } from './use-code-env-form'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'

type CodeEnv = ActionSuccessType<typeof fetchOrgCodeEnvsAction>[number]

interface EnvVarLineProps {
    envVar: EnvVar
    onNameChange: (name: string) => void
    onValueChange: (value: string) => void
    onRemove: () => void
}

function EnvVarLine({ envVar, onNameChange, onValueChange, onRemove }: EnvVarLineProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput
                value={envVar.name}
                onChange={(e) => onNameChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="Variable name"
            />
            <TextInput
                value={envVar.value}
                onChange={(e) => onValueChange(e.target.value)}
                style={{ flex: 1 }}
                placeholder="Value"
                error={!envVar.value.trim() ? 'Value is required' : null}
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

interface CodeEnvFormProps {
    image?: CodeEnv
    onCompleteAction: () => void
}

export function CodeEnvForm({ image, onCompleteAction }: CodeEnvFormProps) {
    const { form, isEditMode, isPending, onSubmit, sampleDataFiles, setSampleDataFiles, envVarActions } =
        useCodeEnvForm(image, onCompleteAction)
    const { options: dataSourceOptions } = useOrgDataSources()
    const { addEnvVar, updateEnvVarName, updateEnvVarValue, removeEnvVar } = envVarActions

    return (
        <form onSubmit={onSubmit}>
            <Stack>
                <Group align="flex-end" wrap="nowrap">
                    <TextInput
                        label="Identifier"
                        withAsterisk
                        placeholder="e.g., r_4_2_0"
                        description="Unique lowercase identifier using only letters, numbers, and underscores"
                        {...form.getInputProps('identifier')}
                        style={{ flex: 1 }}
                    />
                    <Checkbox
                        label="Is testing image"
                        description="Only admins can use testing images"
                        {...form.getInputProps('isTesting', { type: 'checkbox' })}
                        mb={4}
                    />
                </Group>
                <TextInput
                    label="Name"
                    withAsterisk
                    placeholder="e.g., R 4.2.0 Code Environment"
                    {...form.getInputProps('name')}
                />
                <TextInput
                    label="Command Line"
                    withAsterisk
                    placeholder="Rscript %f"
                    description="Command used to execute scripts.  %f will be subsituted with main code file"
                    {...form.getInputProps('cmdLine')}
                />

                <Select
                    label="Language"
                    withAsterisk
                    placeholder="Select language"
                    data={[
                        { value: 'R', label: 'R' },
                        { value: 'PYTHON', label: 'Python' },
                    ]}
                    {...form.getInputProps('language')}
                />
                <TextInput
                    label="URL to code environment"
                    withAsterisk
                    placeholder="e.g., harbor.safeinsights.org/openstax/r-base:2025-05-15"
                    {...form.getInputProps('url')}
                />
                <FileInput
                    label="Starter Code"
                    withAsterisk={!isEditMode}
                    description={
                        isEditMode
                            ? 'Upload a new file to replace the existing starter code (optional)'
                            : 'Upload starter code to assist Researchers with their coding experience.'
                    }
                    placeholder="Select a file"
                    {...form.getInputProps('starterCode')}
                />
                {isEditMode && image?.starterCodePath && (
                    <Text size="sm" c="dimmed">
                        Current file: {basename(image.starterCodePath)}
                    </Text>
                )}
                <Divider />
                <MultiSelect
                    label="Data Sources"
                    placeholder="Select data sources"
                    data={dataSourceOptions}
                    {...form.getInputProps('dataSourceIds')}
                />
                <Divider />
                <Box>
                    <Title order={5} mb={4}>
                        Environment Variables
                    </Title>
                    <Text size="xs" c="dimmed" mb="sm">
                        Define environment variables available to the container
                    </Text>

                    <Stack gap="xs">
                        {form.values.settings.environment.map((envVar, index) => (
                            <EnvVarLine
                                key={index}
                                envVar={envVar}
                                onNameChange={(name) => updateEnvVarName(index, name)}
                                onValueChange={(value) => updateEnvVarValue(index, value)}
                                onRemove={() => removeEnvVar(index)}
                            />
                        ))}

                        <Group gap="xs" align="flex-start">
                            <TextInput
                                {...form.getInputProps('newEnvKey')}
                                placeholder="Variable name"
                                style={{ flex: 1 }}
                            />
                            <TextInput {...form.getInputProps('newEnvValue')} placeholder="Value" style={{ flex: 1 }} />
                            <ActionIcon color="blue" variant="subtle" onClick={addEnvVar} mt={4}>
                                <PlusCircleIcon size={16} />
                            </ActionIcon>
                        </Group>
                    </Stack>
                </Box>
                <Divider />
                <Box>
                    <Title order={5} mb={4}>
                        Sample Data
                    </Title>
                    <Text size="xs" c="dimmed" mb="sm">
                        Files available to researchers when they develop in Coder
                    </Text>
                    <Stack gap="xs">
                        <TextInput
                            label="Data Path"
                            description="Directory path where files appear in the workspace (e.g. data/)"
                            placeholder="data/"
                            {...form.getInputProps('sampleDataPath')}
                        />
                        <FileInput
                            label="Files"
                            description={
                                isEditMode
                                    ? 'Upload new files to replace the existing sample data (optional)'
                                    : 'Upload sample data files for researchers (optional)'
                            }
                            placeholder="Select files"
                            multiple
                            value={sampleDataFiles}
                            onChange={setSampleDataFiles}
                        />
                        <Radio.Group label="Data Source Type" {...form.getInputProps('dataSourceType')}>
                            <Flex gap="md" mt="xs">
                                {Object.entries(DATA_SOURCE_TYPES).map(([value, label]) => (
                                    <Radio key={value} value={value} label={label} />
                                ))}
                            </Flex>
                        </Radio.Group>
                    </Stack>
                </Box>
                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Code Environment' : 'Save Code Environment'}
                </Button>
            </Stack>
        </form>
    )
}
