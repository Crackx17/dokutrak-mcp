# Changelog

All notable changes to `dokutrak-mcp` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/). The tool surface (names, descriptions, inputs)
is part of the public contract: it changes only with a decision recorded in
the DokuTrak product repository, and every such change is listed here.

## [Unreleased]

### Added

- An MCP Bundle, `dokutrak.mcpb`: one-click install in Claude Desktop, the
  Agent Connection asked for at install and stored as a sensitive setting.
  `npm run bundle` builds it (`mcpb/manifest.json`, dependencies inlined in
  one file), checks it against the running server and packs it; the release
  workflow attaches it to each GitHub release. The npm package is unchanged.
- A Privacy Policy section in the README.

## [0.1.1] — 2026-09-23

Decision recorded in the DokuTrak product repository: ADR-014, amendment of
2026-09-23 (dokutrak-product#577).

### Changed

- `create_request` asks before it sends. Its description tells the agent to
  show the Professional the recipient email, the deadline, each document and
  the message, and to call only once they have confirmed. The tool is now
  annotated `destructiveHint: true` and `openWorldHint: true`, and carries
  `_meta["anthropic/requiresUserInteraction"]: true`, so Claude Desktop and
  Claude Code ask the Professional before every call.
- `request_replacement` says that no immediate email to the Client exists,
  not even from the dashboard. An agent had told a Professional otherwise.
- The install skill asks for the message as well, and asks every time.

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

[0.1.1]: https://github.com/Crackx17/dokutrak-mcp/releases/tag/v0.1.1
[0.1.0]: https://github.com/Crackx17/dokutrak-mcp/releases/tag/v0.1.0
