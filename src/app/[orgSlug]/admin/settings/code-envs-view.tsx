'use client'

import type { ReactNode } from 'react'
import { ActionIcon, Badge, type BadgeProps, Group, Text } from '@mantine/core'
import { CaretDownIcon, CheckCircleIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { RefresherSlot } from '@/components/refresher'
import type { MicrovmImageStatus, ScanStatus } from '@/database/types'
import { fontWeight } from '@/theme/tokens'
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

// A badge without a handler stays a plain badge, so keyboard users never land on a dead Tab stop.
const ActionBadge: React.FC<BadgeProps & { label: string; onClick?: () => void }> = ({
    label,
    onClick,
    ...badgeProps
}) => {
    if (!onClick) return <Badge {...badgeProps} />
    return <Badge {...badgeProps} component="button" type="button" onClick={onClick} aria-label={label} />
}

export const ScanStatusBadge: React.FC<{ name: string; status: string | null; onClick?: () => void }> = ({
    name,
    status,
    onClick,
}) => {
    if (!status) return null
    const config = SCAN_BADGE_CONFIG[status as ScanStatus]
    if (!config) return null

    const isClickable = CLICKABLE_SCAN_STATUSES.includes(status as ScanStatus)

    return (
        <ActionBadge
            variant="light"
            size="sm"
            color={config.color}
            leftSection={SCAN_BADGE_ICONS[status as ScanStatus]}
            label={`View ${config.label} results for ${name}`}
            onClick={isClickable ? onClick : undefined}
        >
            {config.label}
        </ActionBadge>
    )
}

// The run environment built from the code environment's url: the image a study's code runs on in
// the IDE. Environments with one url share it.
const IMAGE_BADGE_CONFIG: Record<MicrovmImageStatus, { color: string; label: string }> = {
    'IMAGE-PENDING': { color: 'grey', label: 'Run Environment Pending' },
    'IMAGE-RUNNING': { color: 'blue', label: 'Building Run Environment...' },
    'IMAGE-READY': { color: 'green', label: 'Run Environment Ready' },
    'IMAGE-FAILED': { color: 'red', label: 'Run Environment Failed' },
}

// The build job sends a code and nothing else, so every sentence an admin reads is written here.
export function imageErrorText(error: string | null): string {
    const [code, detail] = (error ?? '').split(': ')
    if (code === 'BASE_IMAGE_UNAVAILABLE') {
        return 'The image could not be read from the registry. Make sure that the URL is correct and that the image exists.'
    }
    if (code === 'UNSUPPORTED_PLATFORM') {
        return `The image is for ${detail}. The run environment needs a linux/amd64 image.`
    }
    return 'The run environment could not be built. Contact SafeInsights support.'
}

export const ImageStatusBadge: React.FC<{ status: string | null; error: string | null }> = ({ status, error }) => {
    const config = status ? IMAGE_BADGE_CONFIG[status as MicrovmImageStatus] : undefined
    if (!config) return null
    const failed = status === 'IMAGE-FAILED'
    return (
        <Badge
            variant="light"
            size="sm"
            color={config.color}
            leftSection={failed ? <WarningCircleIcon size={14} weight="fill" /> : undefined}
            title={failed ? imageErrorText(error) : undefined}
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
    imageStatus: string | null
    imageError: string | null
    detailOpened: boolean
    onToggleDetail: () => void
    onLanguageBadgeClick?: () => void
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
    imageStatus,
    imageError,
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
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        onClick={onToggleDetail}
                        aria-label={`Details for ${name}`}
                        aria-expanded={detailOpened}
                    >
                        <CaretDownIcon className="rotatable" data-rotated={!detailOpened || undefined} />
                    </ActionIcon>
                    <Text fw={fontWeight.semibold}>{name}</Text>
                    <ActionBadge
                        variant="light"
                        size="sm"
                        label={`View ${language} starter code for ${name}`}
                        onClick={onLanguageBadgeClick}
                    >
                        {language}
                    </ActionBadge>
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
                    <ScanStatusBadge name={name} status={latestScanStatus} onClick={onScanBadgeClick} />
                    <ImageStatusBadge status={imageStatus} error={imageError} />
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
