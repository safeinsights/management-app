'use client'
// ↑ server-rendering doesn't like passing Link to component or if props contain icons
import { AnchorProps, Button, ButtonProps, Anchor as MantineAnchor } from '@mantine/core'
import { useEffect, useState } from 'react'
import { DownloadIcon } from '@phosphor-icons/react/dist/ssr'
import NextLink from 'next/link'

export type LinkProps = AnchorProps & {
    href: string
    target?: string
    children: React.ReactNode
}

export const Link: React.FC<LinkProps> = ({ href, target, children, ...anchorProps }) => (
    <NextLink href={href} target={target} passHref>
        <MantineAnchor component="span" {...anchorProps}>
            {children}
        </MantineAnchor>
    </NextLink>
)

export type ButtonLinkProps = ButtonProps & {
    href: string
    target?: string
    children: React.ReactNode
}

export type DownloadLinkProps = AnchorProps & {
    filename: string
    content: ArrayBuffer
    target?: string
}

export const ButtonLink: React.FC<ButtonLinkProps> = ({ href, target, children, ...anchorProps }) => (
    <Button component={Link} href={href} target={target} {...anchorProps}>
        {children}
    </Button>
)

export const DownloadResultsLink: React.FC<DownloadLinkProps> = ({ filename, content, target }) => {
    const [href, setHref] = useState('#')

    useEffect(() => {
        const blob = new Blob([content], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        setHref(url)

        return () => URL.revokeObjectURL(url)
    }, [content])

    return (
        <NextLink href={href} target={target} data-testid="download-link" download={filename}>
            <Button rightSection={<DownloadIcon />}>Download Results</Button>
        </NextLink>
    )
}
