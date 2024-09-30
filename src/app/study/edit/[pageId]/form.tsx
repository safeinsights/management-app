'use client'
import React from 'react';
import { Form as HookForm, useForm } from "react-hook-form";
import {
  Checkbox,
  Chip,
  ColorInput,
  ColorPicker,
  DatePickerInput,
  FileInput,
  Input,
  JsonInput,
  NativeSelect,
  NumberInput,
  PasswordInput,
  PinInput,
  Radio,
  Rating,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Textarea,
  TextInput,
} from "react-hook-form-mantine";
import { AiOutlineCloseSquare } from "react-icons/ai";
import { Button, Group, Paper, Container, Stack, CloseButton, Text, Flex, rem } from "@mantine/core";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  checkbox: z.boolean(),
  chip: z.boolean(),
  chipgroupMultiple: z.array(z.string()),
  chipgroupSingle: z.string(),
  colorInput: z.string(),
  colorPicker: z.string(),
  datepicker: z.date().nullable(),
  fileInput: z.any(),
  jsonInput: z.string(),
  multiSelect: z.any(),
  nativeSelect: z.string(),
  numberInput: z.number(),
  passwordInput: z.string(),
  pinInput: z.string(),
  radio: z.string(),
  rating: z.number(),
  segmentedControl: z.string(),
  select: z.string(),
  slider: z.number(),
  switch: z.boolean(),
  textarea: z.string(),
  textInput: z.string(),
  transferList: z.any(),
});

type FormSchemaType = z.infer<typeof schema>;

export function Form() {
  const { control } = useForm<FormSchemaType>({
    resolver: zodResolver(schema),
    defaultValues: {
      checkbox: true,
      chip: true,
      chipgroupMultiple: [],
      chipgroupSingle: "react",
      colorInput: "",
      colorPicker: "",
      datepicker: null,
      fileInput: null,
      jsonInput: "",
      multiSelect: [],
      nativeSelect: "",
      numberInput: 18,
      passwordInput: "",
      pinInput: "",
      radio: "",
      rating: 2,
      segmentedControl: "",
      select: "",
      slider: 40,
      switch: false,
      textarea: "",
      textInput: "",
    },
  });

  const icon = <AiOutlineCloseSquare style={{ width: rem(18), height: rem(18) }}/>;
  return (
    <div className="App">
      <Container size={1000}>
        <Paper  bg="#d3d3d3" shadow="none" p={10} mt={30} mb={-30} radius="sm ">
          <Group justify="space-between" gap="xl">
            <Text ta="left">Study Proposal Form</Text>
            <CloseButton aria-label="Close form" />
          </Group>
        </Paper>
        <Paper bg="#f5f5f5" shadow="none" p={30} mt={30} radius="sm">
          <HookForm
            control={control}
            onSubmit={(e) => console.log(e.data)}
            onError={(e) => console.log(e)}
          >
          <Text size="xl" ta="left">STUDY DETAILS</Text>
            <Group  p={2} gap="md">
              <Text>Study Name</Text>
              <Input name="textInput" control={control} aria-label="Study Name" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Principal Investigator</Text>
              <Input name="textInput" control={control} aria-label="Prinicipal Investigator" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Organization</Text>
              <Input name="textInput" control={control} aria-label="Organization" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Study Description</Text>
              <Textarea name="textarea"  control={control} aria-label="Study Description" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>IRB Approval Documentation</Text>
              <FileInput name="fileInput"  control={control} aria-label="IRB Approval Documentation" leftSection={icon} placeholder="Attach Files (Supported file formats: .pdf, .docx, xxx" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Supporting documents</Text>
              <FileInput name="fileInput" control={control} aria-label="IRB Approval Documentation"radius="none"/>
              <Button leftSection={icon} bg="none" c="#000000">Attach File</Button>
            </Group>
            <Group p={2} gap="lg">
              <Button leftSection={icon} bg="none" c="#000000">Add another</Button>
            </Group>
          

          <Text size="xl" ta="left" mt={50}>REQUESTED DATA DETAILS</Text>
          <Stack align="stretch">
            <Group p={2} gap="lg">
              <Text>Data dictionary folder name</Text>
              <Input name="textInput" control={control} aria-label="data dictionary folder name" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Data link in Knowledge Base</Text>
              <Input name="textInput" control= {control} aria-label="Data link in Knowledge Base" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Data Steward</Text>
              <Input name="textInput" control={control} aria-label="Data Steward" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Specific datasets of interest</Text>
              <Textarea name="textarea"  control={control} aria-label="Specific datasets of interest" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Data analysis deliverable format</Text>
              <Textarea name="textarea" control={control} aria-label="Data analysis deliverable format" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Research code container link</Text>
              <Input name="textInput" control={control} aria-label="Research code container link" radius="none"/>
            </Group>
          </Stack>
          <Group mt={30} justify="flex-end">
                <Button type="submit" variant="default">Save For Later</Button>
                <Button type="submit" bg="#636363">Review</Button>
          </Group>
          </HookForm>
        </Paper>
      </Container>

    </div>
  );
}
