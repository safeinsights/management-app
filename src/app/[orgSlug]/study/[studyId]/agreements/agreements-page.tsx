'use client'

import { useRouter } from 'next/navigation'
import { Alert, Button, Divider, Group, Paper, Stack, Text, Title, useMantineTheme } from '@mantine/core'
import { CaretLeftIcon, InfoIcon } from '@phosphor-icons/react'
import type { Route } from 'next'

interface AgreementsPageProps {
    isReviewer: boolean
    proceedHref: string
    previousHref: string
}

interface SectionProps {
    stepLabel: string
    title: string
    description: string
}

const SECTION_DESCRIPTIONS = {
    dua: 'A set of tailored Data Use Agreements will be made available here. These documents will clearly define the constraints and responsibilities for both the researcher and the Data Organization, as well as the specific parameters governing your study and the use of the requested datasets. Once both parties agree to the terms in these agreements, they can proceed to the next steps.',
    irb: 'An Umbrella Institutional Review Board (IRB) Protocol, with Rice as the IRB of record, will be available to cover all standard base enclave research projects. If your home institution requires separate IRB approval, you will be able to upload your institutionally approved protocol here.',
    sow: "This section will provide a detailed Statement of Work (SOW) and an estimated cost for your study, which will require your agreement to proceed. Depending on our evolving business model, elements of the SOW and payment information may become accessible at different stages of your study's execution.",
}

const RESEARCHER_SECTIONS: SectionProps[] = [
    {
        stepLabel: 'STEP 3A',
        title: 'Data use agreement',
        description: SECTION_DESCRIPTIONS.dua,
    },
    {
        stepLabel: 'STEP 3B',
        title: 'IRB protocol',
        description: SECTION_DESCRIPTIONS.irb,
    },
    {
        stepLabel: 'STEP 3C',
        title: 'Payment and statement of work',
        description: SECTION_DESCRIPTIONS.sow,
    },
]

const REVIEWER_SECTIONS: SectionProps[] = [
    {
        stepLabel: 'STEP 2A',
        title: 'Data use agreement',
        description: SECTION_DESCRIPTIONS.dua,
    },
    {
        stepLabel: 'STEP 2B',
        title: 'IRB protocol',
        description: SECTION_DESCRIPTIONS.irb,
    },
    {
        stepLabel: 'STEP 2C',
        title: 'Payment and statement of work',
        description: SECTION_DESCRIPTIONS.sow,
    },
]

function AgreementSection({ stepLabel, title, description }: SectionProps) {
    const theme = useMantineTheme()

    return (
        <Paper p="xl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                {stepLabel}
            </Text>
            <Title order={4}>{title}</Title>
            <Divider my="sm" mb="md" />
            <Alert
                icon={<InfoIcon weight="fill" color={theme.colors.blue[6]} />}
                color="blue"
                mb="md"
                styles={{ body: { gap: 8 } }}
            >
                This feature is currently under construction.
            </Alert>
            <Text fz="sm">
                <Text component="span" fw={700} fz="sm">
                    What to expect:{' '}
                </Text>
                {description}
            </Text>
        </Paper>
    )
}

export function AgreementsPage({ isReviewer, proceedHref, previousHref }: AgreementsPageProps) {
    const router = useRouter()

    const sections = isReviewer ? REVIEWER_SECTIONS : RESEARCHER_SECTIONS
    const proceedLabel = isReviewer ? 'Proceed to Step 3' : 'Proceed to Step 4'

    const handleProceed = () => router.push(proceedHref as Route)
    const handlePrevious = () => router.push(previousHref as Route)

    return (
        <>
            <Stack gap="xl">
                {sections.map((section) => (
                    <AgreementSection key={section.title} {...section} />
                ))}
            </Stack>

            <Group mt="xxl" style={{ width: '100%' }}>
                <Group style={{ marginLeft: 'auto' }}>
                    <Button
                        type="button"
                        size="md"
                        variant="subtle"
                        onClick={handlePrevious}
                        leftSection={<CaretLeftIcon />}
                    >
                        Previous
                    </Button>
                    <Button type="button" variant="primary" size="md" onClick={handleProceed}>
                        {proceedLabel}
                    </Button>
                </Group>
            </Group>
        </>
    )
}
