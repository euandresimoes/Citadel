# Domain Registry and Proxy Provider Platform

## Summary

Citadela should treat domains and public endpoints as first-class resources independent from projects, containers, and deployments.

Users purchase domains through the registrar of their choice, configure DNS records manually, and then add the domain to the Citadela Hub. The Hub verifies ownership and reachability, stores the domain in a central registry, and makes it available to any supported Citadela feature.

Public routes are managed through a separate Proxy Provider Platform. The initial providers should be Traefik and Caddy, with the ability to switch providers from the Hub frontend. The Hub manages desired routing state, while the Connector installs, configures, validates, and operates the selected proxy on the device that receives traffic.

## Product principles

- Citadela does not need to sell or purchase domains.
- The user owns the registrar and DNS account.
- Domains are added manually to the Hub.
- Domain ownership must be verified before use.
- A domain can exist without being assigned to an application.
- Domains are not coupled to containers or projects.
- A route is a separate binding between a domain and a target.
- The proxy runs on the device receiving public traffic.
- The Hub is the control plane, not the default application data plane.
- Provider-specific configuration must remain inside provider implementations.
- Switching proxy providers must be explicit, reviewable, and reversible.

## User workflow

### Add a domain

1. The user purchases a domain from a registrar such as Namecheap, Hostinger, GoDaddy, or HostGator.
2. The user manually creates the required DNS records at the DNS provider.
3. The user opens Domains in the Citadela Hub.
4. The user adds the domain or wildcard domain.
5. Citadela checks DNS resolution and ownership.
6. After verification, the domain becomes available for assignments.

The user should not need to connect a registrar account for the initial implementation. DNS provider integrations can be added later as optional automation.

### Assign a domain

After verification, the domain can be assigned to a generic target:

- Citadela Hub;
- Files Explorer;
- a Docker container;
- a Docker Compose service;
- a deployed project;
- a webhook endpoint;
- a terminal or observability service;
- an external service;
- a future plugin or application provider.

Example:

```text
example.com
├── hub.example.com   → Citadela Hub
├── files.example.com → Files Explorer
├── app.example.com   → Docker application
└── api.example.com   → External service
```

## Domain model

### Domain

A domain is a name controlled by the user and known to Citadela.

Suggested fields:

- domain ID;
- fully qualified domain name;
- normalized hostname;
- domain type: root, subdomain, or wildcard;
- verification state;
- ownership verification method;
- DNS provider metadata, if configured;
- preferred device or device group;
- created and updated timestamps;
- last validation result.

Suggested lifecycle states:

```text
pending_verification
verified
degraded
expired
disabled
```

### DNS record

DNS records represent the instructions the user must configure externally or records managed through a future DNS provider integration.

Supported initial records:

- `A`;
- `AAAA`;
- `CNAME`;
- `TXT` for ownership verification.

The Hub should display the expected record, observed value, and verification result. It should not silently modify DNS.

### Certificate

A certificate is associated with a hostname or wildcard domain and a device/proxy provider.

Suggested fields:

- certificate ID;
- hostname set;
- issuer;
- certificate status;
- expiration timestamp;
- renewal state;
- challenge type;
- target device;
- provider metadata.

Private keys must never be returned to the frontend after creation and must be stored only where the certificate provider requires them.

### Route binding

A route binding connects a hostname to a target.

```text
Domain: api.example.com
Target type: container
Target ID: api-service
Device: raspberry-pi
Port: 3000
Protocol: HTTP
TLS: enabled
```

A route should be able to target:

- `hub`;
- `files-explorer`;
- `container`;
- `compose-service`;
- `external-service`;
- `plugin`.

The route model must not contain Traefik labels or Caddyfile syntax.

## Domain Registry responsibilities

The Domain Registry is the central service for domain lifecycle and allocation.

It should manage:

- adding and removing domains;
- ownership verification;
- DNS observations;
- wildcard domains;
- subdomain reservations;
- hostname normalization;
- collision detection;
- route bindings;
- domain-to-device association;
- certificate references;
- redirects;
- domain history;
- audit events.

The registry should allow unassigned and reserved domains:

```text
example.com
Status: verified
Assignment: none
```

This permits a domain to be added once and reused by future Citadela features.

## Proxy Provider Platform

The Proxy Provider Platform should expose a provider-neutral contract.

### Provider interface

Each provider should support capabilities such as:

- install;
- uninstall;
- start;
- stop;
- restart;
- status;
- logs;
- route reconciliation;
- certificate configuration;
- middleware configuration;
- health checks;
- configuration validation;
- rollback;
- reload without full restart, when supported.

The provider should also expose a capability document:

```text
provider: traefik
version: 3.x
supports:
  http: true
  https: true
  wildcardCertificates: true
  dockerDiscovery: true
  pathRouting: true
  middleware: true
  hotReload: true
```

