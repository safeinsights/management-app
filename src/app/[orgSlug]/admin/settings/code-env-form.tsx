'use client'

import { useState } from 'react'
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
    Alert,
    List,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { ActionSuccessType, DATA_SOURCE_TYPES } from '@/lib/types'
import { EnvVar } from '@/database/types'
import { TrashIcon, PlusCircleIcon, FileArrowUpIcon, UploadIcon, WarningIcon } from '@phosphor-icons/react/dist/ssr'
import { fetchOrgCodeEnvsAction } from '@/server/actions/code-envs.actions'
import { useCodeEnvForm } from './use-code-env-form'
import { useOrgDataSources } from '@/hooks/use-org-data-sources'
import { RequiredIndicator } from '@/components/required-indicator'
import { InputError } from '@/components/errors'
import { languageLabels } from '@/lib/languages'

type CodeEnv = ActionSuccessType<typeof fetchOrgCodeEnvsAction>[number]

// Row errors never pass through the shared useForm, so they carry the design's error icon themselves.
const requiredError = (value: string, message: string) => (value.trim() ? null : <InputError error={message} />)

interface EnvVarLineProps {
    envVar: EnvVar
    onNameChange: (name: string) => void
    onValueChange: (value: string) => void
    onRemove: () => void
}

// Derived from the value, not per-row touched state: rows are keyed by index, so touched state
// would transfer to whichever row slides into that index on delete.
function EnvVarLine({ envVar, onNameChange, onValueChange, onRemove }: EnvVarLineProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput
                value={envVar.name}
                onChange={(e) => onNameChange(e.target.value)}
                flex={1}
                placeholder="Variable name"
                aria-label="Variable name"
                error={requiredError(envVar.name, 'Variable name is required')}
            />
            <TextInput
                value={envVar.value}
                onChange={(e) => onValueChange(e.target.value)}
                flex={1}
                placeholder="Value"
                aria-label="Variable value"
                error={requiredError(envVar.value, 'Value is required')}
            />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt="xxs" aria-label="Remove variable">
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

function StarterCodeError({ isVisible, error }: { isVisible: boolean; error?: string }) {
    if (!isVisible) return null

    return (
        <Box mt="xs">
            <InputError error={error ?? 'At least one starter code file is required.'} />
        </Box>
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
    // The dropzone has no input to blur, so "left incomplete" is visited-then-left-empty
    // (OTTER-647).
    const [touched, setTouched] = useState(false)
    const isMissing = !isEditMode && touched && starterCodes.length === 0

    const handleDrop = (files: File[]) => {
        const existingNames = new Set(starterCodes.map((f) => f.name))
        const newFiles = files.filter((f) => !existingNames.has(f.name))
        setStarterCodes([...starterCodes, ...newFiles])
    }

    return (
        <Box>
            <Title order={5} mb="xxs">
                Starter Code
                <RequiredIndicator isVisible={!isEditMode} />
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                {isEditMode
                    ? 'Upload new files to replace all existing starter code (optional)'
                    : 'Upload starter code files to assist Researchers with their coding experience.'}
            </Text>
            <Dropzone
                onDrop={handleDrop}
                multiple
                p="md"
                onBlur={() => setTouched(true)}
                aria-invalid={isMissing || !!error || undefined}
                data-testid="starter-code-dropzone"
            >
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
            <StarterCodeError isVisible={!!error || isMissing} error={error} />
            {starterCodes.length > 0 && (
                <Stack gap="xs" mt="sm">
                    {starterCodes.map((file) => (
                        <Group key={file.name} justify="space-between">
                            <Text size="sm">{file.name}</Text>
                            <ActionIcon
                                color="red"
                                variant="subtle"
                                onClick={() => removeStarterCode(file.name)}
                                aria-label={`Remove ${file.name}`}
                            >
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

// Value-derived for the same reason as EnvVarLine, and because a row loaded from an existing
// environment can arrive empty, which touched state would never flag.
function CommandLineRow({ ext, cmd, onCmdChange, onRemove }: CommandLineRowProps) {
    return (
        <Group gap="xs" align="flex-start">
            <TextInput value={ext} readOnly flex={1} aria-label="File extension" />
            <TextInput
                value={cmd}
                onChange={(e) => onCmdChange(e.target.value)}
                flex={2}
                placeholder={ext === 'r' ? 'Rscript %f' : ext === 'py' ? 'python %f' : 'command %f'}
                aria-label={`Command for .${ext} files`}
                error={requiredError(cmd, 'Command is required')}
            />
            <ActionIcon
                color="red"
                variant="subtle"
                onClick={onRemove}
                mt="xxs"
                aria-label={`Remove command for .${ext} files`}
            >
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
    // No early return on empty: onAdd flags the missing half, and bailing left "+" doing nothing
    // with no reason given (OTTER-647).
    const handleAdd = () => {
        const ext = (newExtProps.value as string).trim().toLowerCase().replace(/^\./, '')
        const cmd = (newCmdProps.value as string).trim()
        onAdd(ext, cmd)
    }

    return (
        <Box>
            <Title order={5} mb="xxs">
                Command Lines
            </Title>
            <Text size="xs" c="dimmed" mb="sm">
                Map file extensions to the command used to execute them. Use %f for the main code file name; it’s quoted
                automatically, so you don’t need to wrap it in quotes.
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
                    <TextInput {...newExtProps} placeholder="Extension (e.g. r, py)" flex={1} />
                    <TextInput {...newCmdProps} placeholder="Command (e.g. Rscript %f)" flex={2} />
                    <ActionIcon
                        color="blue"
                        variant="subtle"
                        onClick={handleAdd}
                        mt="xxs"
                        aria-label="Add command line"
                    >
                        <PlusCircleIcon size={16} />
                    </ActionIcon>
                </Group>
            </Stack>
        </Box>
    )
}

function FormErrorSummary({ isVisible, errors }: { isVisible: boolean; errors: string[] }) {
    if (!isVisible) return null

    return (
        <Alert color="red" icon={<WarningIcon size={16} />} title="Please fix the following before saving">
            <List size="sm">
                {errors.map((error) => (
                    <List.Item key={error}>{error}</List.Item>
                ))}
            </List>
        </Alert>
    )
}

interface CodeEnvFormProps {
    image?: CodeEnv
    isLastUsable?: boolean
    onCompleteAction: () => void
}

// The server refuses these edits regardless (OTTER-527); this explains it before the admin tries.
const lastUsableLockFor = (image: CodeEnv | undefined, isLastUsable: boolean) => {
    if (!image || !isLastUsable) {
        return {
            isLocked: false,
            isTestingDescription: 'Only admins can use testing images',
            languageDescription: undefined,
        }
    }
    const language = languageLabels[image.language]
    return {
        isLocked: true,
        isTestingDescription: `This is the last usable ${language} environment, so it can't be made a testing image`,
        languageDescription: `This is the last usable ${language} environment, so its language can't change`,
    }
}

export function CodeEnvForm({ image, isLastUsable = false, onCompleteAction }: CodeEnvFormProps) {
    const {
        form,
        formErrors,
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
    const lastUsableLock = lastUsableLockFor(image, isLastUsable)

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
                        flex={1}
                    />
                    <Checkbox
                        label="Is testing image"
                        description={lastUsableLock.isTestingDescription}
                        disabled={lastUsableLock.isLocked}
                        {...form.getInputProps('isTesting', { type: 'checkbox' })}
                        mb="xxs"
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
                    description={lastUsableLock.languageDescription}
                    disabled={lastUsableLock.isLocked}
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
                    description="Registry, repository and optional tag, without the digest"
                    {...form.getInputProps('url')}
                />
                <TextInput
                    label="Image digest"
                    withAsterisk
                    placeholder="e.g., sha256:771722e4d543…"
                    description="The full 64-character sha256 digest. Get it by running: docker buildx imagetools inspect <image URL>"
                    {...form.getInputProps('digest')}
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
                    <Title order={5} mb="xxs">
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
                            <TextInput {...form.getInputProps('newEnvKey')} placeholder="Variable name" flex={1} />
                            <TextInput {...form.getInputProps('newEnvValue')} placeholder="Value" flex={1} />
                            <ActionIcon
                                color="blue"
                                variant="subtle"
                                onClick={addEnvVar}
                                mt="xxs"
                                aria-label="Add environment variable"
                            >
                                <PlusCircleIcon size={16} />
                            </ActionIcon>
                        </Group>
                    </Stack>
                </Box>
                <Divider />
                <Box>
                    <Title order={5} mb="xxs">
                        Example Data
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
                            label="Example Data Files"
                            description={
                                isEditMode
                                    ? 'Upload new files to replace the existing example data (optional)'
                                    : 'Upload example data files for researchers (optional)'
                            }
                            placeholder="Select files"
                            multiple
                            value={sampleDataFiles}
                            onChange={setSampleDataFiles}
                        />
                        <Radio.Group label="Data Source Type" {...form.getInputProps('dataSourceType')}>
                            <Flex gap="md">
                                {Object.entries(DATA_SOURCE_TYPES).map(([value, label]) => (
                                    <Radio key={value} value={value} label={label} />
                                ))}
                            </Flex>
                        </Radio.Group>
                    </Stack>
                </Box>
                <FormErrorSummary isVisible={formErrors.length > 0} errors={formErrors} />
                <Button type="submit" loading={isPending} mt="md">
                    {isEditMode ? 'Update Code Environment' : 'Save Code Environment'}
                </Button>
            </Stack>
        </form>
    )
}
