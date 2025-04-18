import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
// "Returns either all transitions or a transition that can be performed by the user on an issue, based on the issue's status.",
// "Performs an issue transition and, if the transition has a screen, updates the fields from the transition screen.",
const JIRA_EMAIL = process.env.JIRA_EMAIL || "";
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN || "";
if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error("Please set the JIRA_EMAIL and JIRA_API_TOKEN environment variables.");
  process.exit(1);
}

// Create a new server instance
const server = new McpServer({
  name: "Jira",
  version: "1.0.0",
});
const headers = {
  'Authorization': `Basic ${Buffer.from(
    `${JIRA_EMAIL}:${JIRA_API_TOKEN}`,
  ).toString('base64')}`,
  'Accept': 'application/json'
}

server.tool(
  "getTransitions",
  "Returns either all transitions or a transition that can be performed by the user on an issue, based on the issue's status.",
  {
    domain: z.string().describe("The domain of the workspace"),
    issue: z.string().describe("The issue key"),
  },
  async ({domain, issue}) => {
    const response = await fetch(`https://${domain}/rest/api/3/issue/${issue}/transitions`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      console.error(`Error: ${response.statusText}`);
      return { content: [{ type: 'text', text: `${response.statusText}` }] };
    }
    const data = JSON.stringify(await response.json(), null, 2);
    return {
      content: [
        {
          type: 'text',
          text: `Issues for the workspace ${domain}: ${data}`,
        }
      ]
    };
  }
);

server.tool(
  "postTransitionIssue",
  "Performs an issue transition and, if the transition has a screen, updates the fields from the transition screen.",
  {
    domain: z.string().describe("The domain of the workspace"),
    issueKey: z.string().describe("The issue key"),
    transitionId: z.string().describe("The transition ID"),
  },
  async ({domain, issueKey, transitionId}) => {
    const response = await fetch(`https://${domain}/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST", 
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transition: { id: transitionId }
      }),
    });
    if (!response.ok) {
      console.error(`Error: ${response.statusText} (${response.status})`);
      return { content: [{ type: 'text', text: `${response.statusText}` }] };
    }
    return {
      content: [
        {
          type: 'text',
          text: `Transitioned issue ${issueKey} to transition ID ${transitionId} in workspace ${domain}`,
        }
      ]
    };
  }
);

server.tool(
  "getDetailIssues",
  {
    domain: z.string().describe("The domain of the workspace"),
    issue: z.string().describe("The issue key"),
  },
  async ({domain, issue}) => {
    const response = await fetch(`https://${domain}/rest/api/3/issue/${issue}`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      console.error(`Error: ${response.statusText} ${response.status}) ${JIRA_EMAIL}`);
      return { content: [{ type: 'text', text: `${response.statusText}` }] };
    }
    const data = JSON.stringify(await response.json(), null, 2);
    return {
      content: [
        {
          type: 'text',
          text: `Issues for the workspace ${domain}: ${data}`,
        }
      ]
    };
  }
);




const transport = new StdioServerTransport();
await server.connect(transport);