### Initial providers

#### Traefik

Traefik should be the default provider because it integrates well with Docker discovery, dynamic routing, middleware, and automatic certificate management.

#### Caddy

Caddy should be supported as an alternative provider. It is attractive for simple configurations and automatic HTTPS, but its provider implementation must remain separate from Traefik's implementation.

The frontend should expose the provider choice per device or server, not globally for the whole Hub. Different devices may run different proxy providers simultaneously.

## Proxy configuration protocol

The Proxy Protocol should be a dedicated protocol family in `@citadela/protocol`.

Suggested message families:

```text
proxy.providers.list.request
proxy.providers.list.response
proxy.provider.install
proxy.provider.configure
proxy.provider.start
proxy.provider.stop
proxy.provider.restart
proxy.provider.status
proxy.provider.logs
proxy.route.create
proxy.route.update
proxy.route.delete
proxy.route.validate
proxy.route.reconcile
proxy.route.rollback
proxy.certificate.request
proxy.certificate.status
proxy.event
```

The messages should transport provider-neutral schemas. The Connector provider adapter translates them into Docker labels, dynamic configuration, Caddyfiles, APIs, or other provider-specific mechanisms.

The Hub should never send arbitrary Traefik labels or Caddy configuration as the normal route-management API.

## Desired state and reconciliation

Proxy configuration should use a desired-state model.

```text
Hub desired state
        ↓
Connector provider adapter
        ↓
Provider configuration
        ↓
Validation
        ↓
Apply
        ↓
Health check
        ↓
Reported actual state
```

Each device should maintain:

- desired proxy provider;
- desired routes;
- desired certificates;
- actual provider state;
- actual route state;
- last successful reconciliation;
- last failure;
- rollback snapshot.

Reconciliation must be idempotent. Repeating the same request should produce the same final state without duplicating routes or certificates.

## Switching providers

The frontend should allow a user to switch a device from Traefik to Caddy.

The safe workflow is:

1. Show the current provider and routes.
2. Check whether the target provider is installed or available.
3. Translate all supported route bindings into the target provider model.
4. Display unsupported features and required changes.
5. Generate a preview diff.
6. Require explicit confirmation.
7. Save the current provider configuration as a rollback snapshot.
8. Stop the current provider during the maintenance window.
9. Install and configure the target provider.
10. Validate the generated configuration.
11. Start the target provider.
12. Run route and certificate health checks.
13. Mark the new provider active only after validation succeeds.
14. Restore the previous provider if any critical step fails.

Switching providers may temporarily interrupt public routes. The UI must communicate this before the user confirms.

## Routing capabilities

The provider-neutral route model should support:

- hostname routing;
- wildcard hostname routing;
- path-based routing;
- HTTP to HTTPS redirects;
- target port mapping;
- target protocol;
- WebSocket forwarding;
- gRPC forwarding where supported;
- headers;
- compression;
- rate limits;
- IP allowlists;
- basic authentication;
- forward authentication;
- custom certificates;
- automatic certificate issuance;
- certificate renewal;
- health checks;
- weighted targets where supported.

Capabilities must be validated before a route is saved or deployed. Unsupported provider features should produce a clear warning rather than silently degrading behavior.

## TLS and certificates

The initial certificate workflow should use the selected proxy provider and Let's Encrypt.

Supported modes should eventually include:

- HTTP-01 challenge;
- DNS-01 challenge;
- wildcard certificates;
- user-provided certificates;
- automatic renewal;
- certificate health status.

The Hub should coordinate certificate intent and status, while the Connector applies the provider-specific certificate configuration on the target device.

Certificate failures should be visible in the project, domain, device, and proxy views.

## DNS verification

The initial implementation should require manual DNS configuration.

For an A record:

```text
api.example.com → public IP of the hosting device
```

For a wildcard domain:

```text
*.example.com → public IP of the hosting device
```

The Hub should validate:

- hostname syntax;
- DNS resolution;
- expected record type;
- observed IP or CNAME;
- wildcard resolution where applicable;
- public reachability when possible;
- port 80 and 443 reachability for certificate issuance.

DNS automation through provider APIs can be added later. It should be an optional integration and must not be required for the Domain Registry.

## Device placement

A domain may be associated with a device because public traffic must reach the device hosting the proxy and target.

The Hub should show:

- device receiving traffic;
- public address;
- network provider;
- proxy provider;
- ports 80 and 443 status;
- routes served by the device;
- certificate status.

If a route is moved to another device, the migration process must account for:

- DNS propagation;
- certificate availability;
- container or service readiness;
- proxy configuration;
- health checks;
- rollback to the original device.

The first release should require explicit device selection. Automatic placement and load balancing can be added after the basic route lifecycle is reliable.

