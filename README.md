# fanduelapi-mcp

MCP server (stdio) for [FanDuel API](https://fanduelapi.com): FanDuel Sportsbook player props, line moves, game lines, +EV and arbitrage for Claude Desktop, Claude Code, Cursor, Codex, Windsurf, VS Code and any MCP client.

It is a small relay with no dependencies: each JSON-RPC message from your client goes to the hosted server at `https://fanduelapi.com/api/mcp` with your key, and the reply comes back on stdout. Use it when your client only speaks stdio; clients that support remote servers can use the URL directly (https://fanduelapi.com/mcp).

FanDuel API is an independent data service operated by Stunning Couches LLC. It is not affiliated with, endorsed by or sponsored by FanDuel.

## Use it

Free key, no card: https://fanduelapi.com/sign-up. Without a key the keyless tools still work.

Claude Desktop, Cursor and most clients (`claude_desktop_config.json`, `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fanduelapi": {
      "command": "npx",
      "args": ["-y", "fanduelapi-mcp"],
      "env": { "FANDUEL_API_KEY": "fd_..." }
    }
  }
}
```

Claude Code:

```bash
claude mcp add fanduelapi --env FANDUEL_API_KEY=fd_... -- npx -y fanduelapi-mcp
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.fanduelapi]
command = "npx"
args = ["-y", "fanduelapi-mcp"]
env = { FANDUEL_API_KEY = "fd_..." }
```

Then ask, for example: "Which NBA points props on FanDuel moved most in the last hour?" or "Show FanDuel prices above the fair price tonight."

## Tools

The tool list comes from the hosted server, so it stays current. On 15 November 2026 it was:

- No key: `search_docs`, `fetch_doc`, `search`, `fetch`, `get_sample_props`, `describe_signup`, `start_signup`, `finish_signup`, `get_onboarding_questions`, `send_feedback`.
- With a key: `list_props`, `line_move`, `prop_history`, `recent_changes`, `odds_board`, `game_report`, `positive_ev`, `arbitrage`, `compare_books`, `list_events`, watches, onboarding and subscription tools.

Check it with no key:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_sample_props","arguments":{"sport":"nba"}}}' | npx -y fanduelapi-mcp
```

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `FANDUEL_API_KEY` | none | Your key. Sent as `Authorization: Bearer`. |
| `FANDUEL_MCP_URL` | `https://fanduelapi.com/api/mcp` | Upstream server. |
| `FANDUEL_MCP_TIMEOUT_MS` | `60000` | Per-request timeout. |

Calls spend credits like REST calls do; see https://fanduelapi.com/credits. When a plan's month runs out, the tool result says so with a one-click link for the person; the server never buys anything.

## Tests

```bash
npm test                    # against a local fake upstream
FANDUEL_LIVE=1 npm test     # also checks the hosted server's keyless tools
```

## License

MIT
