---
name: dokutrak
description: Use when the Professional wants to connect DokuTrak to this agent (install dokutrak-mcp, get an Agent Connection), ask a Client for documents, know where a Document Request stands, chase a Client on rejected files, or when a DokuTrak tool answers with a refusal.
---

# DokuTrak

DokuTrak collects documents from Clients on behalf of a Professional: a Document Request goes
out by email, the Client uploads through a Secure Upload Link, the Professional approves or
rejects each file, and silent Clients are reminded automatically. The four `dokutrak` tools
put that loop in this agent: ask, know, chase, collect. Everything here acts under the
Professional's name and is logged; the service, not the connector, decides what is refused.

## Connect

Done when `get_request` with any `search` returns a result or "no match" — not a 401.

1. In the DokuTrak app, Settings → **Connect an agent**. Name the connection after this
   agent (it is what gets revoked later), click **Create connection**, then **Copy
   configuration**. The key is shown once; if it is lost, revoke and connect again.
2. Put the copied configuration where the client reads it:
   - Claude Desktop: merge it into `claude_desktop_config.json`
     (macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`), restart.
   - Claude Code: `claude mcp add dokutrak -e DOKUTRAK_API_KEY=<key> -- npx -y dokutrak-mcp`.
   - claude.ai is not supported: it needs a remote server, and this one runs locally over stdio.
3. Call `get_request` with a `search`. A 401 means the key is wrong or revoked: back to step 1.

## Ask

A real email leaves the service on `create_request`, to the address given and nobody else.
Before calling, have the Professional confirm three things in one message: the Client's
email, the deadline, and the checklist (one line per document, as the Client will read it).
Done when the result says `sent: true`; give the Professional the request id and the deadline.
If the result says the request was created but not sent, say so: it is in the dashboard,
where it can be sent.

## Know

`get_request` by id, or by `search` on the title, the Client's name or email. Several
matches come back as a list: show it and ask which one. Report what the Professional asked
for, from one call: status, each file with its verdict (approved, rejected with the
reviewer's reason, pending), and the reminder state (`sentCount`, `nextDueAt`).

## Chase

Silent Clients are already chased: `reminders.nextDueAt` is the next automatic reminder, so
"remind them" is answered by reading it, not by a tool. `request_replacement` is for one
case only, files with verdict `rejected`: it flags them, reopens the request and returns it
to the reminder cadence. Nothing is emailed by that call itself, and its optional message
goes to the audit trail, not to the Client; say both when reporting. Refused with "No
rejected documents" means nothing to chase.

## Collect

`download_documents` returns every collected file as one zip, embedded in the result as
binary content. Check with `get_request` that files have arrived first.

## Refusals

A tool error carries the service's own reason; relay it. Two are structural:

- `(401)`: the Agent Connection is revoked or wrong. Reconnect (see Connect).
- `Endpoint out of the agent surface (403)`: the act is not delegable to an agent —
  approving or rejecting a file, billing, workspace settings, keys. Tell the Professional
  it is theirs to do in the DokuTrak dashboard. No prompt changes this: the refusal is
  server-side.
