# Distributed File Management Protocol

## Risk assessment

- [ ] Treat this feature as high risk: 8/10.
- [ ] Keep the Hub as the control plane and the Connector as the filesystem authority.
- [ ] Do not implement frontend-owned transfer reliability.
- [ ] Do not implement project deployment before the transfer vertical slice is stable.

## Batch 1: Protocol contract and validation

- [x] Define file operation names and versioned message envelopes in `@citadela/protocol`.
- [x] Define file item, file root, metadata, clipboard intent, transfer job, transfer manifest, and chunk types.
- [x] Define transfer states and all terminal and recoverable transitions.
- [x] Define protocol error codes for path, permission, conflict, storage, integrity, session, and transport failures.
- [x] Define conflict policies: `ask`, `overwrite`, `skip`, `rename`, `resume`, and `fail`.
- [x] Define binary chunk framing and acknowledgement payloads.
- [x] Define operation-scoped transfer authorization fields and expiration rules.
- [x] Define protocol limits for chunk size, file size, item count, depth, concurrency, and transfer lifetime.
- [x] Export file protocol modules without coupling them to Hub, Connector, or frontend implementations.

### TDD tests

- [x] Test valid and invalid file operation envelopes.
- [x] Test schema version compatibility and rejection of unsupported versions.
- [ ] Test every valid transfer state transition.
- [x] Test rejection of invalid state transitions.
- [x] Test chunk sequence, byte length, offset, and digest validation.
- [x] Test manifest digest calculation determinism.
- [x] Test authorization expiration and operation scope validation.
- [ ] Test every protocol error code serialization.

## Batch 2: Connector filesystem security foundation

- [x] Add configurable allowed filesystem roots to the Connector.
- [x] Define safe default roots without exposing the complete operating system filesystem.
- [x] Implement path normalization relative to an allowed root.
- [x] Reject absolute paths outside configured roots.
- [x] Reject traversal through `..` segments.
- [x] Resolve symbolic links and reject escapes from allowed roots.
- [ ] Block protected system directories by default.
- [x] Enforce maximum path depth, item count, file size, and total operation size.
- [x] Create restrictive temporary-file directories with restrictive permissions.
- [x] Add filesystem permission mappings for list, read, write, rename, move, delete, and transfer.
- [x] Ensure local Connector permissions remain authoritative over Hub authorization.
- [x] Add structured filesystem error translation without leaking secrets or host internals.

### TDD tests

- [x] Test valid relative paths inside every allowed root.
- [x] Test traversal, absolute-path, encoded traversal, and mixed-separator attacks.
- [x] Test symbolic-link escape prevention on Linux.
- [ ] Test protected-directory rejection.
- [x] Test depth, item-count, file-size, and total-size limits.
- [ ] Test permission denial for every filesystem operation.
- [x] Test restrictive temporary-file permissions.
- [ ] Test error redaction for usernames, secrets, and absolute host paths.

### Docker and integration tests

- [x] Run the Connector filesystem service in a Linux Docker test environment.
- [x] Mount an allowed temporary root and verify that inaccessible mounts remain inaccessible.
- [x] Execute the security test suite against real temporary files and directories.

## Batch 3: Local filesystem operations

- [x] Implement root discovery.
- [x] Implement directory listing with stable ordering and pagination support.
- [x] Implement file and directory metadata lookup.
- [x] Implement directory creation.
- [x] Implement file and directory rename.
- [x] Implement same-device move with atomic rename when safe.
- [x] Implement copy with temporary destination files and atomic commit.
- [x] Implement delete with explicit permission checks.
- [x] Implement stateless request idempotency keys for mutating operations.
- [x] Implement Connector-side operation cancellation and cleanup.
- [x] Expose operations through dedicated Connector file-service handlers.

### TDD tests

- [x] Test root discovery and root metadata.
- [x] Test listing empty, populated, nested, hidden, and mixed-type directories.
- [x] Test metadata for files, directories, and supported symbolic links.
- [x] Test mkdir, rename, move, copy, and delete success cases.
- [x] Test duplicate idempotency keys do not repeat mutations.
- [x] Test cancellation removes temporary state.
- [x] Test failures leave the source unchanged.
- [x] Test atomic commit does not expose partial destination files.

