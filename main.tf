terraform {
    required_providers {
        coder = {
            source = "coder/coder"
        }
        docker = {
            source = "kreuzwerker/docker"
        }
    }
}

# Configure Docker provider
provider "docker" {
    host = "unix:///var/run/docker.sock"
}

variable "docker_image" {
    description = "Docker image to use for the workspace"
    default     = "codercom/enterprise-base:ubuntu"
}

variable "docker_network" {
    description = "Docker network name"
    default     = "bridge"
    type        = string
}

data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "coder_agent" "main" {
    arch = "amd64"
    os   = "linux"

    startup_script = <<-EOT
    #!/bin/bash
    set -e

    # Install code-server (binary only, don't start it here)
    curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --prefix=/tmp/code-server

    # Create workspace directory
    mkdir -p /home/coder/workspace
    cd /home/coder/workspace

    # Create main.r file
    cat > main.r << 'EOF'
# Main R Script
print("Hello from Coder!")

data <- data.frame(
  id = 1:5,
  value = c(10, 20, 30, 40, 50)
)

print(data)
total <- sum(data$value)
print(paste("Total:", total))
EOF

    # Create readme.md file
    cat > readme.md << 'EOF'
# My Coder Workspace

Welcome to your Coder workspace!

## Files
- `main.r` - Main R script with example code
- `readme.md` - This file

## Getting Started
1. Open `main.r` to see the example R code
2. Install R if needed: `sudo apt-get update && sudo apt-get install -y r-base`
3. Run the R script: `Rscript main.r`

## Resources
- [Coder Documentation](https://coder.com/docs)
- [R Documentation](https://www.r-project.org/)
EOF

    # Set proper permissions
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

# Run code-server as a managed app
resource "coder_app" "code-server" {
    agent_id     = coder_agent.main.id
    slug         = "code-server"
    display_name = "VS Code"
    icon         = "/icon/code.svg"
    subdomain    = true
    share        = "owner"

    # Coder supervises this command
    command = "/tmp/code-server/bin/code-server --bind-addr 0.0.0.0:13337 --auth none /home/coder/workspace"
}


resource "docker_container" "workspace" {
    count = data.coder_workspace.me.start_count
    image = var.docker_image
    name  = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}"

    command = ["sh", "-c", coder_agent.main.init_script]

    env = [
        "CODER_AGENT_TOKEN=${coder_agent.main.token}",
    ]

    host {
        host = "host.docker.internal"
        ip   = "host-gateway"
    }

    networks_advanced {
        name = var.docker_network
    }
}
