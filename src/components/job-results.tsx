'use client'

import { FC, useMemo, useState } from 'react'
import { Anchor, Group, LoadingOverlay, Stack, Text, useMantineTheme } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { useQuery } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { PrivateKeyForm } from '@/components/private-key-form'
import { isEncryptedLogType, isResultFile, logLabel } from '@/lib/file-type-helpers'
import { useDecryptFiles } from '@/hooks/use-decrypt-files'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { JobFileInfo } from '@/lib/types'
import { LatestJobForStudy } from '@/server/db/queries'

const ViewResultsLink: FC<{ content: ArrayBuffer }> = ({ content }) => {
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
        <Anchor role="button" onClick={handleClick} style={{ display: 'flex', alignItems: 'center' }}>
            View <ArrowSquareOutIcon size={16} style={{ marginLeft: 4 }} />
        </Anchor>
    )
}

// One file row. Label + name come from the encrypted metadata so the researcher sees what's
// available before decrypting; View/Download appear only once `decrypted` is set.
const FileRow: FC<{ label: string; name: string; decrypted?: JobFileInfo }> = ({ label, name, decrypted }) => {
    const theme = useMantineTheme()
    return (
        <Group gap="xs">
            <Text size="sm" fw={600}>
                {label}:
            </Text>
            <Text size="sm">{name}</Text>
            {decrypted && (
                <>
                    <ViewResultsLink content={decrypted.contents} />
                    <span style={{ height: 16, borderLeft: `1px solid ${theme.colors.charcoal[4]}` }}></span>
                    <DownloadBlobLink target="_blank" filename={name} fileContent={decrypted.contents} />
                </>
            )}
        </Group>
    )
}

// Researcher-facing view of shared results. There is no plaintext copy: the researcher
// decrypts the encrypted file bodies with their own key (the wrapped key the reviewer
// produced for them at approve). The file list is shown before decryption — names aren't
// secret, and the reviewer panel lists them too — and only View/Download are gated behind
// the key.
export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const [decryptedFiles, setDecryptedFiles] = useState<JobFileInfo[]>()

    const {
        data: encryptedFiles,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: ['encrypted-files', job.id],
        queryFn: async () => await fetchEncryptedJobFilesAction({ jobId: job.id }),
    })

    const {
        decrypt,
        isPending: isDecrypting,
        form,
    } = useDecryptFiles({
        encryptedFiles,
        onSuccess: setDecryptedFiles,
    })

    // One row per decrypted inner file once decrypted (each artifact is a whole-zip that unpacks
    // into many files); before that, one locked row per encrypted artifact. Researchers receive
    // results only — logs are never re-wrapped for them (DO-internal).
    const rows = useMemo(() => {
        if (decryptedFiles) {
            return decryptedFiles.map((f) => ({
                key: `${f.sourceId}-${f.path}`,
                label: logLabel(f.fileType),
                name: f.path,
                decrypted: f as JobFileInfo | undefined,
            }))
        }
        const files = encryptedFiles ?? []
        const ordered = [...files.filter(isResultFile), ...files.filter((f) => isEncryptedLogType(f.fileType))]
        return ordered.map((f) => ({
            key: f.studyJobFileId,
            label: logLabel(f.fileType),
            name: f.name,
            decrypted: undefined as JobFileInfo | undefined,
        }))
    }, [encryptedFiles, decryptedFiles])

    const handleSubmit = form.onSubmit((values) => decrypt(values.privateKey))

    if (isError) {
        return <ErrorAlert error={error} />
    }

    if (isLoading) {
        return <LoadingOverlay />
    }

    return (
        <Stack>
            {rows.map((row) => (
                <FileRow key={row.key} label={row.label} name={row.name} decrypted={row.decrypted} />
            ))}
            <PrivateKeyForm
                isVisible={!decryptedFiles}
                form={form}
                onSubmit={handleSubmit}
                isDecrypting={isDecrypting}
                submitLabel="View Results"
            />
        </Stack>
    )
}
