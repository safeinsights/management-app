import Link from 'next/link'
import { Button, type ButtonProps } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { MouseEventHandler } from 'react'

type ButtonLinkProps = ButtonProps & {
    href: string
    target?: string
    rel?: string
}

export const ButtonNav: React.FC<ButtonLinkProps> = ({ href, children, target, rel, ...buttonProps }) => {
    const [isBusy, { open: setBusy }] = useDisclosure()

    const handleClicks = Boolean(target !== '_blank' && rel !== 'external')

    const onClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
        if (event.button != null && event.button > 0) return // 0 == main button
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        if (event.defaultPrevented) return

        setBusy()
    }
    return (
        <Link href={href} onClick={handleClicks ? onClick : undefined} target={target} rel={rel}>
            <Button {...buttonProps} aria-busy={isBusy} disabled={isBusy} loading={isBusy}>
                {children}
            </Button>
        </Link>
    )
}
