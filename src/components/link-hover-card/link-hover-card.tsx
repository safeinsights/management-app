'use client'

import type { ReactNode, Ref } from 'react'
import { ActionIcon, Anchor, Divider, Group, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core'
import { useClipboard } from '@mantine/hooks'
import {
    ArrowSquareOutIcon,
    CheckIcon,
    CopyIcon,
    LinkBreakIcon,
    PencilSimpleIcon,
} from '@phosphor-icons/react/dist/ssr'
import { LINK_CARD_LABELS, LINK_COPIED_ANNOUNCEMENT, UNAVAILABLE_LINK_BODY, UNAVAILABLE_LINK_TITLE } from './copy'
import { formatCategoryLine, type LinkPreview } from './link-preview'
import classes from './link-hover-card.module.css'

const COPIED_RESET_MS = 3000

const ICON_SIZE = 16
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false }

type LinkCardMode = 'edit' | 'readOnly'

interface LinkCardActionVisibility {
    openInNewTab: boolean
    edit: boolean
    remove: boolean
}

/**
 * Read-only offers "open in a new tab" only for links not already stored to open there. The broken
 * state has no reachable destination, so neither mode offers a way to open it.
 */
function linkCardActionVisibility(
    mode: LinkCardMode,
    preview: LinkPreview,
    opensInNewTab: boolean,
): LinkCardActionVisibility {
    const canOpen = preview.kind !== 'unavailable'

    if (mode === 'readOnly') {
        return { openInNewTab: canOpen && !opensInNewTab, edit: false, remove: false }
    }

    return { openInNewTab: canOpen, edit: true, remove: true }
}

interface LinkHoverCardProps {
    preview: LinkPreview
    mode: LinkCardMode
    opensInNewTab: boolean
    firstActionRef?: Ref<HTMLButtonElement>
    onOpenInNewTab: () => void
    onEdit?: () => void
    onRemove?: () => void
}

export function LinkHoverCard({
    preview,
    mode,
    opensInNewTab,
    firstActionRef,
    onOpenInNewTab,
    onEdit,
    onRemove,
}: LinkHoverCardProps) {
    const visibility = linkCardActionVisibility(mode, preview, opensInNewTab)

    return (
        <Stack gap="sm">
            <LinkHoverCardTitle preview={preview} />
            <Divider color="charcoal.1" />
            <Group gap="md">
                <CopyLinkAction href={preview.href} actionRef={firstActionRef} />
                <LinkCardAction
                    isVisible={visibility.openInNewTab}
                    label={LINK_CARD_LABELS.openInNewTab}
                    icon={<ArrowSquareOutIcon size={ICON_SIZE} />}
                    onClick={onOpenInNewTab}
                />
                <LinkCardAction
                    isVisible={visibility.edit}
                    label={LINK_CARD_LABELS.edit}
                    icon={<PencilSimpleIcon size={ICON_SIZE} />}
                    onClick={onEdit}
                />
                <LinkCardAction
                    isVisible={visibility.remove}
                    label={LINK_CARD_LABELS.remove}
                    icon={<LinkBreakIcon size={ICON_SIZE} />}
                    onClick={onRemove}
                />
            </Group>
        </Stack>
    )
}

function LinkHoverCardTitle({ preview }: { preview: LinkPreview }) {
    if (preview.kind === 'unavailable') return <UnavailableTitle />
    if (preview.kind === 'internal') return <InternalTitle preview={preview} />

    return <UrlTitle href={preview.href} />
}

function UrlTitle({ href }: { href: string }) {
    return (
        <Anchor
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            underline="hover"
            fz={14}
            fw={600}
            c="blue.7"
            className={classes.url}
        >
            {href}
        </Anchor>
    )
}

function InternalTitle({ preview }: { preview: Extract<LinkPreview, { kind: 'internal' }> }) {
    return (
        <Stack gap={4}>
            <Anchor
                href={preview.href}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                fz={14}
                fw={600}
                c="charcoal.9"
                className={classes.url}
            >
                {preview.title}
            </Anchor>
            <Text fz={12} c="charcoal.7">
                {formatCategoryLine(preview.category)}
            </Text>
        </Stack>
    )
}

function UnavailableTitle() {
    return (
        <Stack gap={4}>
            <Text fz={14} fw={600} c="charcoal.9">
                {UNAVAILABLE_LINK_TITLE}
            </Text>
            <Text fz={12} c="charcoal.7">
                {UNAVAILABLE_LINK_BODY}
            </Text>
        </Stack>
    )
}

function CopyLinkAction({ href, actionRef }: { href: string; actionRef?: Ref<HTMLButtonElement> }) {
    const clipboard = useClipboard({ timeout: COPIED_RESET_MS })
    const tooltip = clipboard.copied ? LINK_CARD_LABELS.copied : LINK_CARD_LABELS.copy
    const icon = clipboard.copied ? (
        <CheckIcon size={ICON_SIZE} color="var(--mantine-color-green-9)" />
    ) : (
        <CopyIcon size={ICON_SIZE} />
    )

    return (
        <>
            <LinkCardAction
                label={tooltip}
                ariaLabel={LINK_CARD_LABELS.copy}
                icon={icon}
                actionRef={actionRef}
                onClick={() => clipboard.copy(href)}
            />
            <CopyAnnouncement isCopied={clipboard.copied} />
        </>
    )
}

/**
 * Always mounted: a live region added to the DOM at the same moment as its text is not reliably
 * announced.
 */
function CopyAnnouncement({ isCopied }: { isCopied: boolean }) {
    const message = isCopied ? LINK_COPIED_ANNOUNCEMENT : ''

    return (
        <VisuallyHidden role="status" aria-live="polite">
            {message}
        </VisuallyHidden>
    )
}

interface LinkCardActionProps {
    isVisible?: boolean
    label: string
    ariaLabel?: string
    icon: ReactNode
    actionRef?: Ref<HTMLButtonElement>
    onClick?: () => void
}

function LinkCardAction({ isVisible = true, label, ariaLabel, icon, actionRef, onClick }: LinkCardActionProps) {
    if (!isVisible) return null

    return (
        <Tooltip label={label} events={TOOLTIP_EVENTS}>
            <ActionIcon
                ref={actionRef}
                className={classes.action}
                variant="subtle"
                color="charcoal.7"
                size={28}
                radius="sm"
                aria-label={ariaLabel ?? label}
                onClick={onClick}
            >
                {icon}
            </ActionIcon>
        </Tooltip>
    )
}
