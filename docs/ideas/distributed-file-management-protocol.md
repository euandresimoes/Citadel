# Distributed File Management Protocol

## Summary

Citadela should provide a dedicated protocol for managing files and directories across connected devices.

The protocol will power a File Explorer in the Hub frontend and provide the file-transfer foundation required by the future Project Deploy Platform. It should support browsing, metadata, copy, cut, paste, move, rename, delete, upload, download, resumable transfers, cross-device transfers, deployment artifacts, backups, and workspace synchronization.

The protocol must be independent from the frontend. The Hub UI is one consumer, while deployments, backups, synchronization tools, CLI commands, and future integrations can reuse the same protocol.

## Product vision

A user should be able to:

1. Open the File Explorer for a connected device.
2. Browse allowed directories and inspect file metadata.
3. Select one or multiple files or directories.
4. Copy, cut, move, rename, create, download, upload, or delete them.
5. Navigate to another connected device.
6. Open a destination directory.
7. Paste or drag the selected items into that destination.
8. Watch the transfer progress from a global floating transfer panel.
9. Pause, resume, cancel, retry, or inspect a transfer.
10. Continue managing the Hub while long-running file operations execute in the background.

The user experience should feel like a local file manager even when the source and destination are different physical devices connected through LAN or Headscale.

## Architectural principles

- The Hub is the control plane for transfer jobs and operation state.
- Connectors are the execution authorities for their own filesystems.
- The Hub must not assume that it can access a device filesystem directly.
- A Connector must validate every path and permission locally.
- File contents should use binary streaming rather than being embedded in JSON messages.
- Large transfers must be resumable and cancellable.
- Every completed transfer must be verified cryptographically.
- A move must never delete the source before the destination is verified.
- The protocol must support both Hub-mediated and direct device-to-device transfers.
- The frontend should observe transfer state; it should not implement transfer reliability itself.
- Destructive operations must be explicit, auditable, and recoverable where possible.

## Main components

### Hub file management service

The Hub file management service coordinates operations and exposes authenticated APIs for the frontend.

Responsibilities include:

- creating and tracking file operation jobs;
- validating the requested source and destination devices;
- negotiating direct or Hub-mediated transfer paths;
- storing transfer metadata and audit events;
- forwarding control messages and progress events;
- reconnecting to interrupted jobs;
- applying conflict-resolution policies;
- reporting failures without hiding the Connector's error details.

The Hub should not perform privileged filesystem work on behalf of a Connector.

### Connector file service

Each Connector owns the local filesystem operations for its device.

Responsibilities include:

- exposing allowed filesystem roots;
- listing directories;
- reading metadata;
- opening read and write streams;
- validating normalized paths;
- creating temporary files;
- computing and verifying hashes;
- applying local permissions;
- atomically committing completed files;
- deleting, renaming, and moving items when authorized;
- cleaning up expired or cancelled transfers.

### Transfer coordinator

The transfer coordinator manages a transfer as a stateful operation rather than a single request.

It should support:

- source and destination device identities;
- source and destination paths;
- operation type;
- transfer mode;
- item manifest;
- total size and file count;
- progress;
- chunk acknowledgements;
- retries;
- pause and resume;
- cancellation;
- final verification;
- cleanup;
- audit history.

## File operation model

### File item

A file item should contain:

- stable item ID for the operation;
- relative path within the selected root;
- item type: file, directory, or symbolic link;
- size;
- modified timestamp;
- optional permissions metadata;
- optional file digest;
- optional per-chunk digests.

### File operation

Supported operations should include:

- `list`;
- `stat`;
- `mkdir`;
- `copy`;
- `cut`;
- `paste`;
- `move`;
- `rename`;
- `delete`;
- `upload`;
- `download`;
- `transfer`.

The protocol should distinguish an interactive clipboard intent from the actual transfer. `cut` stores a move intent, while `paste` starts the operation against a specific destination.

### Transfer job

A transfer job should contain:

- transfer ID;
- source device ID;
- destination device ID;
- source root and relative path;
- destination root and relative path;
- operation type: copy or move;
- list of items;
- total bytes;
- completed bytes;
- transfer mode;
- current state;
- conflict policy;
- expected digest or manifest digest;
- creation and expiration timestamps;
- initiating session and user audit information.

Suggested states are:

```text
created
preparing
transferring
paused
verifying
committing
completed
cancelled
failed
expired
```

## Transfer paths

### Hub-mediated transfer

The default path should work when the devices cannot reach each other directly:

```text
Device A → Connector A → Hub → Connector B → Device B
```

The Hub relays control and data streams while enforcing authentication, limits, and observability.

### Direct device-to-device transfer

When LAN or Headscale connectivity allows it, the Hub should negotiate a direct path:

```text
Device A → Device B
```

The Hub creates and authenticates the job, but the file bytes bypass the Hub. Progress and state events continue to flow through the Hub.

