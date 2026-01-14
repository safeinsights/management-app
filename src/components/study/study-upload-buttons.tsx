import { Language } from '@/database/types'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { getAcceptedFormatsForLanguage, languageLabels } from '@/lib/languages'
import { Box, Divider, Group, Loader, MantineTheme, Stack, Text, UnstyledButton, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon, FileArrowUpIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'

// Shared button box styles
const buttonBoxStyles = (theme: MantineTheme) => ({
    border: `1px solid ${theme.colors.charcoal[1]}`,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.xxl,
    boxShadow: theme.shadows.md,
    cursor: 'pointer',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
})

// Upload Files Button Component
export const UploadFilesButton: FC<{ onClick: () => void; language: Language }> = ({ onClick, language }) => (
    <UnstyledButton onClick={onClick} style={{ width: 320, height: 200 }}>
        <Box style={(theme) => buttonBoxStyles(theme)}>
            <Stack align="center" justify="center" gap={4}>
                <FileArrowUpIcon size={20} />
                <Text fw={600} fz="sm">
                    Upload your files
                </Text>
                <Text fz="xs" c="gray.6">
                    {getAcceptedFormatsForLanguage(language)}
                </Text>
            </Stack>
        </Box>
    </UnstyledButton>
)

// Launch IDE Button Component
export const LaunchIDEButton: FC<{
    onClick: () => void
    language: Language
    loading?: boolean
    error?: boolean
}> = ({ onClick, language, loading = false, error = false }) => {
    const theme = useMantineTheme()
    const { messageWithEllipsis } = useLoadingMessages(loading)

    const getIcon = () => {
        if (error) return <WarningCircleIcon size={20} weight="fill" color={theme.colors.red[6]} />
        if (loading) return <Loader size={20} />
        return <ArrowSquareOutIcon size={20} />
    }

    const getTitle = () => {
        if (error) return 'Launch failed'
        if (loading) return 'Launching IDE'
        return 'Launch IDE'
    }

    const getSubtext = () => {
        if (error) return 'Please try again later.'
        if (loading) return messageWithEllipsis
        return `Supported programming language: ${languageLabels[language]}`
    }

    return (
        <UnstyledButton onClick={onClick} style={{ width: 320, height: 200 }} disabled={loading}>
            <Box
                style={(t) => ({
                    ...buttonBoxStyles(t),
                    borderColor: error ? t.colors.red[4] : t.colors.charcoal[1],
                })}
            >
                <Stack align="center" justify="center" gap={4}>
                    {getIcon()}
                    <Text fw={600} fz="sm" c={error ? 'red.6' : undefined}>
                        {getTitle()}
                    </Text>
                    <Text fz="xs" c={error ? 'red.6' : 'gray.6'}>
                        {getSubtext()}
                    </Text>
                </Stack>
            </Box>
        </UnstyledButton>
    )
}

// OR Divider Component
export const OrDivider: FC = () => (
    <Group gap="xs" px="md">
        <Divider style={{ width: 20 }} c="charcoal.1" />
        <Text fz="sm" fw={700}>
            OR
        </Text>
        <Divider style={{ width: 20 }} c="charcoal.1" />
    </Group>
)