### E2E tests

- [ ] Start a real Connector with an isolated temporary filesystem root.
- [ ] Browse the root from a real Hub request.
- [ ] Create, rename, copy, move, and delete real files through the protocol.
- [ ] Verify the resulting filesystem state independently from the API response.

## Batch 4: Hub file service and transfer job persistence

- [x] Create the Hub file management service.
- [x] Add transfer job persistence with migrations and repository interfaces.
- [x] Persist source and destination devices, roots, paths, manifest, policy, limits, and audit context.
- [x] Persist state transitions, progress checkpoints, retry counts, and error details.
- [x] Implement job expiration cleanup through an explicit service operation.
- [x] Implement authenticated APIs for roots, list, stat, and local operations.
- [x] Implement authenticated APIs for creating and controlling transfer jobs.
- [x] Validate source and destination device existence and online state when the Hub read model is available.
- [x] Generate short-lived, operation-scoped Connector authorization tokens.
- [x] Ensure duplicate create requests resolve to one idempotent transfer job.
- [x] Add non-sensitive Hub events for transfer creation and control actions.

### TDD tests

- [x] Test repository persistence and restoration of transfer records and retry metadata.
- [x] Test migration creation and rollback safety.
- [ ] Test state transition persistence under concurrent updates.
- [x] Test job expiration and cleanup behavior.
- [x] Test authenticated access, CSRF protection, and online-device validation for transfer APIs.
- [x] Test operation-scoped token audience, device binding, scope, signature, and expiration.
- [x] Test idempotent job creation through the REST API.
- [x] Test transfer event creation without exposing credentials.

### PostgreSQL and integration tests

- [x] Run the Hub and PostgreSQL through Docker Compose.
- [x] Execute repository tests against real PostgreSQL, not only mocks.
- [x] Restart the Hub and verify persisted jobs remain queryable.
- [ ] Verify expired jobs and temporary state are cleaned after restart.

## Batch 5: Hub-mediated streaming transfers

- [x] Implement source read-stream negotiation.
- [x] Implement destination write-stream negotiation.
- [x] Implement Hub-mediated binary WebSocket frame relay with source/destination routing.
- [x] Implement ordered chunks with bounded memory buffering.
- [x] Implement chunk acknowledgements and verified offsets.
- [x] Implement complete-file SHA-256 verification.
- [x] Implement multi-file manifest verification.
- [x] Write destination data to temporary paths until verification succeeds.
- [x] Atomically commit verified destination files.
- [x] Implement pause, resume, retry, cancel, and cleanup controls.
- [x] Implement copy semantics without changing the source.
- [x] Implement cross-device move as transfer, verify, commit, then source deletion.
- [x] Preserve the source when any pre-deletion step fails.
- [x] Implement conflict detection and all configured conflict policies.
- [ ] Emit progress events with bytes, speed, state, retry count, and transfer path.

### TDD tests

- [x] Test single-file upload and download streams.
- [x] Test multi-file and nested-directory manifests.
- [x] Test out-of-order, duplicate, truncated, and corrupted chunks.
- [x] Test digest mismatch never commits the destination.
- [x] Test resume starts at the last verified offset.
- [x] Test pause, cancel, retry, expiration, and cleanup.
- [x] Test Hub restart recovery from persisted checkpoints.
- [ ] Test insufficient disk space and permission failures.
- [ ] Test every conflict policy.
- [x] Test cross-device move never deletes the source before commit verification.

### Docker and E2E tests

- [ ] Start PostgreSQL, Hub, Realtime, and two real Connectors with Docker Compose.
- [x] Transfer a file from Connector A to Connector B through the Hub.
- [ ] Verify progress and terminal events through the authenticated realtime channel.
- [ ] Kill and restart a Connector during transfer and resume successfully.
- [ ] Kill and restart the Hub during transfer and resume from the persisted checkpoint.
- [ ] Corrupt a chunk and verify that the transfer fails safely.
- [ ] Verify copy leaves the source unchanged.
- [ ] Verify move deletes the source only after destination verification.

