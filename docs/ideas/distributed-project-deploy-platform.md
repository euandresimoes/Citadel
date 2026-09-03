# Distributed Project and Deployment Platform

## Summary

Citadela can evolve from a device management platform into a distributed self-hosting and deployment platform.

The Hub remains the control plane. Connected devices remain execution nodes managed by Connectors. Projects, file transfers, builds, containers, domains, proxies, logs, metrics, and deployment history are coordinated by the Hub but executed on the selected device.

The first foundation should be a secure file transfer protocol between the Hub and Connectors. The same protocol can power the future Files Explorer and the project deployment workflow.

The platform must support a complete YAML editor. YAML should be treated as a first-class project definition with syntax highlighting, schema validation, diagnostics, formatting, preview, and safe execution controls.

## Product vision

A user should be able to:

1. Create a project in the Citadela Hub.
2. Select a source: GitHub, manual upload, Docker image, or a complete Docker Compose YAML definition.
3. Configure install, build, release, start, stop, health-check, and rollback commands.
4. Select the connected device where the project will run.
5. Assign an existing domain or generate a subdomain.
6. Deploy while watching a live terminal streamed from the selected device.
7. Monitor the application, stop it, restart it, rebuild it, redeploy it, or roll it back.
8. Automatically rebuild and redeploy when a Git repository receives a new commit.

The main differentiator is an agent-first architecture for physical devices, desktops, Raspberry Pis, LAN nodes, and Headscale-connected nodes. The Hub coordinates the fleet; it does not execute device-local work or proxy application traffic by default.

## Architectural principles

- The Hub is the control plane and source of truth for projects and deployments.
- The Connector is the execution plane for its own device.
- A device must never execute a command outside its local permission policy.
- Deployment commands must be explicit, auditable, cancellable, and time-limited.
- Public traffic should enter through a proxy running on the device hosting the application.
- The Hub should not become a data-plane bottleneck for application traffic.
- Every long-running operation must have an immutable operation or deployment ID.
- File contents must be transferred by streaming and verified by digest, not trusted solely by filename or size.

## Core domain model

### Project

A project is the desired definition of an application or service.

It contains:

- name and description;
- source provider and source reference;
- YAML or generated container definition;
- environment variables and encrypted secrets;
- build and runtime commands;
- resource limits;
- health-check configuration;
- selected device or scheduling policy;
- domain and proxy configuration;
- deployment policy.

### Deployment

A deployment is an immutable execution attempt for a project.

It records:

- project ID;
- source revision or uploaded artifact digest;
- target device ID;
- requested and actual state;
- timestamps and duration;
- command and build logs;
- generated container configuration;
- image digests;
- health-check results;
- failure reason;
- rollback reference.

Suggested states are `queued`, `transferring`, `building`, `starting`, `health-checking`, `running`, `stopping`, `failed`, `cancelled`, and `rolled-back`.

### Runtime

A runtime represents the currently running container or Compose application on a device. It should remain linked to the deployment that created it, while allowing operational actions such as restart and stop.

## Secure file transfer protocol

### Purpose

The transfer protocol should support:

- browsing directories;
- reading file metadata;
- downloading files;
- uploading files;
- creating directories;
- moving and renaming files;
- deleting files only through explicit confirmation;
- resumable transfers;
- deployment artifact transfer;
- transfer progress and cancellation.

### Recommended flow

1. The Hub requests a transfer session with a purpose, target path, size limit, and expected digest.
2. The Connector validates the request against its local permission policy.
3. The Connector creates a short-lived transfer session and returns a session ID.
4. Data is transferred in ordered chunks with sequence numbers and per-chunk lengths.
5. The receiver acknowledges chunks and may request a resume offset.
6. The final SHA-256 digest is verified before the target is committed.
7. The Connector atomically moves the completed temporary file into place.
8. The session expires and temporary data is removed after completion, cancellation, or timeout.

### Protocol requirements

- Use a dedicated message family instead of embedding file data in unrelated commands.
- Support binary WebSocket frames; use metadata messages for control and progress.
- Never construct shell commands from paths or filenames.
- Normalize and validate paths on the Connector.
- Reject traversal such as `..`, absolute paths outside an allowed root, and symbolic-link escapes.
- Apply maximum file size, total transfer size, chunk size, and concurrent transfer limits.
- Use temporary files with restrictive permissions.
- Verify the final digest before exposing the file to a build or runtime.
- Make transfers resumable and idempotent.
- Keep an audit record for upload, download, move, and delete operations.

### Files Explorer reuse

The Files Explorer should use the same transfer session service as deployments. The UI can expose directory navigation, metadata, upload, download, rename, and delete, while the protocol remains independent from the visual frontend.

The deployment system should not copy files through ad-hoc HTTP endpoints. It should create a transfer session, upload a project artifact or source snapshot, verify it, and then hand the verified workspace to the build executor.

## Complete YAML editor

The YAML editor is a required product feature, not a later text-area enhancement.

It should provide:

- syntax highlighting;
- indentation and formatting;
- autocomplete for Citadela-supported fields;
- Docker Compose schema assistance;
- inline syntax and schema diagnostics;
- unknown-field warnings;
- duplicate-key detection;
- validation before save;
- validation before deployment;
- format-on-save option;
- line and column error locations;
- readable diff against the last deployed definition;
- generated preview of networks, volumes, ports, services, domains, and dependencies;
- secret masking and environment-variable references;
- a raw YAML mode and a guided configuration mode that never silently overwrites user YAML.

