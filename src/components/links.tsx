'use client'
// ↑ server-rendering doesn't like passing Link to component or if props contain icons
import { AnchorProps, Button, ButtonProps, Anchor as MantineAnchor } from '@mantine/core'
import { DownloadIcon, ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import NextLink from 'next/link'
import { FC, ReactNode } from 'react'

export type LinkProps = AnchorProps & {
    href: string
    target?: string
    children: ReactNode
}

export const Link: FC<LinkProps> = ({ href, target, children, ...anchorProps }) => (
    <NextLink href={href} target={target} passHref>
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
    return (
        <NextLink
            href={'data:text/plain;base64,' + btoa(String.fromCharCode(...new Uint8Array(content)))}
            target={target}
            data-testid="download-link"
            download={filename}
        >
            <Button rightSection={<DownloadIcon />}>Download Results</Button>
        </NextLink>
    )
}

export const ViewResultsLink: FC<{ content: ArrayBuffer }> = ({ content }) => {
    const handleClick = () => {
        const decoder = new TextDecoder('utf-8')
        const decodedString = decoder.decode(content)
        const tab = window.open('about:blank', '_blank')
        for (let i = 0; i < 1000; i++) {
            tab?.document.write(decodedString)
        }
        tab?.document.close()
    }

    return (
        <Button onClick={handleClick} rightSection={<ArrowSquareOutIcon />}>
            View Results (Opens in new tab)
        </Button>
    )
}
