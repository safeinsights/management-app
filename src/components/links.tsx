'use client'
// ↑ server-rendering doesn't like passing Link to component or if props contain icons

import { Anchor as MantineAnchor, AnchorProps, Button, ButtonProps } from '@mantine/core'
import { ArrowSquareOutIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, ReactNode, useEffect, useState } from 'react'
import NextLink from 'next/link'

export type LinkProps = AnchorProps & {
    href: string
    target?: string
    children: ReactNode
    download?: string
}

export const Link: FC<LinkProps> = ({ href, target, children, download, ...anchorProps }) => (
    <NextLink href={href} target={target} passHref download={download}>
        <MantineAnchor component="span" {...anchorProps}>
            {children}
        </MantineAnchor>
    </NextLink>
)

export type ButtonLinkProps = ButtonProps & {
    href: string
    target?: string
    children: ReactNode
}

export type DownloadLinkProps = AnchorProps & {
    filename: string
    content: ArrayBuffer
    target?: string
}

export const ButtonLink: FC<ButtonLinkProps> = ({ href, target, children, ...anchorProps }) => (
    <Button component={Link} href={href} target={target} {...anchorProps}>
        {children}
    </Button>
)

export const DownloadResultsLink: FC<DownloadLinkProps> = ({ filename, content, target }) => {
    const [href, setHref] = useState('#')

    useEffect(() => {
        const blob = new Blob([content], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        setHref(url)

        return () => URL.revokeObjectURL(url)
    }, [content])

    return (
        <Link
            href={href}
            target={target}
            data-testid="download-link"
            download={filename}
            style={{ display: 'flex', alignItems: 'center' }}
        >
            Download <DownloadSimpleIcon size={16} style={{ marginLeft: 4 }} />
        </Link>
    )
}

export const ViewResultsLink: FC<{ content: ArrayBuffer }> = ({ content }) => {
    const handleClick = () => {
        const decoder = new TextDecoder('utf-8')
        const decodedString = decoder.decode(content)
        const tab = window.open('about:blank', '_blank')
        if (!tab) {
            reportError('failed to open results window')
        }
        tab?.document.write(decodedString)
        tab?.document.close()
    }

    return (
        <MantineAnchor onClick={handleClick} style={{ display: 'flex', alignItems: 'center' }}>
            View <ArrowSquareOutIcon size={16} style={{ marginLeft: 4 }} />
        </MantineAnchor>
    )
}
