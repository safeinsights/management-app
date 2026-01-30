'use client'

import { Container, Stack, Text, Title } from '@mantine/core'
import { useResearcherProfile } from '@/hooks/use-researcher-profile'
import {
    PersonalInfoSection,
    EducationSection,
    CurrentPositionsSection,
    ResearchDetailsSection,
} from '@/components/researcher-profile'

export function ResearcherProfileClientPage() {
    const { data, refetch } = useResearcherProfile()

    return (
        <Container size="lg" py="xl">
            <Stack gap="xl">
                <Title order={1}>Researcher Profile</Title>
                <Text c="dimmed">
                    Create and manage your researcher profile. Adding professional details helps establish your
                    credibility and allows Data Organizations to view your published work, credentials, and professional
                    background. Those pursuing a graduate degree will be able to share their background and interests.
                </Text>

                <PersonalInfoSection data={data} refetch={refetch} />

                <EducationSection data={data} refetch={refetch} />

                <CurrentPositionsSection data={data} refetch={refetch} />

                <ResearchDetailsSection data={data} refetch={refetch} />
            </Stack>
        </Container>
    )
}
