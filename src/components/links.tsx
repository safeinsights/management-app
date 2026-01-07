'use client'

import { Anchor as MantineAnchor, AnchorProps, Button, ButtonProps } from '@mantine/core'
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
