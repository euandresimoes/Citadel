# 🏰 Citadel

> **A self-hosted control plane for your devices.**

Citadel is an open-source platform for connecting, monitoring, and controlling multiple devices from a single self-hosted Hub.

Install the **Citadel Hub** on your main machine, connect other devices using the **Citadel Connector**, and manage everything from a local web interface.

```text
                    Citadel Hub
                  http://localhost:75523
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
           Desktop      Raspberry      Server
           Windows        Linux         Linux
              │            │            │
              └──── Citadel Connector ──┘
```

Citadel is designed around the idea that every connected device exposes a set of **capabilities** and explicitly grants a set of **permissions** to the Hub.

The long-term goal is to provide a secure and extensible control layer over personal computers, servers, Raspberry Pis, containers, and eventually remote networks and AI agents.

---

## ✨ Why Citadel?

Managing multiple devices usually means switching between SSH sessions, remote desktop tools, dashboards, scripts, routers, and different management interfaces.

Citadel aims to provide a single place for all of them.

From the Hub, you will be able to:

- Discover devices on your local network.
- Pair trusted devices with the Hub.
- Monitor CPU, memory, disk usage, uptime, and system information.
- Open remote terminal sessions.
- Restart, shut down, or suspend supported devices.
- Wake supported machines using **Wake-on-LAN**.
- Manage device permissions individually.
- Rename, pin, reconnect, disconnect, and remove devices.
- Extend devices with additional capabilities in the future.

> Citadel is not a deployment platform.
>
> The primary resource in Citadel is the **device itself**, not the application running on it.

---

## 🚧 Project Status

Citadel is currently in early development.

The first milestone focuses exclusively on devices connected through the same **local network**.

### MVP scope

- [ ] Citadel Hub
- [ ] Local web dashboard
- [ ] LAN discovery
- [ ] Device pairing
- [ ] Windows Connector
- [ ] Linux Connector
- [ ] Device metadata
- [ ] Capabilities
- [ ] Permissions
- [ ] Online / offline status
- [ ] Heartbeats
- [ ] CPU monitoring
- [ ] Memory monitoring
- [ ] Disk monitoring
- [ ] Uptime
- [ ] Restart
- [ ] Shutdown
- [ ] Sleep
- [ ] Wake-on-LAN
- [ ] Remote terminal

### Future

- [ ] File browser
- [ ] Process management
- [ ] Service management
- [ ] Docker integration
- [ ] Container networking
- [ ] Remote Mesh
- [ ] Headscale integration
- [ ] Multiple networks
- [ ] Scripts and automations
- [ ] Bulk device actions
- [ ] Android support
- [ ] AI agent harness
- [ ] Multi-device LLM orchestration

---

# Architecture

Citadel uses a **microservices architecture** organized inside a `pnpm` monorepo.

The system is divided into three main areas:

1. **Hub services**
2. **Web application**
3. **Device Connector**

```text
                                Citadel

                           localhost:75523
                                 │
                               NGINX
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
               Web UI        API Gateway     Realtime
               React          GraphQL         Gateway
                                 │               │
                    ┌────────────┼────────────┐  │
                    │            │            │  │
                    ▼            ▼            ▼  │
                 Device       Control      Internal
                 Service      Service       APIs
                                                  │
                                                  │ WebSocket
                                                  │
                                 ┌────────────────┼────────────────┐
                                 ▼                ▼                ▼
                             Connector        Connector        Connector
                              Windows           Linux          Raspberry
```

---

## Hub

The **Hub** is the central Citadel instance.

It is responsible for:

- Hosting the web interface.
- Managing registered devices.
- Handling pairing.
- Keeping track of device sessions.
- Sending commands to connected devices.
- Receiving metrics and events.
- Managing permissions.
- Sending Wake-on-LAN packets.
- Providing APIs consumed by the frontend.

By default, the dashboard is intended to run locally at:

```text
http://localhost:75523
```

The Hub Application Service coordinates command authorization and dispatch. A
power command is never sent directly when requested: it first enters
`awaiting_confirmation`, then the authenticated actor must explicitly confirm
it. After dispatch, the result received from the matching device moves the
command to `succeeded` or `failed`; unconfirmed commands become `expired` when
their confirmation TTL is reached and their state is evaluated.

Pairing state and registered device identities are persisted by the Device
Service in PostgreSQL. The Realtime Service consumes the Device Service pairing
authorization contract and does not access the database directly.

---

## Connector

The **Citadel Connector** is a lightweight application installed on devices that should be managed by Citadel.

The Connector initiates the connection to the Hub.

```text
Connector
    │
    │ WebSocket
    ▼
Citadel Hub
```

The Hub does **not** need to directly understand how Windows, Linux, or another operating system performs an action.

