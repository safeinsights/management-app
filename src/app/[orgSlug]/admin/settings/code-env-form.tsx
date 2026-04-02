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
import { Dropzone } from '@mantine/dropzone'
import { ActionSuccessType, DATA_SOURCE_TYPES } from '@/lib/types'
import { EnvVar } from '@/database/types'
import { TrashIcon, PlusCircleIcon, FileArrowUpIcon, UploadIcon } from '@phosphor-icons/react/dist/ssr'
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

function StarterCodeSection({
    isEditMode,
    image,
    starterCodes,
    setStarterCodes,
    removeStarterCode,
    error,
}: {
    isEditMode: boolean
    image?: CodeEnv
    starterCodes: File[]
    setStarterCodes: (files: File[]) => void
    removeStarterCode: (fileName: string) => void
    error?: string
}) {
    const handleDrop = (files: File[]) => {
        const existingNames = new Set(starterCodes.map((f) => f.name))
        const newFiles = files.filter((f) => !existingNames.has(f.name))
        setStarterCodes([...starterCodes, ...newFiles])
    }

    return (
        <Box>
            <Title order={5} mb={4}>
                Starter Code{' '}
                {!isEditMode && (
                    <Text component="span" c="red">
                        *
                    </Text>
                )}
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                {isEditMode
                    ? 'Upload new files to replace all existing starter code (optional)'
                    : 'Upload starter code files to assist Researchers with their coding experience.'}
            </Text>
            <Dropzone onDrop={handleDrop} multiple p="md">
                <Group gap="xs" justify="center">
                    <Dropzone.Accept>
                        <UploadIcon size={24} />
                    </Dropzone.Accept>
                    <Dropzone.Idle>
                        <FileArrowUpIcon size={24} />
                    </Dropzone.Idle>
                    <Text size="sm" c="dimmed">
                        Drop files or click to browse
                    </Text>
                </Group>
            </Dropzone>
            {error && (
                <Text size="sm" c="red" mt="xs">
                    {error}
                </Text>
            )}
            {starterCodes.length > 0 && (
                <Stack gap="xs" mt="sm">
                    {starterCodes.map((file) => (
                        <Group key={file.name} justify="space-between">
                            <Text size="sm">{file.name}</Text>
                            <ActionIcon color="red" variant="subtle" onClick={() => removeStarterCode(file.name)}>
                                <TrashIcon size={14} />
                            </ActionIcon>
                        </Group>
                    ))}
                </Stack>
            )}
            {isEditMode && image?.starterCodeFileNames?.length && (
                <Text size="sm" c="dimmed" mt="sm">
                    Existing files: {image.starterCodeFileNames.join(', ')}
                </Text>
            )}
        </Box>
    )
}

interface CommandLineRowProps {
    ext: string
    cmd: string
    onCmdChange: (cmd: string) => void
    onRemove: () => void
}

function CommandLineRow({ ext, cmd, onCmdChange, onRemove }: CommandLineRowProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput value={ext} readOnly style={{ flex: 1 }} />
            <TextInput
                value={cmd}
                onChange={(e) => onCmdChange(e.target.value)}
                style={{ flex: 2 }}
                placeholder={ext === 'r' ? 'Rscript %f' : ext === 'py' ? 'python %f' : 'command %f'}
                error={!cmd.trim() ? 'Command is required' : null}
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

function CommandLinesSection({
    commandLines,
    onUpdate,
    onRemove,
    onAdd,
    newExtProps,
    newCmdProps,
}: {
    commandLines: Record<string, string>
    onUpdate: (ext: string, cmd: string) => void
    onRemove: (ext: string) => void
    onAdd: (ext: string, cmd: string) => void
    newExtProps: ReturnType<ReturnType<typeof useCodeEnvForm>['form']['getInputProps']>
    newCmdProps: ReturnType<ReturnType<typeof useCodeEnvForm>['form']['getInputProps']>
}) {
    const handleAdd = () => {
        const ext = (newExtProps.value as string).trim().toLowerCase().replace(/^\./, '')
        const cmd = (newCmdProps.value as string).trim()
        if (!ext || !cmd) return
        onAdd(ext, cmd)
    }

    return (
        <Box>
            <Title order={5} mb={4}>
                Command Lines
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                Map file extensions to the command used to execute them. Use %f for the main code file name.
            </Text>
            <Stack gap="xs">
                {Object.entries(commandLines).map(([ext, cmd]) => (
                    <CommandLineRow
                        key={ext}
                        ext={ext}
                        cmd={cmd}
                        onCmdChange={(value) => onUpdate(ext, value)}
                        onRemove={() => onRemove(ext)}
                    />
                ))}
                <Group gap="xs" align="flex-start">
                    <TextInput {...newExtProps} placeholder="Extension (e.g. r, py)" style={{ flex: 1 }} />
                    <TextInput {...newCmdProps} placeholder="Command (e.g. Rscript %f)" style={{ flex: 2 }} />
                    <ActionIcon color="blue" variant="subtle" onClick={handleAdd} mt={4} aria-label="Add command line">
                        <PlusCircleIcon size={16} />
                    </ActionIcon>
                </Group>
            </Stack>
        </Box>
    )
}

interface CodeEnvFormProps {
    image?: CodeEnv
    onCompleteAction: () => void
}

export function CodeEnvForm({ image, onCompleteAction }: CodeEnvFormProps) {
    const {
        form,
        isEditMode,
        isPending,
        onSubmit,
        sampleDataFiles,
        setSampleDataFiles,
        starterCodeActions,
        commandLineActions,
        envVarActions,
    } = useCodeEnvForm(image, onCompleteAction)
    const { options: dataSourceOptions } = useOrgDataSources()
    const { addEnvVar, updateEnvVarName, updateEnvVarValue, removeEnvVar } = envVarActions
    const { setStarterCodes, removeStarterCode } = starterCodeActions
    const { addCommandLine, updateCommandLine, removeCommandLine } = commandLineActions
    const starterCodes = (form.values.starterCodes as File[] | undefined) || []

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
                <Divider />
                <StarterCodeSection
                    isEditMode={isEditMode}
                    image={image}
                    starterCodes={starterCodes}
                    setStarterCodes={setStarterCodes}
                    removeStarterCode={removeStarterCode}
                    error={form.errors.starterCodes as string}
                />
                <CommandLinesSection
                    commandLines={form.values.commandLines}
                    onUpdate={updateCommandLine}
                    onRemove={removeCommandLine}
                    onAdd={addCommandLine}
                    newExtProps={form.getInputProps('newCmdExt')}
                    newCmdProps={form.getInputProps('newCmdValue')}
                />
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
                            label="Sample Data Files"
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
