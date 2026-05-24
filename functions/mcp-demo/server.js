// server.js
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport }    from "@modelcontextprotocol/sdk/server/stdio.js";
import { z }                       from "zod";

// 1. Create the MCP server instance
const server = new McpServer({
  name:    "demo-server",
  version: "1.0.0"
});

// 2. Expose a greeting resource: greeting://{name}
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [{ uri: uri.href, text: `👋 Hello, ${name}!` }]
  })
);

// 3. Expose a simple addition tool
server.tool(
  "add",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => ({
    content: [{ type: "text", text: String(a + b) }]
  })
);

// 4. Start listening on stdin/stdout
const transport = new StdioServerTransport();
await server.connect(transport);