Instead, it sends commands using the **Citadel Protocol**:

```text
Hub
 │
 │ device.system.power.restart
 ▼
Connector
 │
 ▼
Platform Adapter
 │
 ├── Windows → Windows APIs / PowerShell
 └── Linux   → Linux APIs / shell
```

This keeps platform-specific behavior outside of the Hub.

The command names are defined by `@citadel/protocol`. Power commands sent to a
Connector are currently:

- `device.system.power.restart`
- `device.system.power.shutdown`
- `device.system.power.sleep`

Wake-on-LAN is intentionally not a Connector command because the target device
may be offline. The Control Service sends that operation directly through the
local network.

---

# Capabilities & Permissions

Citadel treats **capabilities** and **permissions** as two different concepts.

### Capability

A capability describes something that the device is technically able to do.

For example:

```json
{
  "capabilities": [
    "capability.system.metrics",
    "capability.system.terminal",
    "capability.system.power.restart",
    "capability.system.power.shutdown",
    "capability.system.power.wake"
  ]
}
```

### Permission

A permission describes something that the user explicitly allows the Hub to do.

For example:

```json
{
  "permissions": [
    "permission.system.metrics.read",
    "permission.system.power.restart"
  ]
}
```

In this case:

| Feature | Supported | Allowed |
|---|:---:|:---:|
| Metrics | ✅ | ✅ |
| Terminal | ✅ | ❌ |
| Restart | ✅ | ✅ |
| Shutdown | ✅ | ❌ |
| Wake-on-LAN | ✅ | ❌ |

A device being capable of performing an action does **not** automatically mean the Hub is authorized to perform it.

> Permissions must be validated by both the Hub and the Connector.

This becomes especially important for future automation and AI agent integrations.

---

# Services

## API Gateway

`@citadel/api-gateway`

The API Gateway is the main backend interface used by the Citadel web application.

The frontend communicates primarily through **GraphQL**.

```text
React
  │
  │ GraphQL
  ▼
API Gateway
```

Example:

```graphql
query {
  devices {
    id
    name
    status
    capabilities
    permissions

    metrics {
      cpu
      memory
    }
  }
}
```

Internal service communication can use REST where appropriate.

---

## Device Service

`@citadel/device-service`

Responsible for persistent device information.

Responsibilities include:

- Device registration
- Pairing
- Device metadata
- Capabilities
- Permissions
- Aliases
- Pinned devices
- Network interfaces
- MAC addresses
- Last seen information

Pairing records are stored in PostgreSQL and retain their lifecycle state:
`pending`, `paired`, `rejected`, or `revoked`.

Example internal endpoints:

```http
GET    /devices
GET    /devices/:id
PATCH  /devices/:id
DELETE /devices/:id
```

---

## Control Service

`@citadel/control-service`

Responsible for device actions.

Examples:

```http
POST /devices/:id/restart
POST /devices/:id/shutdown
POST /devices/:id/sleep
POST /devices/:id/wake
```

A normal command flow looks like:

```text
Web UI
   │
   ▼
API Gateway
   │
   ▼
Control Service
   │
   ├── Validate capability
   ├── Validate permission
   │
   ▼
Realtime Service
   │
   ▼
Connector
   │
   ▼
Operating System
```

Wake-on-LAN is handled differently because an offline machine does not have an active Connector.

```text
Control Service
      │
      │ Magic Packet
      ▼
Local Network
      │
      ▼
Offline Device
```

---

## Realtime Service

`@citadel/realtime-service`

Responsible for live communication between the Hub and connected devices.

It manages:

- WebSocket connections
- Device sessions
- Heartbeats
- Online / offline state
- Live metrics
- Command delivery
- Command responses
- Terminal streams

Conceptually:

```ts
Map<DeviceId, DeviceSession>
```

A session may contain:

```ts
interface DeviceSession {
  deviceId: string;
  connectedAt: Date;
  lastHeartbeat: Date;
}
```

Persistent device data belongs to the Device Service.

Active connections belong to the Realtime Service.

---

# Citadel Protocol

`@citadel/protocol`

The Citadel Protocol is a shared package containing the contracts used between the Hub and Connectors.

Neither the Hub nor the Connector should import implementation code from each other.

They only need to understand the same protocol.

Example command:

```json
{
  "id": "cmd_a84f1",
  "type": "device.system.power.restart",
  "deviceId": "device_workstation"
}
```

Example response:

```json
{
  "type": "command.result",
  "commandId": "cmd_a84f1",
  "success": true
}
```

Every request uses an identifier so the Hub can correlate commands with responses.

## Connector handshake

The Connector initiates the WebSocket connection and sends `device.hello` with
its protocol version and metadata collected from the host operating system.
The Realtime Service owns the connection and session lifecycle, validates the
message, and responds with `hub.hello` containing the negotiated session ID.

