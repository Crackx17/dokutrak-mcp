# dokutrak-mcp

The open [MCP](https://modelcontextprotocol.io) connector for [DokuTrak](https://dokutrak.com):
let your agent chase the documents.

DokuTrak collects documents from your clients on your behalf: you send a request, the client
uploads through a secure link, the files are reviewed, and silent clients get reminded. This
connector puts that loop inside the agent you already work in, so "where does the Dupont file
stand?" is answered without leaving Claude.

The connector is a thin, stateless client of the DokuTrak API. It holds the Agent Connection
you give it, stores nothing on disk, keeps no cache, and duplicates no rule: what your agent may
and may not do is decided by the service, and refusals come back as tool errors with the
service's own explanation.

## Install

You need a DokuTrak workspace and an **Agent Connection**, issued from
**Settings → Connect an agent** in the DokuTrak app. That screen hands you a paste-ready
configuration with your key already in place; the instructions below are the same thing, by hand.

The key is read from the environment variable `DOKUTRAK_API_KEY`. It is never taken from the
command line.

### Claude Desktop

Open the configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server under `mcpServers` (create the object if the file is empty):

```json
{
  "mcpServers": {
    "dokutrak": {
      "command": "npx",
      "args": ["-y", "dokutrak-mcp"],
      "env": { "DOKUTRAK_API_KEY": "dk_live_…" }
    }
  }
}
```

Restart Claude Desktop. The DokuTrak tools appear in the tools menu of a new conversation.

### Claude Code

```bash
claude mcp add dokutrak -e DOKUTRAK_API_KEY=dk_live_… -- npx -y dokutrak-mcp
```

Then `/mcp` inside Claude Code lists `dokutrak` and its tools.

### claude.ai

**Not supported in this release.** claude.ai connects to remote MCP servers over HTTP with
OAuth; this connector speaks stdio with an API key, which is what a local install into Claude
Desktop or Claude Code needs. A hosted variant is a separate, later decision.

### From a clone, before the npm release

```bash
git clone https://github.com/Crackx17/dokutrak-mcp.git
cd dokutrak-mcp
npm ci && npm run build
```

Then point the client at the built file instead of `npx`:

```json
{
  "mcpServers": {
    "dokutrak": {
      "command": "node",
      "args": ["/path/to/dokutrak-mcp/dist/cli.js"],
      "env": { "DOKUTRAK_API_KEY": "dk_live_…" }
    }
  }
}
```

or, for Claude Code: `claude mcp add dokutrak -e DOKUTRAK_API_KEY=dk_live_… -- node /path/to/dokutrak-mcp/dist/cli.js`.

## Configuration

| Variable           | Required | Default                          | Meaning                                                    |
| ------------------ | -------- | -------------------------------- | ---------------------------------------------------------- |
| `DOKUTRAK_API_KEY` | yes      | —                                | The Agent Connection, from Settings → Connect an agent.    |
| `DOKUTRAK_API_URL` | no       | `https://app.dokutrak.com/api`   | Base URL of the API. Ends in `/api`; the connector adds `/v1`. |

## Tools

### `get_request`

Where a Document Request stands, in one call: status, the checklist, every collected file with
its verdict (approved, rejected with the reviewer's reason, or pending), and the reminder state.
Give a `request_id`, or a `search` term matching the title or the client's name or email. When
several requests match, the tool returns the candidates and asks for the id.

## What the connector cannot do

Approving or rejecting a document is your decision, taken in the DokuTrak dashboard. No tool
here can take it, and the service refuses it to any Agent Connection regardless of which
connector asks. The same goes for billing, workspace settings and the management of API keys.

Revoking the Agent Connection in DokuTrak takes effect on the very next call: the connector
answers with the service's 401 and nothing else.

## Development

```bash
npm ci
npm run check   # typecheck, build, tests
npm test        # tests alone
```

The tests are contract tests at the MCP seam: a real MCP client and the real server, connected
in memory through the official SDK's transport, with HTTP stubbed at `fetch` using recorded
responses. They call tools, never functions, and run with no DokuTrak account and no network.

## License

[MIT](LICENSE).
