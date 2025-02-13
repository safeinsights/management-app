import NextLink from 'next/link'
import { Anchor as MantineAnchor, AnchorProps, Button, ButtonProps } from '@mantine/core'

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

export const ButtonLink: React.FC<ButtonLinkProps> = ({ href, target, children, ...anchorProps }) => (
    <Button component={Link} href={href} target={target} {...anchorProps}>
        {children}
    </Button>
)