```text
Connector                         Realtime Service
    │                                      │
    │──── device.hello ──────────────────▶│
    │                                      │ validate + create session
    │◀──── hub.hello ─────────────────────│
    │                                      │
    │──── device.heartbeat ──────────────▶│
```

Pairing is mandatory before a device can create a session. An unknown
Connector receives `pairing.pending` and is disconnected. After manual approval
in the Device Service, the Connector reconnects and proves possession of its
Ed25519 private key through a `hub.challenge` / `device.auth` exchange.

The initial handshake is intentionally transport/session-oriented. Device
persistence, pairing authorization, and command policy remain responsibilities
of their respective Hub services and are not implemented by the Connector.

Each device has one active network mode at a time: `lan` or `headscale`. During
a user-requested network change, the Connector establishes and validates the
new connection before closing the old one. The Realtime Service replaces the
active session only after the new handshake succeeds.

The Connector reconnects automatically after an established connection drops,
using exponential backoff. The Realtime Service can be configured with TLS
certificates so both LAN and Headscale connections use `wss://` in production.

After authentication, the Hub can request `device.system.info.request`. The
Connector executes the read-only system inspection locally and returns a
`command.result` correlated by `commandId`.

```text
Command
cmd_a84f1
    │
    ▼
Connector
    │
    ▼
Result
cmd_a84f1
```

Network payloads are validated at runtime instead of relying exclusively on TypeScript types.

---

# Networking

## Local Network

The first Citadel networking provider is the local network.

```text
                  LAN

            Citadel Hub
           192.168.1.10
                 │
       ┌─────────┼─────────┐
       │         │         │
       ▼         ▼         ▼
      PC      Raspberry   Server
```

Citadel may use technologies such as **mDNS** for Hub discovery.

After pairing, Connectors establish persistent connections with the Hub.

---

## Remote Mesh

Remote Mesh is planned for a later version.

The goal is to allow Citadel devices to communicate even when they are located on completely different networks.

```text
Home PC ───────┐
               │
Laptop ────────┼── Private Mesh ── Citadel Hub
               │
Cloud VPS ─────┤
               │
Office PC ─────┘
```

The planned architecture allows networking implementations to remain separate from Citadel's device-control protocol.

Potential providers include:

- LAN
- Headscale
- Tailscale
- Other WireGuard-based mesh networks

This means the rest of Citadel does not need to care whether a device is physically nearby or on another network.

---

# Future AI Integration

AI is **not required** for Citadel to be useful.

However, Citadel is being designed so its device capabilities can eventually become tools available to an LLM.

Today:

```text
User
 │
 ▼
Web UI
 │
 ▼
Citadel
 │
 ▼
Device
```

Future:

```text
User
 │
 ▼
LLM Agent
 │
 ▼
Citadel Tool Harness
 │
 ▼
Citadel Control Plane
 │
 ├────────────┬────────────┐
 ▼            ▼            ▼
Desktop    Raspberry      Server
```

Possible tools could include:

```text
list_devices()
get_device_info()
get_metrics()
wake_device()
restart_device()
shutdown_device()
execute_command()
```

This could enable workflows such as:

> Wake my workstation, check whether Docker is running, and start the development environment.

Or:

> Check all my Linux machines and tell me which one currently has the most available resources.

Citadel permissions would remain the final authority over what an AI agent is allowed to execute.

---

# Project Structure

```text
Citadel/
│
├── apps/
│   └── @citadel/
│       ├── web/
│       └── connector/
│
├── services/
│   └── @citadel/
│       ├── api-gateway/
│       ├── device-service/
│       ├── control-service/
│       └── realtime-service/
│
├── packages/
│   └── @citadel/
│       ├── network/
│       └── protocol/
│           ├── src/
│           │   ├── capabilities/
│           │   ├── commands/
│           │   ├── common/
│           │   ├── devices/
│           │   ├── messages/
│           │   └── permissions/
│           └── test/
│
├── infrastructure/
│   ├── nginx/
│   └── docker/
│
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
├── .gitignore
└── README.md
```

### Applications

| Package | Description |
|---|---|
| `@citadel/web` | Citadel web dashboard |
| `@citadel/connector` | Client installed on managed devices |

### Services

| Service | Responsibility |
|---|---|
| `@citadel/api-gateway` | GraphQL API used by the web application |
| `@citadel/device-service` | Devices, pairing, metadata and permissions |
| `@citadel/control-service` | Commands, power management and Wake-on-LAN |
| `@citadel/realtime-service` | WebSockets, sessions, metrics and terminal streams |

### Packages

