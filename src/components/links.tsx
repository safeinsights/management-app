import NextLink from 'next/link'
import { Anchor as MantineAnchor, AnchorProps } from '@mantine/core'

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
