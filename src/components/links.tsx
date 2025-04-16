import { AnchorProps, Button, ButtonProps, Anchor as MantineAnchor } from '@mantine/core'
import { Download } from '@phosphor-icons/react/dist/ssr'
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

export const DownloadLink: React.FC<DownloadLinkProps> = ({ filename, content, target }) => {
    return (
        <NextLink
            href={'data:text/plain;base64,' + btoa(String.fromCharCode(...new Uint8Array(content)))}
            target={target}
            download={filename}
        >
            <Button rightSection={<Download />}>Download {filename}</Button>
        </NextLink>
    )
}