Direct transfer should only be enabled after both Connectors authenticate the same transfer ID and independently validate the source, destination, digest, and expiry time.

### Path selection

The coordinator can choose the transfer path using:

- provider connectivity;
- device reachability;
- expected file size;
- current Hub bandwidth;
- device policy;
- whether end-to-end encryption is required;
- whether the direct channel supports the required protocol version.

The selected path should be visible in diagnostics.

## Recommended transfer flow

1. The user selects one or more items.
2. The frontend creates a clipboard intent for copy or cut.
3. The user selects a destination directory.
4. The Hub creates a transfer job with an item manifest and policy.
5. The source Connector validates access and prepares the read stream.
6. The destination Connector validates the destination root and conflict policy.
7. The coordinator chooses Hub-mediated or direct transfer.
8. Data is sent in ordered chunks.
9. The destination acknowledges received chunks.
10. The transfer can pause, resume, retry, or cancel.
11. The destination computes or verifies the final digest.
12. The temporary destination files are atomically committed.
13. For a move, the source is deleted only after successful destination commit.
14. The Hub records completion and releases the transfer session.

## Chunking and integrity

The protocol should use binary WebSocket frames for file content and structured messages for control.

Required properties:

- ordered chunk sequence numbers;
- configurable chunk size;
- per-chunk byte length;
- optional per-chunk digest;
- complete-file SHA-256 digest;
- manifest digest for multi-file transfers;
- acknowledged offsets;
- resume from the last verified offset;
- bounded in-memory buffering;
- transfer rate and concurrency limits.

The receiver must write to a temporary location and must never expose a partially transferred file as complete. The final file becomes visible only after digest verification and atomic rename.

## Copy, cut, move, and paste semantics

### Copy

Copy creates a transfer job that leaves the source unchanged.

### Cut

Cut creates a temporary clipboard intent. It should not delete or modify the source. The source is removed only when the user pastes successfully and the operation is explicitly treated as a move.

### Move within one device

Move can use an atomic filesystem rename when source and destination are on the same filesystem and the Connector has permission. If that is not possible, it falls back to copy, verify, and delete.

### Move across devices

Cross-device move must always follow this sequence:

```text
Transfer
  ↓
Verify destination
  ↓
Commit destination
  ↓
Delete source
```

If any step before source deletion fails, the source must remain untouched.

## Conflict resolution

The destination policy should be selected when the job is created or when the conflict is detected.

Supported policies:

- `ask`;
- `overwrite`;
- `skip`;
- `rename`;
- `resume`;
- `fail`.

For multiple items, the UI should support applying a decision to one item or to all matching conflicts.

## Filesystem safety

The Connector must not expose the entire operating system filesystem by default.

Each device should define one or more allowed roots, for example:

```text
/home/user/Documents
/home/user/Projects
/var/lib/citadela/workspaces
```

The following protections are required:

- reject path traversal such as `..`;
- reject absolute paths outside an allowed root;
- resolve and validate symbolic links;
- prevent symbolic-link escapes from allowed roots;
- block system directories by default;
- apply maximum depth and item-count limits;
- apply maximum file-size and total-job limits;
- use restrictive temporary-file permissions;
- avoid shell interpolation for every filesystem operation;
- require explicit local permission for destructive operations;
- never follow a path after validation without rechecking relevant security conditions.

The Connector's local permission policy remains authoritative even when the Hub user is authenticated.

## Protocol message families

The protocol should use dedicated message families instead of embedding file operations in generic device commands.

Suggested messages include:

```text
file.roots.request
file.roots.response
file.list.request
file.list.response
file.stat.request
file.stat.response
file.operation.create
file.operation.accept
file.operation.progress
file.operation.pause
file.operation.resume
file.operation.cancel
file.operation.conflict
file.operation.verify
file.operation.completed
file.operation.failed
file.transfer.open
file.transfer.chunk
file.transfer.ack
file.transfer.resume
file.transfer.commit
file.transfer.cleanup
```

The exact protocol names should follow the conventions of `@citadela/protocol` and remain versioned and schema-validated.

## Frontend experience

### File Explorer

The File Explorer should provide:

- device selector;
- root selector;
- breadcrumb navigation;
- directory and file list;
- sorting and filtering;
- metadata view;
- multi-selection;
- context menu;
- copy, cut, paste, rename, delete, and new-folder actions;
- upload and download actions;
- keyboard shortcuts;
- clear empty, loading, error, and offline states.

The Explorer should not directly own transfer state. It should subscribe to the global transfer store and create operations through the Hub API.

### Global transfer panel

Long-running operations should appear in a floating panel at the top-right of the Hub interface.

The panel should show:

