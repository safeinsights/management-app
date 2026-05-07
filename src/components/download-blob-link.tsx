import { Anchor, type AnchorProps } from '@mantine/core'
import { DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { type AnchorHTMLAttributes, type FC, useEffect, useState } from 'react'

type DownloadBlobLinkProps = Omit<
    AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>,
    'children' | 'download' | 'href'
> & {
    filename: string
    fileContent: BlobPart
}

export const DownloadBlobLink: FC<DownloadBlobLinkProps> = ({ filename, fileContent, ...anchorProps }) => {
    const [href, setHref] = useState('#')

    useEffect(() => {
        const blob = new Blob([fileContent])
        const url = URL.createObjectURL(blob)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHref(url)

        return () => URL.revokeObjectURL(url)
    }, [fileContent])

    return (
        <Anchor
            {...anchorProps}
            href={href}
            download={filename}
            data-testid="download-link"
            style={{ display: 'flex', alignItems: 'center' }}
        >
            Download <DownloadSimpleIcon size={16} style={{ marginLeft: 4 }} />
        </Anchor>
    )
}
