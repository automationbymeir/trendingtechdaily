// client.js
import { Client }                from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function run() {
  // 1. Launch the child process for server.js
  const transport = new StdioClientTransport({
    command: "node",
    args:    ["server.js"],
  });

  // 2. Initialize the MCP client
  const client = new Client({
    name:    "demo-client",
    version: "1.0.0",
  });
  await client.connect(transport);

  // 3. Read the greeting resource
  const greeting = await client.readResource({
    uri: "greeting://Meir",
  });
  console.log("Greeting →", greeting.contents[0].text);

  // 4. Call the add tool
  const sum = await client.callTool({
    name:      "add",
    arguments: { a: 7, b: 5 },
  });
  console.log("Sum →", sum.content[0].text);
}

run().catch(err => console.error(err));
