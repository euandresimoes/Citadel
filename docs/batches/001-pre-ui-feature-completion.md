# Batch 1 — Profile Settings and OTP Management

- [x] Add the authenticated profile settings screen.
- [x] Add display name editing.
- [x] Add avatar upload and preview.
- [x] Convert uploaded avatars to validated base64 data URLs.
- [x] Add OTP enrollment flow with QR code display.
- [x] Add OTP confirmation flow.
- [x] Display recovery codes exactly once after enrollment.
- [x] Add password and OTP authentication method management.
- [x] Add loading, validation, cancellation, and error states.
- [x] Add unit tests for profile settings components.
- [x] Add integration tests for profile settings API calls.
- [x] Add E2E coverage for password profile setup.
- [x] Add E2E coverage for OTP enrollment and login.
- [x] Validate the complete profile flow with the frontend and backend connected.

# Batch 2 — Device Revocation

- [x] Add a revoke action to the device details view.
- [x] Require explicit confirmation before revocation.
- [x] Disable revocation while the request is pending.
- [x] Handle revoked device responses and errors.
- [x] Update the device list after revocation.
- [x] Update the device details view after revocation.
- [x] Add unit tests for revoke actions and confirmation behavior.
- [x] Add backend integration tests for authorized revocation.
- [x] Add backend integration tests for rejected unauthorized revocation.
- [x] Add E2E coverage for device revocation.
- [x] Validate revocation against the real PostgreSQL database in Docker.
- [x] Validate the complete revocation flow with the frontend and backend connected.

# Batch 3 — Manual System Information Refresh

- [x] Add an explicit system information refresh command.
- [x] Add refresh loading and disabled states.
- [x] Update system information without replacing unrelated device state.
- [x] Handle offline devices and unavailable responses.
- [x] Update system information through SSE events when applicable.
- [x] Add unit tests for refresh behavior.
- [x] Add Connector tests for repeated system information requests.
- [x] Add Hub tests for system information updates.
- [x] Add E2E coverage for manual refresh.
- [x] Validate the refresh flow with the frontend and backend connected.

# Batch 4 — Real-Time Device Metrics

- [ ] Define the system metrics protocol messages and schemas.
- [ ] Define supported metrics and capability requirements.
- [ ] Implement Linux metrics collection.
- [ ] Implement Windows metrics collection.
- [ ] Add safe fallbacks for unavailable metrics.
- [ ] Add bounded collection intervals and resource limits.
- [ ] Send metrics snapshots through the authenticated Realtime Service.
- [ ] Persist the latest metrics snapshot in the device registry.
- [ ] Expose metrics through read-only GraphQL queries.
- [ ] Publish metrics updates through SSE.
- [ ] Add frontend metrics hooks.
- [ ] Add functional metrics cards to the device details view.
- [ ] Add unit tests for platform-specific collectors.
- [ ] Add protocol validation tests.
- [ ] Add Realtime Service integration tests.
- [ ] Add PostgreSQL integration tests using Docker.
- [ ] Add E2E coverage for metrics loading and live updates.
- [ ] Validate the complete metrics flow with frontend and backend connected.

# Batch 5 — Capabilities and Permissions

- [ ] Persist device capabilities during authenticated handshakes.
- [ ] Persist device permissions during authenticated handshakes.
- [ ] Update capabilities and permissions on reconnect.
- [ ] Expose capabilities and permissions through GraphQL.
- [ ] Enforce capability checks before exposing device actions.
- [ ] Enforce permission checks before dispatching commands.
- [ ] Hide unsupported frontend actions.
- [ ] Display unavailable capabilities clearly in the device details view.
- [ ] Add protocol validation tests for capabilities and permissions.
- [ ] Add backend authorization tests for unsupported actions.
- [ ] Add frontend tests for capability-aware rendering.
- [ ] Add E2E coverage for supported and unsupported device actions.
- [ ] Validate capability persistence with the real PostgreSQL database in Docker.
- [ ] Validate the complete capability flow with the frontend and backend connected.

# Batch 6 — Network Provider Management

- [ ] Expose the active network provider in the device read model.
- [ ] Expose provider connectivity state through GraphQL.
- [ ] Add LAN provider status handling.
- [ ] Add Headscale provider status handling.
- [ ] Add provider configuration models and validation.
- [ ] Add authenticated provider configuration endpoints.
- [ ] Add safe network provider switching behavior.
- [ ] Preserve the one-network-per-device invariant.
- [ ] Add frontend provider status and configuration views.
- [ ] Disable provider actions while a switch is pending.
- [ ] Add confirmation for network changes that interrupt connectivity.
- [ ] Add unit tests for provider contracts and validation.
- [ ] Add backend integration tests for provider configuration.
- [ ] Add Realtime integration tests for provider switching.
- [ ] Add E2E coverage for LAN and Headscale provider states.
- [ ] Validate provider persistence with the real PostgreSQL database in Docker.
- [ ] Validate the complete provider flow with the frontend and backend connected.

# Batch 7 — Operational Dashboard

- [ ] Add the connected device count.
- [ ] Add the offline device count.
- [ ] Add recent command activity.
- [ ] Add recent device lifecycle events.
- [ ] Add system health summaries.
- [ ] Add metrics summaries for supported devices.
- [ ] Add dashboard loading, empty, and error states.
- [ ] Update dashboard data through SSE.
- [ ] Link dashboard items to device details and command history.
- [ ] Add unit tests for dashboard data composition.
- [ ] Add frontend integration tests for dashboard updates.
- [ ] Add E2E coverage for the authenticated operational dashboard.
- [ ] Validate dashboard data against the real backend and Docker PostgreSQL.
- [ ] Validate the complete dashboard flow with the frontend and backend connected.
- [ ] Verify all batches are complete before starting the UI redesign.
