'use client'

import type { ReactNode } from 'react'
import { ActionIcon, Badge, Box, Button, Divider, Flex, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretDownIcon, CheckCircleIcon, PlusCircleIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import type { ScanStatus } from '@/database/types'

// Presentational pieces for the "Code Environments" settings card. They own the card
// chrome, the visible row line ("R / DEFAULT / SCAN PASSED"), and the scan badge — but
// NOT data fetching, the add/edit modals, or the per-row mutations, which stay in the
// CodeEnvs container (./code-envs). The body, refresher, and per-row action/detail nodes
// are injected so these render in isolation (e.g. Ladle, which has no QueryClient).

const SCAN_BADGE_CONFIG: Record<ScanStatus, { color: string; label: string }> = {
    'SCAN-PENDING': { color: 'dark', label: 'Scan Pending' },
    'SCAN-RUNNING': { color: 'blue', label: 'Scanning...' },
    'SCAN-COMPLETE': { color: 'teal', label: 'Scan Passed' },
    'SCAN-FAILED': { color: 'red', label: 'Scan Failed' },
}

const SCAN_BADGE_ICONS: Partial<Record<ScanStatus, ReactNode>> = {
    'SCAN-COMPLETE': <CheckCircleIcon size={14} weight="fill" />,
    'SCAN-FAILED': <WarningCircleIcon size={14} weight="fill" />,
}

const CLICKABLE_SCAN_STATUSES: ScanStatus[] = ['SCAN-COMPLETE', 'SCAN-FAILED']

export const ScanStatusBadge: React.FC<{ status: string | null; onClick?: () => void }> = ({ status, onClick }) => {
    if (!status) return null
    const config = SCAN_BADGE_CONFIG[status as ScanStatus]
    if (!config) return null

    const isClickable = CLICKABLE_SCAN_STATUSES.includes(status as ScanStatus)

    return (
        <Badge
            variant="light"
            size="sm"
            color={config.color}
            leftSection={SCAN_BADGE_ICONS[status as ScanStatus]}
            style={isClickable ? { cursor: 'pointer' } : undefined}
            onClick={isClickable ? onClick : undefined}
        >
            {config.label}
        </Badge>
    )
}

export type CodeEnvRowViewProps = {
    name: string
    language: string
    isTesting: boolean
    isDefault: boolean
    latestScanStatus: string | null
    detailOpened: boolean
    onToggleDetail: () => void
    onLanguageBadgeClick: () => void
    onScanBadgeClick: () => void
    /** Edit/delete controls — injected by the container (they own mutations + modals). */
    actions: ReactNode
    /** Collapsible detail panel — injected by the container. */
    detail: ReactNode
}

export function CodeEnvRowView({
    name,
    language,
    isTesting,
    isDefault,
    latestScanStatus,
    detailOpened,
    onToggleDetail,
    onLanguageBadgeClick,
    onScanBadgeClick,
    actions,
    detail,
}: CodeEnvRowViewProps) {
    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Group justify="space-between" p="sm" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                    <ActionIcon size="sm" variant="subtle" onClick={onToggleDetail}>
                        <CaretDownIcon
                            style={{
                                transform: detailOpened ? 'rotate(0deg)' : 'rotate(-90deg)',
                                transition: 'transform 200ms',
                            }}
                        />
                    </ActionIcon>
                    <Text fw={500}>{name}</Text>
                    <Badge variant="light" size="sm" style={{ cursor: 'pointer' }} onClick={onLanguageBadgeClick}>
                        {language}
                    </Badge>
                    {isTesting && (
                        <Badge variant="light" size="sm" color="orange">
                            Testing
                        </Badge>
                    )}
                    {isDefault && (
                        <Badge variant="filled" size="sm" color="dark">
                            Default
                        </Badge>
                    )}
                    <ScanStatusBadge status={latestScanStatus} onClick={onScanBadgeClick} />
                </Group>
                <Group gap={4} wrap="nowrap">
                    {actions}
                </Group>
            </Group>
            {detail}
        </Box>
    )
}

export type CodeEnvsViewProps = {
    onAdd: () => void
    refresher?: ReactNode
    children: ReactNode
}

export function CodeEnvsView({ onAdd, refresher, children }: CodeEnvsViewProps) {
    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Code Environments
                    </Title>
                    <Flex justify="flex-end" align="center" gap="md">
                        {refresher}
                        <Button leftSection={<PlusCircleIcon size={16} />} onClick={onAdd}>
                            Add Code Environment
                        </Button>
                    </Flex>
                </Group>
                <Divider c="dimmed" />
                {children}
            </Stack>
        </Paper>
    )
}
