'use client'

import { Anchor as MantineAnchor, AnchorProps, ElementProps, Button, ButtonProps } from '@mantine/core'
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

export const LinkWithIcon: FC<LinkWithIconProps> = ({ icon, iconPosition = 'trailing', children, ...anchorProps }) => (
    <MantineAnchor
        c="blue.7"
        fz="sm"
        fw={600}
        display="inline-flex"
        style={{ alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}
        {...anchorProps}
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
