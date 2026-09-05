FROM node:22-bookworm-slim

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/@citadela/protocol/package.json packages/@citadela/protocol/package.json
COPY apps/@citadela/connector/package.json apps/@citadela/connector/package.json

RUN pnpm install --filter @citadela/protocol --filter @citadela/connector --frozen-lockfile

COPY packages/@citadela/protocol packages/@citadela/protocol
COPY apps/@citadela/connector apps/@citadela/connector

RUN pnpm --filter @citadela/protocol build \
  && pnpm --filter @citadela/connector build

ENV CITADELA_TEST_ROOT=/test-root

CMD ["pnpm", "--filter", "@citadela/connector", "test", "--", "--run", "test/filesystem-security.test.ts"]
