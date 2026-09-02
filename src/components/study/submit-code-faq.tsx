'use client'

import { useEffect, useRef, useState, type FC, type ReactNode } from 'react'
import { Accordion, Group, Stack, Text } from '@mantine/core'
import {
    CaretRightIcon,
    CaretUpDownIcon,
    CaretUpIcon,
    DatabaseIcon,
    FileCodeIcon,
    FloppyDiskIcon,
    HandWithdrawIcon,
    LockIcon,
    QuestionIcon,
    StarIcon,
} from '@phosphor-icons/react/dist/ssr'
import { useMutation } from '@/common'
import { markSubmitCodeFaqSeenAction } from '@/server/actions/submit-code-faq.actions'

const FAQ_ITEM_VALUE = 'submit-code-faq'
const FAQ_HEADER = 'New to SafeInsights IDE? Start here.'

const QUESTION_ICON_SIZE = 16
const SECTION_ICON_SIZE = 14
/** Figma `body/sm` and `label/md` are both 14px here. */
const SECTION_FONT_SIZE = 14
/** Icon width plus the 8px gap beside it, so an answer lines up under its question. */
const ANSWER_INDENT = 22

/**
 * Figma's `alpha/blue30`. Left as the literal token value because the theme has no blue this
 * light — `blue.0` is several steps darker — and adding a scale step is a wider change than
 * this card.
 */
const PANEL_BACKGROUND = 'rgba(231, 241, 254, 0.3)'

const ACCORDION_STYLES = {
    item: { borderColor: 'var(--mantine-color-charcoal-1)' },
    control: { backgroundColor: 'var(--mantine-color-grey-10)' },
    panel: { backgroundColor: PANEL_BACKGROUND },
    content: { paddingInline: 16, paddingBlock: 24 },
} as const

type FaqEntry = {
    icon: ReactNode
    question: string
    answer: ReactNode
}

/**
 * A function of the Data Partner rather than a constant: three of the answers name them. Two
 * interpolate the name; "What is example data?" deliberately says "a Data Partner" in the
 * generic, which is how the card words it.
 */
const faqEntries = (dataPartnerName: string): FaqEntry[] => [
    {
        icon: <CaretUpDownIcon size={SECTION_ICON_SIZE} />,
        question: 'What is the SafeInsights IDE?',
        answer: 'It is a research workspace built on VS Code. You can explore preloaded example data, build and test code with the same libraries as a Data Partner’s secure enclave, ask an AI assistant about the datasets, and preview your outputs. Because previews run on example data, they confirm your code works, not what your findings will be.',
    },
    {
        icon: <LockIcon size={SECTION_ICON_SIZE} />,
        question: 'Who can use the SafeInsights IDE for a study?',
        answer: 'Each study’s IDE is assigned to the first person who launches it. Once launched, access cannot be shared or transferred. Confirm with your team who will be coding before anyone launches the IDE. If the assigned person becomes unavailable, contact support to discuss your options.',
    },
    {
        icon: <DatabaseIcon size={SECTION_ICON_SIZE} />,
        question: 'What is example data?',
        answer: 'It is an example dataset from a Data Partner that mirrors the structure of the real data in their secure enclave but uses made-up values. You can test your code against it safely, without accessing real data or using an enclave run. Because the values are not real, your example outputs will be different from your actual findings.',
    },
    {
        icon: <FileCodeIcon size={SECTION_ICON_SIZE} />,
        question: 'What is the main file?',
        answer: 'It is the file that runs first in the secure enclave. It can call other files in your study. Select your main file before submitting.',
    },
    {
        icon: <StarIcon size={SECTION_ICON_SIZE} />,
        question: 'What is the main file template?',
        answer: (
            <>
                It is a template from {dataPartnerName} that connects to their dataset. You’ll see it listed below, and
                it’s pre-loaded as your starting point when you click{' '}
                <Text span fz={SECTION_FONT_SIZE} fw={600}>
                    Launch IDE.
                </Text>{' '}
                Leave the fixed setup code unchanged, or your code will not work correctly. The rest is a working
                example with reference notes you can edit or replace with your own code.
            </>
        ),
    },
    {
        icon: <FloppyDiskIcon size={SECTION_ICON_SIZE} />,
        question: 'Is my work saved if I close this tab or the IDE?',
        answer: 'Yes. Your work is automatically saved here in your study’s workspace, so you can safely log out or close either the SI tab or IDE tab and pick up right where you left off.',
    },
    {
        icon: <HandWithdrawIcon size={SECTION_ICON_SIZE} />,
        question: 'What happens after I submit my code?',
        answer: `${dataPartnerName} will review your code before it runs in their secure enclave against real data. Once the analysis is complete, ${dataPartnerName} will review the outputs and share them with you. You will receive an email when your outputs are available.`,
    },
]

