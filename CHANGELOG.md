# Changelog

All notable changes to `dokutrak-mcp` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/). The tool surface (names, descriptions, inputs)
is part of the public contract: it changes only with a decision recorded in
the DokuTrak product repository, and every such change is listed here.

## [0.1.0] — 2026-09-14

First public release. One complete round trip — ask, chase, know, collect —
as decided in ADR-014 of the DokuTrak product repository.

### Added

- `create_request` — creates a Document Request and sends it, in one call.
  Two API calls under the hood, creation with `sendEmail: false` then send,
  so a failed email is reported with the id of the request it left behind.
- `request_replacement` — the deterministic chase on rejected files. Nothing
  is emailed by the call itself; the request returns to the reminder cadence.
- `get_request` — status, checklist, every collected file with its verdict,
  and the reminder state, in one call. By id, or by a search term.
- `download_documents` — every collected file as one zip, embedded in the
  result as binary content (no link, no disk write).
- stdio transport; authentication by an Agent Connection read from
  `DOKUTRAK_API_KEY`, never from the command line; `DOKUTRAK_API_URL` to
  point at another deployment.
- Contract tests at the MCP seam: a real client and the real server over the
  SDK's in-memory transport, HTTP stubbed at `fetch`, no account needed.
- `npm run staging` — the scripted run against a real workspace
  (create → chase → read → collect → revoke → 401), never a CI check.

### Not in this release

- claude.ai (remote MCP over HTTP with OAuth). Only Claude Desktop and Claude
  Code, or any client that launches a stdio server with an `env` block.
- Approving or rejecting a document, billing, workspace settings, key
  management: the service refuses them to every Agent Connection, whatever
  the connector.

[0.1.0]: https://github.com/Crackx17/dokutrak-mcp/releases/tag/v0.1.0
