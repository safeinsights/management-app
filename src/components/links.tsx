'use client'

import { Anchor as MantineAnchor, AnchorProps, ElementProps, Button, ButtonProps, Text } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { EMPTY_CELL } from '@/lib/dates'
import { FC, ReactNode } from 'react'
import NextLink from 'next/link'
import type { Route } from 'next'

export type LinkProps = AnchorProps & {
    href: Route
    target?: string
    children: ReactNode
}

export const Link: FC<LinkProps> = ({ href, target, children, ...anchorProps }) => (
    <MantineAnchor component={NextLink} href={href} target={target} {...anchorProps}>
        {children}
    </MantineAnchor>
)

export type LinkWithIconProps = AnchorProps &
    ElementProps<'a', keyof AnchorProps> & {
        icon: ReactNode
        iconPosition?: 'leading' | 'trailing'
        children: ReactNode
    }

export const LinkWithIcon: FC<LinkWithIconProps> = ({
    icon,
    iconPosition = 'trailing',
    children,
    style,
    ...anchorProps
}) => (
    <MantineAnchor
        c="blue.7"
        fz="sm"
        fw={600}
        display="inline-flex"
        {...anchorProps}
        // Merged, not replaced, so a caller's `style` cannot drop the icon+text flex layout.
        style={{ alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0, ...style }}
    >
        {iconPosition === 'leading' && icon}
        {children}
        {iconPosition === 'trailing' && icon}
    </MantineAnchor>
)

export type ButtonLinkProps = ButtonProps & {
    href: Route
    target?: string
    children: ReactNode
    fullWidth?: boolean
}

export const ButtonLink: FC<ButtonLinkProps> = ({ href, target, children, ...anchorProps }) => (
    <Button component={NextLink} href={href} target={target} {...anchorProps}>
        {children}
    </Button>
)

// One rendering of "open the agreement PDF", shared by every legal table and panel. Null carries
// through from an unsigned row, so callers need no guard of their own.
export const PdfLink: FC<{ downloadUrl: string | null }> = ({ downloadUrl }) => {
    if (!downloadUrl) return <Text c="dimmed">{EMPTY_CELL}</Text>

    return (
        <LinkWithIcon href={downloadUrl} target="_blank" rel="noreferrer" icon={<ArrowSquareOutIcon size={14} />}>
            PDF
        </LinkWithIcon>
    )
}
