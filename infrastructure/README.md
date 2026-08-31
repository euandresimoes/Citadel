# Citadel infrastructure

The local Compose stack currently provides PostgreSQL for the Device Service
and Hub Service.

```bash
docker compose -f infrastructure/docker-compose.yml up -d postgres
```

Use this connection string with the Hub Runtime:

```text
postgresql://citadel:citadel-dev-only@127.0.0.1:5432/citadel
```

The default password is for local development only. Copy
`infrastructure/.env.example` to an environment-specific file before sharing
or deploying the stack.
