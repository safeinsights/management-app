'use client'

import { useQuery } from '@/common'
import { Checkbox } from '@mantine/core'
import { useSession } from '@/hooks/session'
import { doesTestImageExistForStudyAction } from '@/server/actions/study.actions'

interface TestImageCheckboxProps {
    studyId: string
    checked: boolean
    onChange: (checked: boolean) => void
}

export const TestImageCheckbox: React.FC<TestImageCheckboxProps> = ({ studyId, checked, onChange }) => {
    const { session } = useSession()

    const { data: testImageExists, isLoading: isTestImageQueryLoading } = useQuery({
        queryKey: ['testImageExists', studyId],
        queryFn: () => doesTestImageExistForStudyAction({ studyId }),
        enabled: !!session?.team.isAdmin,
    })

    if (!session?.team.isAdmin || isTestImageQueryLoading || !testImageExists) {
        return null
    }

    return (
        <Checkbox
            data-testid="test-image-checkbox"
            checked={checked}
            style={{ marginLeft: 'auto' }}
            onChange={(event) => onChange(event.currentTarget.checked)}
            label="Run this code against test base image"
        />
    )
}
