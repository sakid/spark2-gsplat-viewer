---
isContextNode: false
---
# Does it work?
Is voicetree setup correctly?

**Agent Analysis**: 
The MCP server is running on `127.0.0.1:3001` and responds to JSON-RPC over POST, but there are a few configuration issues:

1. **Missing Hooks**: Your `~/Library/Application Support/Voicetree/settings.json` defines hooks pointing to `./.voicetree/hooks/`, but the following files are missing in your project:
   - `on-worktree-created-blocking.sh`
   - `on-worktree-created-async.sh`
   - `on-new-node.cjs`
   *(Currently, `.voicetree/hooks/` only contains an empty `prompts` directory).*

2. **MCP Type**: The `.mcp.json` file in the project root specifies `"type": "http"`. While this works for custom POST-based MCP servers, standard MCP clients might expect `"type": "sse"` (with a GET `/sse` endpoint), which currently returns a 404.

Once the hooks are restored or removed from `settings.json`, Voicetree should be fully functional!