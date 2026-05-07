# Voltcraft — Self-hosted Tesla Fleet Companion

**Latest update**: OAuth Tesla + Partner Fleet flow + visual refresh ✨

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your settings (or use setup wizard on first access)

# 2. Start services
docker compose up -d

# 3. Access application
# Web UI: http://localhost:3000
# API Docs: http://localhost:3001/docs
```

On first access, you'll see an interactive **Setup Wizard** that guides you through:
- Admin account creation
- Tesla OAuth configuration
- Optional MQTT/Home Assistant setup

Then in Settings:
- Connect with Tesla OAuth
- Register Tesla Fleet partner (if required)
- Run first sync

## Features

- ⚡ **Premium dark UI** with refreshed mobile visuals
- 🔋 Real-time battery & charge tracking
- 🗺️ Trip history & energy analytics
- 🤖 Local automation rules (no SaaS)
- 🏠 Home Assistant MQTT integration
- 💰 Tesla Fleet API cost awareness

## Notes

- Partner public key must be publicly reachable at:
	`https://<your-domain>/.well-known/appspecific/com.tesla.3p.public-key.pem`
- If lock/unlock fails, reconnect OAuth and verify command scope (`vehicle_cmds`).

## Architecture

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Fastify + Prisma + PostgreSQL
- **Cache**: Redis + BullMQ
- **MQTT**: Mosquitto for Home Assistant
- **Docker**: 100% containerized, local-only

## Documentation

See [README.md](./README.md) for full documentation.

---

**Tesla® is a trademark of Tesla, Inc.** — Voltcraft is independent and not affiliated with Tesla.
