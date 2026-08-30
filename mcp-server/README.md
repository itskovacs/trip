# TRIP MCP Server

MCP (Model Context Protocol) server for TRIP — lets AI assistants (Claude, OpenClaw, etc.) manage trips via tools.

## Tools (57)

- Trips: create, list, get, update (incl. archive/unarchive), delete, link_places, get_trip_balance, list_pending_invitations, accept_trip_invite, decline_trip_invite
- Days: add, update, delete Items: add, update (incl. moving between days, paid_by, attachments), delete
- Bookings: add_booking, update_booking, delete_booking
- Places: search_places, bulk_resolve_places, create, list, get, update (full field set), delete
- Categories: list, create, update, delete
- Packing (default list): list, add, update, delete
- Checklist (default list): list, add, update, delete (incl. `notify_dt` reminders)
- Packing lists (named, multiple per trip): list_packing_lists, create/update/delete_packing_list, add/update/delete_packing_list_entry
- Checklists (named, multiple per trip): list_checklists, create/update/delete_checklist, add/update/delete_checklist_entry (incl. `notify_dt` reminders)
- Sharing: get_trip_share, share_trip, unshare_trip
- Members: list_trip_members, invite_member

> [!NOTE]
> Every trip has one built-in "default" packing list and checklist (the plain `packing`/`checklist` tools above), plus any number of separately named ones (the `*_list`/`*_entry` tools). These are independent stores — items are not shared or migrated between them.

> [!WARNING]
> The MCP server is comprehensive and includes almost all the features that TRIP has. Certain features are simply not available: remove a trip member, delete a trip attachment, upload attachment, download file, providers _routing_/_nearby-search_/_geocode_/_mymaps_/_takeout-import_, trip calendar/ICS subscriptions, and everything under `/api/admin`, `/api/auth`, `/api/settings`.

## Setup

Use the `docker-compose.yml` file provided in this repository. Edit _environment variables_:

- `TRIP_API_URL` — TRIP backend URL (default: http://localhost:8080)

And the authentication, either (if both a login and a token are configured, the login wins):

- `TRIP_USERNAME` and `TRIP_PASSWORD` — Login credentials
- `TRIP_TOKEN` — API token instead of a login (generate one from settings).

Run the container:

```bash
docker compose up -d
```

## Connect

By default the MCP runs on `0.0.0.0:3001`. You can edit this in the `server.py` file (`mcp.run(transport="http", host="0.0.0.0", port=3001)`).

See FastMCP documentation for integration (e.g. [ChatGPT](https://gofastmcp.com/v3/integrations/chatgpt), [Claude Code](https://gofastmcp.com/v3/integrations/claude-code), [Gemini CLI](https://gofastmcp.com/v3/integrations/gemini-cli)). Example for _Claude_:

```bash
claude mcp add --transport http TRIP http://localhost:3001/mcp
```