- source device;
- destination device;
- source and destination paths;
- each file or directory;
- item size;
- total progress;
- current speed;
- estimated remaining time;
- current operation label: copying, moving, verifying, paused, failed, or completed;
- transfer path: direct or Hub-mediated;
- pause, resume, retry, and cancel controls.

Example:

```text
┌──────────────────────────────────────┐
│ File transfers                       │
├──────────────────────────────────────┤
│ ThinkPad → Raspberry Pi              │
│ project.zip           42%            │
│ 180 MB / 430 MB                      │
│ Verifying destination                │
│ [Pause] [Cancel]                     │
└──────────────────────────────────────┘
```

The panel should remain visible while the user navigates between devices and views.

## Reuse by other Citadela features

The file protocol should become a shared transport layer for:

- Project Deploy Platform source uploads;
- Git repository snapshots;
- Docker Compose files;
- Docker build contexts;
- environment templates;
- deployment artifacts;
- backups and restores;
- workspace synchronization;
- log downloads;
- configuration import and export;
- copying files between devices;
- copying files into or out of containers;
- future CLI and TUI file management.

Project deployments should create a transfer job and verify the workspace before starting a build. They should not implement an independent upload mechanism.

## Security and authorization

Required security controls include:

- authenticated Hub sessions;
- authenticated Connector identities;
- device-to-device transfer authorization;
- local Connector permission checks;
- operation-scoped authorization tokens;
- short-lived transfer sessions;
- transfer expiration;
- source and destination root restrictions;
- file-size and item-count limits;
- rate and concurrency limits;
- digest verification;
- audit events;
- secret redaction from logs and metadata;
- explicit confirmation for delete and destructive move operations;
- cancellation and cleanup guarantees.

The Hub can authorize a job, but it must never bypass the Connector's local filesystem policy.

## Reliability and recovery

The protocol should handle:

- device disconnects;
- Hub restarts;
- Connector restarts;
- expired sessions;
- partial files;
- duplicate requests;
- destination conflicts;
- insufficient disk space;
- permission failures;
- source changes during transfer;
- network switching between LAN and Headscale.

Jobs should be idempotent where possible. A reconnecting client should be able to query the job state and resume from the last verified checkpoint.

If the source changes during a transfer, the Connector should either fail with a source-changed error or restart according to the job policy. Silent corruption must never be accepted.

## Observability

Each operation should emit structured events with:

- transfer ID;
- item ID;
- source and destination device IDs;
- operation type;
- state transition;
- bytes transferred;
- current speed;
- retry count;
- error code;
- timestamps;
- selected transfer path.

The frontend can use these events for live progress, while the Hub stores a compact operation history for diagnostics and auditing.

## Implementation phases

### Phase 1: Protocol foundation

- Define file and transfer schemas.
- Define allowed roots and metadata structures.
- Define operation states and error codes.
- Define binary chunk framing.
- Add protocol validation tests.

### Phase 2: Local Connector filesystem service

- Implement root discovery.
- Implement safe path normalization.
- Implement directory listing and metadata.
- Implement local create, rename, move, and delete.
- Add permission checks and filesystem tests.

### Phase 3: Hub-mediated transfers

- Implement transfer job persistence.
- Implement upload and download streams.
- Add chunk acknowledgements and digest verification.
- Add pause, resume, retry, cancel, and cleanup.
- Add integration tests using temporary directories.

### Phase 4: Files Explorer

- Add device and root selection.
- Add directory browsing and metadata.
- Add clipboard intents for copy and cut.
- Add paste, rename, new folder, delete, upload, and download.
- Add the global transfer panel.

### Phase 5: Direct device-to-device transfers

- Add connectivity negotiation.
- Authenticate both Connector endpoints.
- Add direct LAN and Headscale transfer paths.
- Fall back to Hub mediation when direct transfer is unavailable.
- Add transfer-path diagnostics.

### Phase 6: Deployment integration

- Transfer verified project workspaces.
- Transfer Compose YAML and build contexts.
- Reuse transfer progress in deployment logs.
- Add artifact transfer and rollback support.
- Add cleanup policies for old workspaces.

### Phase 7: Advanced capabilities

- Deduplication by digest.
- Parallel file transfers.
- Transfer compression.
- Bandwidth scheduling.
- Background synchronization.
- Backup and restore workflows.
- Container file browsing.
- CLI and TUI file management.

## Initial vertical slice

The first complete version should allow a user to:

1. Open a connected device in the Hub.
2. Browse an allowed directory.
3. Select one file.
4. Copy it to a second connected device.
5. Watch progress in the floating transfer panel.
6. Verify the destination digest.
7. Confirm that the original remains unchanged.
8. Repeat the operation as a cross-device move.
9. Confirm that the source is deleted only after successful verification.
10. Reuse the same transfer service to upload a project workspace for deployment.

This vertical slice establishes the core reliability and security guarantees before adding advanced synchronization, project deployments, or public application hosting.
