import * as React from 'react'
import { BackupCodeResource } from '@clerk/types'
import { reportError } from '@/components/errors'
import { useUser } from '@clerk/nextjs'

// Generate and display backup codes
export function GenerateBackupCodes() {
    const { user } = useUser()
    const [backupCodes, setBackupCodes] = React.useState<BackupCodeResource | undefined>(undefined)

    const [loading, setLoading] = React.useState(false)

    React.useEffect(() => {
        if (backupCodes) {
            return
        }

        setLoading(true)
        void user
            ?.createBackupCode()
            .then((backupCode: BackupCodeResource) => {
                setBackupCodes(backupCode)
                setLoading(false)
            })
            .catch((err) => {
                reportError(err, 'Failed to generate backup codes')
                setLoading(false)
            })
    }, [backupCodes, user])

    if (loading) {
        return <p>Loading...</p>
    }

    if (!backupCodes) {
        return <p>There was a problem generating backup codes</p>
    }

    return (
        <ol>
            {backupCodes.codes.map((code, index) => (
                <li key={index}>{code}</li>
            ))}
        </ol>
    )
}