| Package | Responsibility |
|---|---|
| `@citadel/network` | Network modes and provider contracts for LAN and Headscale |
| `@citadel/protocol` | Shared communication contracts and validation |

---

# Technology Stack

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Package Manager | pnpm |
| Monorepo | pnpm Workspaces |
| Web | React + Vite |
| API Gateway | Fastify |
| Client API | GraphQL |
| GraphQL Server | Mercurius |
| Internal APIs | REST |
| Realtime Communication | WebSocket (`ws`) |
| Validation | Zod |
| Database | PostgreSQL |
| Reverse Proxy | NGINX |
| Infrastructure | Docker / Docker Compose |
| Logging | Pino |
| Testing | Vitest |
| Terminal UI | xterm.js |
| Terminal Backend | node-pty |
| System Information | systeminformation |
| LAN Discovery | mDNS |

---

# Requirements

For local development:

- **Node.js**
- **pnpm**
- **Docker**
- **Docker Compose**

Recommended:

```text
Node.js >= 22
pnpm >= 10
```

---

# Installation

> Citadel is currently under development. Installation steps may change before the first release.

Clone the repository:

```bash
git clone https://github.com/<your-username>/citadel.git
cd citadel
```

Install all workspace dependencies:

```bash
pnpm install
```

---

# Development

Run all workspace applications and services:

```bash
pnpm dev
```

Or run an individual package:

```bash
pnpm --filter @citadel/api-gateway dev
```

For example:

```bash
pnpm --filter @citadel/web dev
pnpm --filter @citadel/realtime-service dev
pnpm --filter @citadel/connector dev
```

---

# Infrastructure

Start Citadel infrastructure using Docker Compose:

```bash
docker compose up -d
```

This will eventually start infrastructure such as:

```text
NGINX
PostgreSQL
Citadel services
```

To stop it:

```bash
docker compose down
```

View containers:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f
```

---

# pnpm Workspace

Citadel uses `pnpm` workspaces.

```yaml
packages:
  - "apps/@citadel/*"
  - "services/@citadel/*"
  - "packages/@citadel/*"
```

This allows all Citadel applications, services, and packages to live inside the same repository while maintaining separate dependencies and package boundaries.

Internal dependencies can use the workspace protocol:

```json
{
  "dependencies": {
    "@citadel/protocol": "workspace:*"
  }
}
```

For example, both the Connector and Realtime Service can use the same protocol package without publishing it to npm.

---

# Security

Citadel provides remote control capabilities over connected devices, which makes security a core architectural requirement rather than an optional feature.

The project is being designed around principles such as:

- Explicit device pairing
- Ed25519 device identities
- Mandatory manual pairing approval
- Challenge-response authentication
- Unique device identities
- Runtime message validation
- Capability-based access
- Explicit user permissions
- Connector-side permission enforcement
- Secure device communication
- Command auditing
- Minimal network exposure
- No unauthenticated remote command execution

> A Hub should never gain a capability simply because the connected device technically supports it.

Future versions may introduce additional security features such as:

- Public/private device keys
- Signed commands
- Short-lived credentials
- Permission scopes
- Approval requirements for destructive actions
- Audit history
- AI-specific permission policies

---

# Design Principles

### Self-hosted first

Citadel should work without requiring a mandatory third-party cloud service.

### Device-centric

Devices are first-class resources.

Docker, files, processes, services, and future integrations are capabilities of those devices.

### Explicit permissions

Capabilities describe what a device **can** do.

Permissions describe what Citadel **may** do.

### Modular

Networking, device management, control, realtime communication, and future AI features should remain independently evolvable.

### Useful without AI

AI orchestration should enhance Citadel rather than define it.

### Progressive complexity

The first version should solve local device management well before attempting Remote Mesh, container orchestration, or autonomous agents.

---

# Roadmap

## `v0.1` — Local Citadel

Focus on controlling devices inside the same LAN.

```text
Pair → Connect → Monitor → Control
```

## `v0.2` — Device Management

Add deeper operating-system integrations.

```text
Files
Processes
Services
Logs
```

## `v0.3` — Containers

Treat Docker as a first-class device capability.

```text
Containers
Images
Volumes
Logs
Terminal
Network exposure
```

## `v0.4` — Remote Mesh

Connect devices across different physical networks.

```text
LAN
 +
Private Mesh
```

## `v1.x` — Intelligence

Introduce the Citadel AI harness.

```text
LLM
 ↓
Citadel Tools
 ↓
Authorized Devices
```

---

# Contributing

Citadel is currently in early development.

Contribution guidelines will be added as the architecture stabilizes.

For now, discussions, architectural feedback, bug reports, and ideas are welcome.

---

# License

License information will be added before the first public release.

---

<p align="center">
  <strong>Citadel</strong><br />
  One control plane for your devices.
</p>