const FaqSection: FC<FaqEntry> = ({ icon, question, answer }) => (
    // Keyed on the question so a test can pair a heading with its own answer without walking the
    // DOM; the two are separate nodes, and the template answer is split by an emphasised span.
    <Stack gap={0} data-testid={`faq-section-${question}`}>
        <Group gap="xs" wrap="nowrap">
            {icon}
            <Text fz={SECTION_FONT_SIZE} fw={700} lh={1.2} c="charcoal.9">
                {question}
            </Text>
        </Group>
        <Text fz={SECTION_FONT_SIZE} c="charcoal.9" pl={ANSWER_INDENT}>
            {answer}
        </Text>
    </Stack>
)

/**
 * Records the visit so the next one gets the FAQ collapsed. Only fires when this IS the first
 * visit: a returning researcher has nothing to write, and the ref keeps a re-render from firing
 * it twice. The action guards on `is null` as well, so a duplicate would be a no-op regardless.
 */
function useMarkFaqSeen(isFirstVisit: boolean) {
    const { mutate } = useMutation({ mutationFn: () => markSubmitCodeFaqSeenAction() })
    const hasMarked = useRef(false)

    useEffect(() => {
        if (!isFirstVisit || hasMarked.current) return

        hasMarked.current = true
        mutate()
    }, [isFirstVisit, mutate])
}

type SubmitCodeFaqProps = {
    dataPartnerName: string
    /** True only on a researcher's very first Submit code page, across any study. */
    isFirstVisit: boolean
}

export const SubmitCodeFaq: FC<SubmitCodeFaqProps> = ({ dataPartnerName, isFirstVisit }) => {
    const [openValue, setOpenValue] = useState<string | null>(isFirstVisit ? FAQ_ITEM_VALUE : null)
    useMarkFaqSeen(isFirstVisit)

    const entries = faqEntries(dataPartnerName)
    // caretRight collapsed, caretUp expanded, per the card. Mantine's own rotation turns a chevron
    // through 180°, which would point the collapsed caret left, hence swapping the icon instead.
    const chevron = openValue ? <CaretUpIcon size={QUESTION_ICON_SIZE} /> : <CaretRightIcon size={QUESTION_ICON_SIZE} />

    return (
        <Accordion
            value={openValue}
            onChange={setOpenValue}
            chevron={chevron}
            disableChevronRotation
            variant="contained"
            radius="md"
            styles={ACCORDION_STYLES}
            data-testid="submit-code-faq"
        >
            <Accordion.Item value={FAQ_ITEM_VALUE}>
                <Accordion.Control
                    icon={<QuestionIcon size={QUESTION_ICON_SIZE} weight="fill" color="var(--mantine-color-blue-7)" />}
                >
                    <Text fw={600} c="charcoal.9">
                        {FAQ_HEADER}
                    </Text>
                </Accordion.Control>
                <Accordion.Panel>
                    <Stack gap="md">
                        {entries.map((entry) => (
                            <FaqSection key={entry.question} {...entry} />
                        ))}
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        </Accordion>
    )
}