## Batch 6: Frontend Files Explorer

- [ ] Use a macOS Sequoia Finder-inspired visual direction for the Files Explorer.
- [ ] Add a Finder-style sidebar with devices and allowed filesystem roots.
- [ ] Add a compact toolbar with navigation, search, and file actions.
- [ ] Add breadcrumb navigation with a clear current-location state.
- [ ] Support list, icon, and column-style directory views.
- [ ] Add file preview and metadata presentation where supported.
- [ ] Add drag-and-drop between directories and connected devices.
- [ ] Integrate the global transfer panel into the Explorer experience.
- [ ] Define polished loading, empty, offline, conflict, and error states.
- [ ] Add a device selector.
- [ ] Add an allowed-root selector.
- [ ] Add breadcrumb navigation.
- [ ] Add directory and file listing with metadata.
- [ ] Add sorting, filtering, pagination, loading, empty, offline, and error states.
- [ ] Add single and multi-selection.
- [ ] Add copy and cut clipboard intents.
- [ ] Add paste into the active destination directory.
- [ ] Add new-folder, rename, delete, upload, and download actions.
- [ ] Add explicit confirmation for delete and destructive move operations.
- [ ] Add keyboard shortcuts without conflicting with global navigation.
- [ ] Add a global transfer panel independent from the current Explorer route.
- [ ] Display source and destination devices, paths, items, progress, speed, ETA, state, and transfer path.
- [ ] Add pause, resume, retry, cancel, and transfer-detail controls.
- [ ] Reconcile realtime events without flicker or duplicate list entries.
- [ ] Keep transfer jobs visible while navigating between devices and views.

### TDD and component tests

- [ ] Test breadcrumb navigation and root boundary behavior.
- [ ] Test selection, multi-selection, sorting, and filtering.
- [ ] Test copy, cut, paste, rename, delete, and new-folder request payloads.
- [ ] Test destructive confirmation flows.
- [ ] Test loading, empty, offline, conflict, and error states.
- [ ] Test transfer-panel state reconciliation and duplicate-event handling.
- [ ] Test pause, resume, retry, and cancel controls.

### Playwright E2E tests

- [ ] Open the Files Explorer for a connected device.
- [ ] Browse directories and inspect metadata.
- [ ] Create and rename a directory.
- [ ] Copy one file to a second device.
- [ ] Move multiple files to a second device.
- [ ] Resolve an overwrite and rename conflict.
- [ ] Upload and download a file.
- [ ] Observe transfer progress in the global panel while navigating elsewhere.
- [ ] Confirm delete and verify the item disappears after success.
- [ ] Verify offline and reconnect states.

## Batch 7: Direct device-to-device transfers

- [ ] Define connectivity capability exchange for LAN and Headscale providers.
- [ ] Implement direct-path negotiation through the Hub.
- [ ] Authenticate both Connector endpoints for the same transfer ID.
- [ ] Validate source, destination, manifest, digest, scope, and expiry independently on both Connectors.
- [ ] Implement direct binary transfer without routing file contents through the Hub.
- [ ] Continue sending control, progress, and audit events through the Hub.
- [ ] Add path selection based on reachability, provider, file size, policy, and Hub bandwidth.
- [ ] Expose the selected path in transfer diagnostics.
- [ ] Fall back to Hub mediation when direct transfer is unavailable.
- [ ] Prevent direct transfers when either Connector cannot prove authorization.

### TDD and integration tests

- [ ] Test direct-path capability negotiation.
- [ ] Test LAN direct transfer authorization.
- [ ] Test Headscale direct transfer authorization.
- [ ] Test provider mismatch and unreachable peers.
- [ ] Test fallback to Hub-mediated transfer.
- [ ] Test expired, replayed, and cross-transfer authorization tokens.
- [ ] Test direct transfer integrity and resume behavior.

### E2E tests

