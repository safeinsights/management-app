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
        <Paper bg="#f5f5f5" shadow="none" p={30} mt={30} radius="sm">
          <HookForm
            control={control}
            onSubmit={(e) => console.log(e.data)}
            onError={(e) => console.log(e)}
          >
          <Text size="xl" ta="left" mb={30}>STUDY Proposal Form</Text>
          <Text size="xl" ta="left">STUDY DETAILS</Text>
            <Group  p={2} gap="md">
              <Text>Study Title</Text>
              <Input name="textInput" control={control} aria-label="Study Title" radius="none">Placeholder-will programatically pull in value from pre-proposal stage</Input>
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
              <Paper withBorder><Text>IRB document.pdf</Text></Paper>
            </Group>
          
          <Text size="xl" ta="left" mt={50}>REQUESTED DATA DETAILS</Text>
          <Stack align="stretch">
            <Group p={2} gap="lg">
              <Text>Data Steward</Text>
              <Select name="select" control={control} aria-label="Your favorite library" placeholder="Pick value" data={['Openstax']}/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Datasets of Interest</Text>
              <Checkbox label="Highhlights and Notes"></Checkbox>
              <Checkbox label="Event Capture"></Checkbox>
            </Group>
            <Group p={2} gap="lg">
              <Text>Data Format</Text>
              <Input name="textInput" control={control} aria-label="Data Format" radius="none"/>
            </Group>
            <Group p={2} gap="lg">
              <Text>Container URL</Text>
              <Input name="textInput" control={control} aria-label="Container URL" radius="none">Placeholder-will pull in value programatically</Input>
            </Group>
          </Stack>
          <Group mt={30} justify="flex-end">
                <Button type="submit" variant="default">Submit Proposal</Button>
          </Group>
          </HookForm>
        </Paper>
      </Container>

    </div>
  );
}
