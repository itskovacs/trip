# TRIP MCP Server

MCP (Model Context Protocol) server for TRIP — lets AI assistants (Claude, OpenClaw, etc.) manage trips via tools.

## Tools (22)

Trips: create, list, get, update, delete, link_places
Days: add, update, delete
Items: add, update, delete
Places: create, list, update, delete
Categories: list, create
Packing: add_packing_item
Checklist: add_checklist_item
Sharing: share_trip, invite_member

## Setup

```bash
docker compose up -d
```

Environment variables:
- `TRIP_API_URL` — TRIP backend URL (default: http://localhost:8080)
- `TRIP_USERNAME` — Login username
- `TRIP_PASSWORD` — Login password

## Connect

Claude Code (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "trip": {
      "type": "sse",
      "url": "http://localhost:3001/sse"
    }
  }
}
```
