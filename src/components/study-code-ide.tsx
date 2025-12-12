import { Box, Button, Divider, Group, Paper, Stack, Text, Title, UnstyledButton, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon, CaretLeftIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, useState } from 'react'

interface StudyCodeIDEProps {
    showStepIndicator?: boolean
    title?: string
    onBack?: () => void
    hasExistingFiles?: boolean
}

export const StudyCodeIDE: FC<StudyCodeIDEProps> = ({
    showStepIndicator = false,
    title = 'Study code',
    onBack,
    hasExistingFiles = false,
}) => {
    const [importedFiles, setImportedFiles] = useState<string[]>([])

    const handleOpenIDEWindow = () => {
        // TODO: Open the IDE in a new browser tab/window
        // This will use the Coder workspace for the study once integrated
        window.open('about:blank', '_blank') // Placeholder for now
    }

    const handleImportFromIDE = () => {
        // TODO: Implement logic to show imported files from the IDE workspace
        setImportedFiles([]) // Or navigate to existing view?
    }

    return (
        <Paper p="xl">
            {showStepIndicator && (
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    STEP 4 OF 4
                </Text>
            )}
            <Title order={4}>{title}</Title>
            <Divider my="sm" mt="sm" mb="md" />

            <Group justify="space-between" align="center" mb="lg">
                <Text fw={600}>Review files from IDE</Text>
                <Group gap="sm">
                    <Button
                        variant="outline"
                        rightSection={<ArrowSquareOutIcon size={16} />}
                        onClick={handleOpenIDEWindow}
                    >
                        Launch IDE
                    </Button>
                    <Button leftSection={<DownloadSimpleIcon size={16} />} onClick={handleImportFromIDE}>
                        Import files from IDE
                    </Button>
                </Group>
            </Group>

            {!hasExistingFiles && (
                <IDEFilesEmptyState importedFiles={importedFiles} onImportClick={handleImportFromIDE} />
            )}

            {onBack && (
                <Button variant="subtle" mt="md" onClick={onBack} leftSection={<CaretLeftIcon size={16} />}>
                    Back to upload options
                </Button>
            )}
        </Paper>
    )
}

// IDE Files Empty State Component - shown when no files have been imported from IDE
const IDEFilesEmptyState: FC<{
    importedFiles: string[]
    onImportClick: () => void
}> = ({ importedFiles, onImportClick }) => {
    const theme = useMantineTheme()

    if (importedFiles.length > 0) {
        // navigate to view of imported files where main code file should be selected
    }

    return (
        <Box
            style={{
                backgroundColor: theme.colors.gray[0],
                borderRadius: theme.radius.sm,
                padding: theme.spacing.xxl,
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Stack align="center" gap="md">
                <Text c="charcoal.9">You have not imported any files yet.</Text>
                <UnstyledButton onClick={onImportClick}>
                    <Group gap={6}>
                        <DownloadSimpleIcon size={18} color={theme.colors.purple[5]} />
                        <Text c="purple.5" fw={600} fz="md">
                            Import files from IDE
                        </Text>
                    </Group>
                </UnstyledButton>
            </Stack>
        </Box>
    )
}