The editor must distinguish YAML parsing errors, unsupported Compose features, security warnings, and deployment-time errors. A project may be saved as a draft with errors, but deployment must require a valid definition unless the user explicitly chooses a compatible non-YAML source type.

## Deployment execution

The Hub creates a deployment plan and sends it to the target Connector. The Connector performs local steps such as:

- preparing an isolated workspace;
- receiving and verifying source files;
- cloning a repository or extracting an artifact;
- running the configured build;
- building or pulling images;
- creating Docker networks and volumes;
- starting containers;
- applying labels and proxy configuration;
- running health checks;
- reporting the final runtime state.

The Hub receives structured deployment events and terminal output. Raw logs should be stored separately from summarized deployment state so the UI can render both a live terminal and a compact history.

## Domains and public exposure

The initial proxy provider should be Traefik because it has dynamic Docker integration and is the default proxy in Coolify. Caddy can be added as a later provider. The Coolify model confirms that the proxy should run on the resource server, receive HTTP/HTTPS traffic, match the hostname, and forward traffic to the correct container port. [Coolify proxy overview](https://next.coolify.io/docs/core/networking/proxy/overview)

Domain automation should initially require the user to configure DNS manually. A domain or wildcard record must point to the public IP of the device hosting the resource. [Coolify DNS configuration](https://coolify.io/docs/knowledge-base/dns-configuration)

Later, DNS provider integrations can automate records for Namecheap, Hostinger, GoDaddy, HostGator, Cloudflare, and other providers. DNS automation should remain separate from proxy configuration so users can use external DNS, a CDN, or manually managed records.

HTTPS should use a dedicated certificate manager and support HTTP-01 initially, followed by DNS-01 and wildcard certificates. Ports 80 and 443 must reach the proxy on the hosting device for public HTTP/TLS issuance.

## Scheduling across devices

The first version should allow explicit device selection. Automatic scheduling can follow later using constraints such as:

- operating system and architecture;
- available CPU and memory;
- Docker availability;
- network provider;
- public ingress availability;
- labels such as `gpu`, `raspberry-pi`, or `production`;
- device health and current workload.

Scheduling must not move an application automatically unless the project has a declared migration policy. A device move requires a new deployment, explicit data handling, and a clear DNS/proxy transition strategy.

## Security model

This feature can execute user-defined build and runtime commands, so it must reuse and extend the Connector permission system.

Required controls include:

- project-scoped execution permissions;
- local Connector permission limits;
- explicit approval for privileged Docker operations;
- blocked or warned Docker socket mounts;
- restricted host networking and privileged containers;
- CPU, memory, process, disk, and timeout limits;
- secret encryption at rest and redaction from logs;
- path isolation for transferred workspaces;
- cancellation and cleanup on failure;
- immutable deployment audit records;
- confirmation for destructive operations;
- no shell interpolation for system-managed commands;
- signed or digest-pinned images where required.

The Hub may request an action, but the Connector remains the final authority for local execution.

## Delivery phases

### Phase 1: Transfer foundation

- Add transfer message schemas to the protocol.
- Implement resumable chunk upload/download.
- Add path validation, digest verification, limits, cancellation, and audit events.
- Build Connector and Hub transfer services.
- Add protocol, integration, and end-to-end tests.

### Phase 2: Files Explorer

- Add directory listing and metadata APIs.
- Add upload, download, rename, move, and confirmed delete.
- Reuse transfer sessions and progress events.
- Add frontend terminal/progress feedback for long transfers.

### Phase 3: Project foundation

- Add Project, ProjectSource, ProjectEnvironment, and Deployment persistence.
- Add project creation and draft editing.
- Add device selection and deployment history.

### Phase 4: YAML editor

- Integrate a real editor component.
- Add YAML parsing, formatting, schema validation, diagnostics, and preview.
- Add Docker Compose validation and security warnings.
- Add draft save and deployed-definition diff.

### Phase 5: First deployment provider

- Support Docker image projects first.
- Add Docker Compose projects using the YAML editor.
- Stream deployment terminal output.
- Implement build, start, stop, restart, redeploy, cancel, health checks, and rollback metadata.

### Phase 6: Domains and proxy

- Install and manage Traefik on each eligible device.
- Generate routes from project domains and container ports.
- Add manual DNS validation.
- Add automatic HTTPS and certificate renewal.

### Phase 7: Git and scheduling

- Add GitHub source provider.
- Add webhook-triggered deployments.
- Add revision tracking and automatic redeploy.
- Add explicit device groups and later constraint-based scheduling.

## Initial success criteria

The first complete vertical slice is successful when a user can:

1. Create a project with a Docker Compose YAML definition.
2. Validate and save the YAML in the editor.
3. Select one connected Linux device.
4. Transfer the project through the file transfer protocol.
5. Build and start the Compose application on that device.
6. Watch structured logs in a live terminal.
7. See health and runtime metrics in the project dashboard.
8. Stop, restart, and redeploy the application.
9. Assign a manually configured domain through Traefik.
10. Access the application through HTTPS without the Hub proxying application traffic.

This vertical slice establishes the architecture needed for GitHub deployments, manual uploads, multiple devices, automatic domains, and future proxy providers without coupling those features to the frontend.
