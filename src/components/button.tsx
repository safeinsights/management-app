import Link from 'next/link'
import { Button, type ButtonProps } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks';


export const ButtonNav: React.FC<{ href: string } & ButtonProps> = ({ href, children, ...buttonProps }) => {
    const [isBusy, { open: setBusy  }] = useDisclosure()

    return (
        <Link href={href} onClick={setBusy}>
            <Button {...buttonProps} aria-busy={isBusy} disabled={isBusy} loading={isBusy}>{children}</Button>
        </Link>
    )
}
