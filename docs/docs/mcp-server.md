---
sidebar_position: 8
description: Manage TRIP with AI assistants
---

# MCP Server

TRIP ships with an MCP (Model Context Protocol) server that lets AI assistants such as Claude create and manage trips, places, and itineraries directly on your TRIP instance. It runs as its own container, found in the `mcp-server/` directory of the repository, and exposes tools to interact (covering trips, days, items, bookings, places, categories, packing lists, checklists, sharing, and members).

:::important
Some actions are not available through the MCP server: removing a trip member, deleting a trip attachment, uploading an attachment, downloading a file, provider routing/nearby search/geocode/MyMaps/takeout import, and anything under `/api/admin`, `/api/auth`, or `/api/settings`.
:::

## Setup

The `mcp-server/` directory contains a ready to use `docker-compose.yml`. Edit or set environment variables before starting the container.

```yaml title="mcp-server/docker-compose.yml"
environment:
  TRIP_API_URL: http://127.0.0.1:8080
  TRIP_USERNAME:
  TRIP_PASSWORD:
  TRIP_TOKEN:
```

- `TRIP_API_URL`: URL of your TRIP backend (defaults to `http://127.0.0.1:8080`)
- `TRIP_USERNAME` / `TRIP_PASSWORD`: login credentials for a regular TRIP account
- `TRIP_TOKEN`: a [TRIP API Key](/docs/trip-api/generating-trip-api-key) generated from Settings

Set either the login pair or the token. If both are set, the login credentials take priority.

:::warning
Accounts with TOTP enabled cannot use the username/password method. Use an API token instead, or an account without TOTP.
:::

The container runs with `network_mode: host` by default so it can reach TRIP backend on the same machine. Adjust `TRIP_API_URL` if your backend runs elsewhere (you can remove `network_mode: host` in this case)

Start the server:

```bash
cd mcp-server
docker compose up -d
```

## Connect

By default the server listens on `0.0.0.0:3001` and speaks HTTP transport at the `/mcp` path (to change the port, edit the `mcp.run(...)` call at the bottom of `server.py`).

Example for Claude Code:

```bash
claude mcp add --transport http TRIP http://localhost:3001/mcp
```

Other clients (ChatGPT, Cursor, Gemini CLI, etc.) can connect to the MCP. See the FastMCP documentation for their specific setup (e.g. [ChatGPT](https://gofastmcp.com/v3/integrations/chatgpt), [Claude Code](https://gofastmcp.com/v3/integrations/claude-code), [Gemini CLI](https://gofastmcp.com/v3/integrations/gemini-cli)).

## Available tools

- **Trips**: create, list, get, update (including archive/unarchive), delete, link places, get expense balance, list/accept/decline invitations
- **Days & items**: add, update, delete days and items, including moving items between days, setting who paid, and attachments
- **Bookings**: add, update, delete
- **Places**: search, bulk resolve, create, list, get, update, delete
- **Categories**: list, create, update, delete
- **Packing & checklist**: list, add, update, delete
- **Sharing & members**: get/enable/disable the public share link, list members, invite a member

Once connected, describe what you want in natural language (e.g. `create a 5 day trip to Lisbon and add the places I already saved for it`, `Here is my complete planning in txt format, integrate the plans in my Japan trip, use the places it holds do not create new ones`, etc.) and the assistant picks the right tools to call.