- [ ] Run two Connectors on reachable LAN endpoints and complete a direct transfer.
- [ ] Run two Connectors with a simulated Headscale provider and complete a direct transfer.
- [ ] Block peer connectivity and verify automatic Hub fallback.
- [ ] Verify the Hub never receives file bytes in a successful direct transfer.
- [ ] Verify progress and audit history remain complete for both paths.

## Batch 8: Reliability, observability, and operational hardening

- [ ] Add structured transfer logs with transfer ID, item ID, devices, state, bytes, retries, path, and error code.
- [ ] Add metrics for throughput, latency, active jobs, failures, retries, cancellations, and integrity failures.
- [ ] Add transfer diagnostics to the Hub device and operation views.
- [ ] Add retention rules for completed jobs and audit records.
- [ ] Add cleanup for abandoned temporary files and expired sessions.
- [ ] Add rate, concurrency, and resource limits per device and globally.
- [ ] Add source-change detection during transfer.
- [ ] Add safe handling for device disconnects, network changes, and Hub restarts.
- [ ] Add recovery commands for administrators through the CLI and TUI.
- [ ] Add feature flags for Hub-mediated and direct transfer paths.
- [ ] Add compatibility checks for Connector and protocol versions.
- [ ] Document recovery, limits, permissions, and troubleshooting procedures.

### TDD and integration tests

- [ ] Test reconnect behavior after device disconnects.
- [ ] Test network switching between LAN and Headscale.
- [ ] Test Hub restart recovery for active and paused jobs.
- [ ] Test cleanup after cancellation, expiration, failure, and process termination.
- [ ] Test rate and concurrency limits.
- [ ] Test metrics and structured event completeness.
- [ ] Test protocol-version incompatibility handling.
- [ ] Test source-change detection and safe failure.

### Full Docker and Playwright E2E tests

- [ ] Start the complete Docker environment with PostgreSQL, gateway, Hub, Realtime, web app, and two Connectors.
- [ ] Execute the initial vertical slice entirely through the frontend.
- [ ] Execute copy, move, upload, download, pause, resume, retry, cancel, conflict, and delete flows.
- [ ] Restart Hub, Realtime, and Connectors during active transfers.
- [ ] Verify PostgreSQL job history and audit records after recovery.
- [ ] Verify no partial or unverified destination is exposed.
- [ ] Verify no unauthorized root or path is reachable.
- [ ] Verify the global transfer panel remains correct across route changes.
- [ ] Capture browser, Hub, Realtime, Connector, and PostgreSQL logs for failed scenarios.

## Batch 9: Reusable integrations and release readiness

- [ ] Expose a stable service interface for future Project Deploy Platform integrations.
- [ ] Reuse transfer jobs for project workspace uploads without duplicating upload logic.
- [ ] Add artifact transfer and cleanup extension points.
- [ ] Add CLI commands for listing roots, browsing files, and inspecting transfers.
- [ ] Add TUI screens for filesystem browsing and transfer monitoring.
- [ ] Add protocol, Hub, Connector, frontend, Docker, and E2E documentation.
- [ ] Review all security-sensitive code and filesystem operations.
- [ ] Run the complete monorepo typecheck, lint, unit, integration, and E2E suites.
- [ ] Verify clean installation and startup from the published packages.
- [ ] Verify backward compatibility with existing pairing, permissions, realtime, and device-management flows.
- [ ] Record known limitations and explicitly defer unsupported filesystem features.
- [ ] Mark the feature complete only after the initial vertical slice and recovery scenarios pass.

## Definition of done

- [ ] A user can browse an allowed directory on a connected device.
- [ ] A user can copy a file to another connected device through the Hub.
- [ ] A user can move files across devices with verify-before-delete semantics.
- [ ] Large transfers support progress, pause, resume, retry, cancellation, and cleanup.
- [ ] Every completed transfer has verified integrity.
- [ ] Unauthorized paths, operations, and devices are rejected by the Connector.
- [ ] Hub restarts, Connector restarts, disconnects, and network changes recover safely.
- [ ] The frontend displays reliable transfer state independently of the active route.
- [ ] Docker-backed integration and Playwright E2E suites pass.
- [ ] The protocol is reusable by the future Project Deploy Platform.
