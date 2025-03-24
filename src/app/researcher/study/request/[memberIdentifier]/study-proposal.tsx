'use client'

import React, { FC } from 'react'
import { Anchor, Divider, FileInput, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { FileDoc, FilePdf, FileText, UploadSimple } from '@phosphor-icons/react/dist/ssr'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-schema'

//TODO: Finish - Update the file upload icon to match the file type of the document
const Icons: [RegExp, React.ReactNode][] = [
    [/\.docx?$/i, <FileDoc key="doc" size={14} color="#291bc4" />],
    [/\.txt$/i, <FileText key="txt" size={14} color="#291bc4" />],
    [/\.pdf$/i, <FilePdf key="pdf" size={14} color="#291bc4" />],
]

const getFileUploadIcon = (fileName?: string | null) => {
    if (!fileName) return <UploadSimple size={14} color="#291bc4" weight="fill" />

    const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
    return matchedIcon || <UploadSimple size={14} color="#291bc4" weight="fill" />
}

export const StudyProposalForm: FC<{
    studyProposalForm: UseFormReturnType<StudyProposalFormValues>
}> = ({ studyProposalForm }) => {
    const fileUpload = getFileUploadIcon(studyProposalForm.values.descriptionDocument?.name)
    const irbFileUpload = getFileUploadIcon(studyProposalForm.values.irbDocument?.name)
    const agreementFileUpload = getFileUploadIcon(studyProposalForm.values.agreementDocument?.name)

    return (
        <Paper p="md">
            <Title order={4}>Study Proposal</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text>
                This section is key to your proposal, as it defines the analysis that will generate the results you’re
                intending to obtain from the Member’s data. Upload any necessary files to support your analysis. In this
                iteration, we currently support .r and .rmd files.
            </Text>
            <Stack gap="lg" mt="md">
                {/* TODO flesh out with UX/do when hifi-s ready */}
                <Group gap="xl">
                    <Text>Study Title</Text>
                    <TextInput
                        aria-label="Study Title"
                        placeholder="Enter a title (max. 50 characters)"
                        {...studyProposalForm.getInputProps('title')}
                    />
                </Group>

                <Group gap="xl">
                    <Text>Study Lead</Text>
                    <TextInput aria-label="Study Lead" disabled value="Researcher Name" />
                </Group>

                <Group gap="xl">
                    <Text>Principal Investigator</Text>
                    <TextInput aria-label="Principal Investigator" {...studyProposalForm.getInputProps('piName')} />
                </Group>

                <Group>
                    <Text>Study Description</Text>
                    {fileUpload}
                    <Stack gap={0}>
                        <FileInput
                            name="descriptionDocument"
                            component={Anchor}
                            aria-label="Upload Study Description Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.txt,.pdf"
                            {...studyProposalForm.getInputProps('descriptionDocument')}
                        />
                        <Text size="xs" c="dimmed">
                            Accepted formats: doc, docx, pdf and txt
                        </Text>
                    </Stack>
                </Group>

                <Group gap="xs">
                    <Text>IRB Document</Text>
                    {irbFileUpload}
                    <Stack gap={0}>
                        <FileInput
                            name="irbDocument"
                            component={Anchor}
                            aria-label="Upload IRB Document"
                            placeholder="Upload Document"
                            clearable
                            accept=".doc,.docx,.txt,.pdf"
                            key={studyProposalForm.key('irbDocument')}
                            {...studyProposalForm.getInputProps('irbDocument')}
                        />
                        <Text size="xs" c="dimmed">
                            Accepted formats: doc, docx, pdf and txt
                        </Text>
                    </Stack>
                </Group>

                            <TextInput
                                horizontal
                                label="Study Lead"
                                disabled
                                value="Researcher Name"
                                // value={user?.firstName + ' ' + user?.lastName}
                            />

                            <TextInput
                                horizontal
                                label="Principal Investigator"
                                key={studyProposalForm.key('piName')}
                                {...studyProposalForm.getInputProps('piName')}
                            />

                            <FileInput
                                label="Study Description"
                                name="descriptionDocument"
                                component={Anchor}
                                placeholder="Upload a document describing your study"
                                key={studyProposalForm.key('description')}
                                {...studyProposalForm.getInputProps('descriptionDocument')}
                            />

                            <FileInput
                                label="IRB Document"
                                name="irbDocument"
                                component={Anchor}
                                placeholder="Upload IRB approval document"
                                key={studyProposalForm.key('irbDocument')}
                                {...studyProposalForm.getInputProps('irbDocument')}
                            />

                            {/* <Text>Agreement Document</Text> TODO: Need Database column for this attribute */}
                            {/* <FileInput
                                    ref={fileRefs.agreementDocument}
                                    placeholder="Upload agreement document"
                                    required
                                    key={studyProposalForm.key('agreementDocument')}
                                    {...studyProposalForm.getInputProps('agreementDocument')}
                                    onChange={(file) => handleFileChange('agreementDocument', file)}
                                    style={{ display: 'none' }}
                                />
                                <Anchor
                                    component="button"
                                    onClick={() => fileRefs.agreementDocument.current?.click()}
                                    underline="always"
                                >
                                    Upload
                                </Anchor>
                                {fileNames.agreementDocument && (
                                    <Text> {fileNames.agreementDocument}</Text>
                                )} */}
                        </Stack>
                        <Stack mt="md">
                            <Flex direction="column" gap="sm">
                                {/* TODO: Need Database column for this attribute */}
                                {/* <FileInput

                                                    placeholder="Upload agreement document"
                                                    required
                                                    key={form.key('agreementDocument')}
                                                    {...form.getInputProps('agreementDocument')}
                                                /> */}
                            </Flex>
                        </Stack>
                    </Group>
                </Paper>
                <Group gap="xl" p={2} mt="xl" justify="flex-end">
                    <Button
                        fz="lg"
                        mb="lg"
                        type="button"
                        onClick={() => router.push(`/`)}
                        variant="outline"
                        color="#616161"
                    >
                        Cancel
                    </Button>
                    <Button
                        fz="lg"
                        mb="lg"
                        type="submit"
                        disabled={!studyProposalForm.isValid}
                        variant="filled"
                        color="#616161"
                        loading={isPending}
                    >
                        Next
                    </Button>
                </Group>
            </form>
        </>
    )
}