## Feature reuse

The Domain Registry and Proxy Protocol should be reusable by:

- Project Deploy Platform;
- Files Explorer;
- Citadela Hub itself;
- webhooks;
- APIs;
- terminal access;
- monitoring dashboards;
- Grafana or other observability tools;
- external services;
- preview environments;
- future plugins.

Examples:

```text
hub.example.com      → Hub frontend
files.example.com    → Files Explorer
terminal.example.com → authenticated terminal service
app.example.com      → project container
preview-42.example.com → preview deployment
```

## Frontend experience

### Domains view

The Domains view should provide:

- domain list;
- verification status;
- DNS instructions;
- wildcard support;
- assigned target;
- assigned device;
- certificate status;
- route count;
- last validation;
- add, verify, edit, reserve, and remove actions.

### Proxy view per device

Each device should have a Proxy section with:

- active provider;
- provider selector;
- provider capabilities;
- install/update controls;
- start/stop/restart controls;
- current routes;
- generated configuration preview;
- desired versus actual state;
- certificate list;
- logs;
- reconciliation status;
- rollback action.

Provider switching must use the common confirmation dialog and show the expected interruption.

### Route editor

The route editor should allow users to choose:

- domain or subdomain;
- device;
- target type;
- target service;
- port;
- protocol;
- TLS mode;
- redirect policy;
- middleware;
- health check;
- exposure policy.

Advanced provider-specific settings may be exposed later, but they should be clearly labeled as provider-specific and should not replace the common route model.

## Security model

Public exposure introduces significant risk. Required controls include:

- authenticated Hub sessions;
- Connector identity verification;
- local Connector permission checks;
- domain ownership verification;
- route ownership and collision checks;
- explicit confirmation for public exposure;
- explicit confirmation for provider switching;
- no arbitrary provider configuration by default;
- protected proxy dashboard;
- certificate private-key protection;
- secret redaction from logs;
- rate limiting and access-control middleware;
- audit events for domain and route changes;
- rollback snapshots;
- prevention of routes to unauthorized local ports;
- prevention of access to internal metadata endpoints.

The system must not assume that a verified domain authorizes access to every service on a device. Each route must have an explicit target and exposure policy.

## Failure handling

The platform must handle:

- DNS not propagated;
- incorrect DNS target;
- private or unreachable device;
- port 80 or 443 unavailable;
- provider installation failure;
- invalid generated configuration;
- certificate issuance failure;
- conflicting hostname;
- target container unavailable;
- provider crash;
- device disconnect during reconciliation;
- failed provider switch;
- expired certificate;
- stale desired state.

Every failure should provide:

- stable error code;
- human-readable message;
- affected domain, route, device, or provider;
- recovery suggestion;
- whether rollback was attempted;
- links to relevant logs.

## Implementation phases

### Phase 1: Domain Registry

- Add domain and verification persistence.
- Add normalized hostname validation.
- Add manual DNS instructions.
- Add DNS observation and verification checks.
- Add unassigned and reserved domains.

### Phase 2: Proxy provider contract

- Define provider-neutral route and certificate schemas.
- Define provider capability discovery.
- Define proxy operation states and errors.
- Add protocol validation tests.

### Phase 3: Traefik provider

- Install and manage Traefik per device.
- Reconcile container routes.
- Add HTTP and HTTPS support.
- Add certificate lifecycle.
- Add logs, status, validation, and rollback.

### Phase 4: Domain-to-target bindings

- Associate domains with Hub, Files Explorer, and containers.
- Add route conflict detection.
- Add health checks.
- Add explicit device placement.

### Phase 5: Caddy provider

- Implement the same provider contract for Caddy.
- Translate common routes and certificates.
- Report unsupported capabilities.
- Add provider switching with preview and rollback.

### Phase 6: DNS automation

- Add optional DNS provider adapters.
- Support record creation and deletion with explicit confirmation.
- Protect provider credentials.
- Keep manual DNS configuration available.

### Phase 7: Advanced routing

- Add wildcard certificates.
- Add middleware management.
- Add weighted routing and load balancing.
- Add external targets.
- Add preview domains and deployment integration.

## Initial success criteria

The first complete version is successful when a user can:

1. Purchase a domain externally.
2. Configure an A record manually.
3. Add the domain to the Citadela Hub.
4. Verify the domain.
5. Leave the domain unassigned or reserve a subdomain.
6. Assign the domain to the Citadela Hub or a device service.
7. Install Traefik on the selected device.
8. Create a provider-neutral route.
9. Access the target through the domain.
10. Enable HTTPS and observe certificate status.
11. View proxy logs and route health.
12. Switch the device to Caddy with a preview and rollback path.

This establishes domains and proxy routing as reusable Citadela infrastructure instead of a feature coupled only to container deployments.
