'use client'

import { Anchor as MantineAnchor, AnchorProps, ElementProps, Button, ButtonProps } from '@mantine/core'
import clsx from 'clsx'
import { FC, ReactNode } from 'react'
import NextLink from 'next/link'
import type { Route } from 'next'
import { fontWeight, semanticColor } from '@/theme/tokens'
import classes from './links.module.css'

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
    className,
    ...anchorProps
}) => (
    <MantineAnchor
        c={semanticColor('link.default')}
        fz="sm"
        fw={fontWeight.semibold}
        display="inline-flex"
        {...anchorProps}
        // Merged, not replaced, so a caller's `className` cannot drop the icon+text flex layout.
        className={clsx(classes.linkWithIcon, className)}
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
