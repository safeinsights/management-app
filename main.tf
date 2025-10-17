terraform {
    required_providers {
        coder = {
            source = "coder/coder"
        }
    }
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "coder_agent" "main" {
    arch = "amd64"
    os   = "linux"
    provisioner = "host"

    startup_script = <<-EOT
    #!/bin/bash
    set -e

    # Install code-server
    curl -fsSL https://code-server.dev/install.sh \
      | sh -s -- --method=standalone --prefix=/tmp/code-server

    mkdir -p /home/coder/workspace

    # Start code-server (detached, logs to /tmp)
    nohup /tmp/code-server/bin/code-server \
      --auth none \
      --bind-addr 127.0.0.1:13337 \
      /home/coder/workspace \
      > /tmp/code-server.log 2>&1 &

    # Example workspace files
    echo '# Hello from Coder on AWS!' > /home/coder/workspace/readme.md

    chown -R coder:coder /home/coder/workspace
    echo "Workspace initialized successfully!"
  EOT

    metadata {
        display_name = "CPU Usage"
        key          = "cpu_usage"
        script       = "coder stat cpu"
        interval     = 10
        timeout      = 1
    }

    metadata {
        display_name = "RAM Usage"
        key          = "ram_usage"
        script       = "coder stat mem"
        interval     = 10
        timeout      = 1
    }

    metadata {
        display_name = "Disk Usage"
        key          = "disk_usage"
        script       = "coder stat disk --path /home/coder"
        interval     = 60
        timeout      = 1
    }
}

resource "coder_app" "code_server" {
    agent_id     = coder_agent.main.id
    slug         = "code-server"
    display_name = "VS Code"
    icon         = "/icon/code.svg"
    subdomain    = true
    share        = "owner"
    url          = "http://127.0.0.1:13337/"
}
