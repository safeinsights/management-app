'use client'

import type { ReactNode } from 'react'
import { ActionIcon, Badge, Group, Text } from '@mantine/core'
import { CaretDownIcon, CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { RefresherSlot } from '@/components/refresher'
import type { ScanStatus } from '@/database/types'
import { SettingsCard, SettingsCardRow } from './settings-card'

// Presentational only: the body, refresher and per-row nodes are injected so these render
// without a QueryClient (e.g. Ladle).

// Figma Badge page: status badges are the light variant on the status ramps, whose light
// variables the theme pairs with the library's bg-light/text-icon tokens. Neutral is the grey ramp.
const SCAN_BADGE_CONFIG: Record<ScanStatus, { color: string; label: string }> = {
    'SCAN-PENDING': { color: 'grey', label: 'Scan Pending' },
    'SCAN-RUNNING': { color: 'blue', label: 'Scanning...' },
    'SCAN-COMPLETE': { color: 'green', label: 'Scan Passed' },
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
    actions: ReactNode
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
        <SettingsCardRow>
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
                        <Badge variant="light" size="sm" color="yellow">
                            Testing
                        </Badge>
                    )}
                    {isDefault && (
                        // Figma's filled brand badge is purple/5.
                        <Badge variant="filled" size="sm" color="purple">
                            Default
                        </Badge>
                    )}
                    <ScanStatusBadge status={latestScanStatus} onClick={onScanBadgeClick} />
                </Group>
                <Group gap="xxs" wrap="nowrap">
                    {actions}
                </Group>
            </Group>
            {detail}
        </SettingsCardRow>
    )
}

export type CodeEnvsViewProps = {
    onAdd: () => void
    refresher?: ReactNode
    children: ReactNode
}

export function CodeEnvsView({ onAdd, refresher, children }: CodeEnvsViewProps) {
    return (
        <SettingsCard
            title="Code Environments"
            addLabel="Add Code Environment"
            onAdd={onAdd}
            slot={<RefresherSlot>{refresher}</RefresherSlot>}
        >
            {children}
        </SettingsCard>
    )
}
