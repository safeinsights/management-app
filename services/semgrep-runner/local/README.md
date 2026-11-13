# Run the Semgrep runner locally

`run-local` runs the runner image the way AWS Lambda runs it, sends it one request, and prints the
result. It needs only Docker, on Linux or macOS. Nothing runs on the host except Docker commands.

## Requirements

- Docker (Docker Desktop on macOS, Docker Engine on Linux).
- The image is `linux/amd64`, like the Lambda function. On Apple Silicon, Docker emulates it.

## Build the image

```bash
DOCKER_REPO=local/semgrep-runner pnpm run build:semgrep-runner
```

Or add `--build` to a `run-local` command.

## Test mode

Test mode sends rule YAML and test files in the request. The runner scans the test files with the
production pipeline and runs the Semgrep fixture test for the `# ruleid:` and `# ok:` lines.

```bash
pnpm run semgrep-runner:local test <rules folder> <test files folder>
```

Example with the rules and fixtures of the iac repository, next to this repository:

```bash
pnpm run semgrep-runner:local test \
    ../iac/management-app/codebuild/scripts/semgrep-rules \
    ../iac/management-app/codebuild/semgrep-tests
```

- Only rule files go into the request: `.yaml` or `.yml`, not `*.test.yaml`, no `.fixed` suffix, no
  path part that starts with a dot.
- The fixture test pairs `rules/<dir>/<stem>.yaml` with `<dir>/<stem>.<any extension>` and with every
  file under `<dir>/<stem>/` in the test files folder.
- The request must stay below 6 MB, the Lambda limit. The script warns above it.

## Scan mode

Scan mode reads the submission and the ruleset from S3. The script starts a throwaway S3 (SeaweedFS),
uploads the submission folder and the rules folder, and then sends the scan request.

```bash
pnpm run semgrep-runner:local scan <submission folder> <rules folder>
```

## Output

- On the terminal: a summary line (outcome, error code, findings, fixture checks, time), the failed
  checks, and the reviewer log (first line `Semgrep Scan: <phrase>`).
- In a file: the full JSON response. The script prints the path. Use `--out <file>` for a fixed path.
- Exit code 0 when the runner returned a response, also for `DID-NOT-COMPLETE`. Exit code 1 for a
  function error, for example a request that is not valid.

## Options

| Option            | Default                       | Use                                                                              |
| ----------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| `--build`         | off                           | Build the image first.                                                           |
| `--image <ref>`   | `local/semgrep-runner:latest` | Run another image.                                                               |
| `--out <file>`    | a new temp file               | File for the full JSON response.                                                 |
| `--timeout <s>`   | `900`                         | Lambda timeout. The runner stops 15 s before it and returns `error: 'deadline'`. |
| `--memory <size>` | `2048m`                       | Memory of the runner container.                                                  |
| `--cpus <n>`      | no limit                      | CPUs of the runner container.                                                    |

## What the script creates and removes

For each run: one Docker network and the runner container, plus a SeaweedFS container in scan mode.
Their names start with `semgrep-runner-local-`, and the script removes them when it ends, also after an
error or Ctrl-C. The short-lived AWS CLI and helper containers remove themselves (`--rm`). No container
publishes a port on the host, and the input folders are mounted read-only.

The runner container has the Lambda limits: a read-only file system, a 512 MB `/tmp`, and no
`/dev/shm`. The Lambda Runtime Interface Emulator of the AWS base image takes the request.

## Limits

- Times are not Lambda times.
- No IAM, no cross-account read of the rules bucket, and no `ExpectedBucketOwner` check: SeaweedFS has
  no account owner.
- SeaweedFS refuses S3 keys with `..` or `.` segments and changes a backslash to `/`, so scan mode cannot
  show what the runner does with such keys. The unit tests cover them.
