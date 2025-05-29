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
  "createIssue",
  "Creates a new issue in Jira.",
  {
    domain: z.string().describe("The domain of the Jira instance"),
    projectKey: z.string().describe("The key of the project"),
    summary: z.string().describe("The summary/title of the issue"),
    description: z.string().optional().describe("The detailed description of the issue (optional, uses ADF format)"),
    issueType: z.string().describe("The name of the issue type (e.g., 'Bug', 'Task')"),
  },
  async ({ domain, projectKey, summary, description, issueType }) => {
    const requestBody: any = {
      fields: {
        project: {
          key: projectKey,
        },
        summary: summary,
        issuetype: {
          name: issueType,
        },
      },
    };

    if (description) {
      try {
        // Attempt to parse the description string as JSON (ADF)
        requestBody.fields.description = JSON.parse(description);
      } catch (e: any) {
        // If parsing fails, return an error to the user
        console.error("Error parsing ADF description:", e.message);
        return { 
          content: [{ 
            type: 'text', 
            text: `Invalid ADF JSON provided for description: ${e.message}` 
          }] 
        };
      }
    }

    const response = await fetch(`https://${domain}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error creating issue: ${response.status} ${response.statusText}`, errorText);
      return { content: [{ type: 'text', text: `Error creating issue: ${response.statusText}. Details: ${errorText}` }] };
    }

    const responseData = await response.json() as { key: string, self: string };
    return {
      content: [
        {
          type: 'text',
          text: `Successfully created issue ${responseData.key}. URL: ${responseData.self}`,
        },
      ],
    };
  }
);

server.tool(
  "getAllUsers",
  "Retrieves a list of all users in Jira, with pagination.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    startAt: z.number().optional().default(0).describe("The index of the first user to return (for pagination). Defaults to 0."),
    maxResults: z.number().optional().default(50).describe("The maximum number of users to return per page. Defaults to 50."),
  },
  async ({ domain, startAt, maxResults }) => {
    const params = new URLSearchParams();
    params.append('startAt', startAt.toString());
    params.append('maxResults', maxResults.toString());
    
    const apiUrl = `https://${domain}/rest/api/3/users/search?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving all users: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error retrieving all users: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/users/search should return 200 OK with an array of user objects
    if (response.status === 200) {
      const usersData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(usersData, null, 2), // Return the users data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Retrieving all users resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUserGroups",
  "Retrieves the groups a user belongs to in Jira using their account ID.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    accountId: z.string().describe("The account ID of the user whose groups are to be retrieved."),
  },
  async ({ domain, accountId }) => {
    const params = new URLSearchParams({ accountId });
    const apiUrl = `https://${domain}/rest/api/3/user/groups?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving groups for user ${accountId}: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error retrieving groups for user ${accountId}: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/user/groups should return 200 OK with an array of group objects
    if (response.status === 200) {
      const groupsData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(groupsData, null, 2), // Return the groups data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Group retrieval for user ${accountId} resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUserEmailBulk",
  "Retrieves email addresses for multiple Jira users by their account IDs. Note: Access to this API may be restricted by Atlassian for Connect/Forge apps.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    accountIds: z.array(z.string()).min(1).describe("An array of account IDs for whom to retrieve email addresses. Must contain at least one ID."),
  },
  async ({ domain, accountIds }) => {
    const params = new URLSearchParams();
    accountIds.forEach(id => params.append('accountId', id));
    
    const apiUrl = `https://${domain}/rest/api/3/user/email/bulk?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving bulk emails: ${response.status} ${response.statusText}`, errorText);
      let userMessage = `Error retrieving bulk emails: ${response.statusText}. Status: ${response.status}. Details: ${errorText}`;
      
      if (response.status === 403) {
        userMessage += " Note: A 403 Forbidden error for this API can indicate that the app has not been approved by Atlassian to access email addresses, or specific app permissions are missing.";
      }
      
      return { 
        content: [{ 
          type: 'text', 
          text: userMessage 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/user/email/bulk should return 200 OK with user email data
    if (response.status === 200) {
      const emailBulkData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(emailBulkData, null, 2), // Return the email data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Bulk email retrieval resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUserEmail",
  "Retrieves a user's email address from Jira using their account ID. Note: Access to this API may be restricted by Atlassian for Connect/Forge apps.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    accountId: z.string().describe("The account ID of the user whose email is to be retrieved."),
  },
  async ({ domain, accountId }) => {
    const params = new URLSearchParams({ accountId });
    const apiUrl = `https://${domain}/rest/api/3/user/email?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving email for user ${accountId}: ${response.status} ${response.statusText}`, errorText);
      let userMessage = `Error retrieving email for user ${accountId}: ${response.statusText}. Status: ${response.status}. Details: ${errorText}`;
      
      if (response.status === 403) {
        userMessage += " Note: A 403 Forbidden error for this API can indicate that the app has not been approved by Atlassian to access email addresses, or specific app permissions are missing.";
      }
      
      return { 
        content: [{ 
          type: 'text', 
          text: userMessage 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/user/email should return 200 OK with user email data
    if (response.status === 200) {
      const emailData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(emailData, null, 2), // Return the email data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Email retrieval for user ${accountId} resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getAccountIdsForUsers",
  "Retrieves account IDs for users by their usernames and/or user keys.",
  z.object({
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    usernames: z.array(z.string()).optional().describe("An array of usernames to resolve."),
    keys: z.array(z.string()).optional().describe("An array of user keys to resolve."),
    startAt: z.number().optional().default(0).describe("The index of the first item to return (for pagination). Defaults to 0."),
    maxResults: z.number().optional().default(50).describe("The maximum number of items to return per page. Defaults to 50, max is 1000."),
  }).refine(data => (data.usernames && data.usernames.length > 0) || (data.keys && data.keys.length > 0), {
    message: "Either 'usernames' or 'keys' must be provided and be a non-empty array.",
  }),
  async ({ domain, usernames, keys, startAt, maxResults }) => {
    const params = new URLSearchParams();
    
    if (usernames) {
      usernames.forEach(username => params.append('username', username));
    }
    if (keys) {
      keys.forEach(key => params.append('key', key));
    }
    
    params.append('startAt', startAt!.toString()); // Non-null assertion due to default
    params.append('maxResults', maxResults!.toString()); // Non-null assertion due to default
    
    const apiUrl = `https://${domain}/rest/api/3/user/bulk/migration?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving account IDs: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error retrieving account IDs: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/user/bulk/migration should return 200 OK with user data
    if (response.status === 200) {
      const accountIdData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(accountIdData, null, 2), // Return the data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Account ID retrieval resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUsersBulk",
  "Retrieves a list of users from Jira by their account IDs, with pagination.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    accountIds: z.array(z.string()).min(1).describe("An array of account IDs of the users to retrieve. Must contain at least one ID."),
    startAt: z.number().optional().default(0).describe("The index of the first user to return (for pagination). Defaults to 0."),
    maxResults: z.number().optional().default(50).describe("The maximum number of users to return per page. Defaults to 50, max is 1000."),
  },
  async ({ domain, accountIds, startAt, maxResults }) => {
    const params = new URLSearchParams();
    accountIds.forEach(id => params.append('accountId', id));
    params.append('startAt', startAt.toString());
    params.append('maxResults', maxResults.toString());
    
    const apiUrl = `https://${domain}/rest/api/3/user/bulk?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving bulk users: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error retrieving bulk users: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/user/bulk should return 200 OK with user data
    if (response.status === 200) {
      const usersData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(usersData, null, 2), // Return the user data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `Bulk user retrieval resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "getUser",
  "Retrieves user details from Jira using their account ID.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    accountId: z.string().describe("The account ID of the user to retrieve."),
    expand: z.string().optional().describe("A comma-separated list of entities to expand in the response (e.g., 'groups,applicationRoles')."),
  },
  async ({ domain, accountId, expand }) => {
    const params = new URLSearchParams({ accountId });
    if (expand) {
      params.append('expand', expand);
    }
    
    const apiUrl = `https://${domain}/rest/api/3/user?${params.toString()}`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error retrieving user ${accountId}: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error retrieving user ${accountId}: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful GET to Jira /rest/api/3/user should return 200 OK with user data
    if (response.status === 200) {
      const userData = await response.json();
      return {
        content: [
          {
            type: 'text', // Or 'json' if the MCP client can handle it directly
            text: JSON.stringify(userData, null, 2), // Return the user data as a formatted JSON string
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 200 is standard.
      const unexpectedResponseText = await response.text();
      return {
        content: [
          {
            type: 'text',
            text: `User retrieval for ${accountId} resulted in an unexpected status: ${response.status}. Response: ${unexpectedResponseText}`,
          },
        ],
      };
    }
  }
);

server.tool(
  "assignIssue",
  "Assigns or unassigns an issue to a user in Jira. Use null for accountId to unassign.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    issueIdOrKey: z.string().describe("The ID or key of the issue to be assigned (e.g., 'PROJ-123')"),
    accountId: z.string().nullable().describe("The account ID of the user to assign the issue to. Use null to unassign the issue. Use '-1' to assign to the default user."),
  },
  async ({ domain, issueIdOrKey, accountId }) => {
    const apiUrl = `https://${domain}/rest/api/3/issue/${issueIdOrKey}/assignee`;
    
    const requestBody = {
      accountId: accountId,
    };

    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        ...headers, // Standard headers include Authorization and Accept
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error assigning issue ${issueIdOrKey}: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error assigning issue ${issueIdOrKey}: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful PUT to Jira /issue/{issueIdOrKey}/assignee usually returns 204 No Content
    if (response.status === 204) {
      let successMessage = `Issue ${issueIdOrKey} in domain ${domain} was successfully updated.`;
      if (accountId === null) {
        successMessage = `Issue ${issueIdOrKey} in domain ${domain} was successfully unassigned.`;
      } else if (accountId === "-1") {
        successMessage = `Issue ${issueIdOrKey} in domain ${domain} was successfully assigned to the default user.`;
      } else {
        successMessage = `Issue ${issueIdOrKey} in domain ${domain} was successfully assigned to user ${accountId}.`;
      }
      return {
        content: [
          {
            type: 'text',
            text: successMessage,
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 204 is standard.
      return {
        content: [
          {
            type: 'text',
            text: `Issue ${issueIdOrKey} assignment updated in domain ${domain}. Status: ${response.status}.`,
          },
        ],
      };
    }
  }
);

server.tool(
  "deleteIssue",
  "Deletes an issue from Jira. Optionally, subtasks can also be deleted.",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    issueIdOrKey: z.string().describe("The ID or key of the issue to be deleted (e.g., 'PROJ-123')"),
    deleteSubtasks: z.boolean().optional().default(false).describe("If true, subtasks of the issue will also be deleted. Defaults to false."),
  },
  async ({ domain, issueIdOrKey, deleteSubtasks }) => {
    let apiUrl = `https://${domain}/rest/api/3/issue/${issueIdOrKey}`;
    if (deleteSubtasks) {
      apiUrl += "?deleteSubtasks=true";
    }

    const response = await fetch(apiUrl, {
      method: "DELETE",
      headers: headers, // Standard headers include Authorization and Accept
    });

    if (!response.ok) {
      // Catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error deleting issue ${issueIdOrKey}: ${response.status} ${response.statusText}`, errorText);
      let userMessage = `Error deleting issue ${issueIdOrKey}: ${response.statusText}. Status: ${response.status}.`;
      if (errorText) {
        userMessage += ` Details: ${errorText}`;
      }
      // Specific check for 400 when subtasks exist and deleteSubtasks=false
      if (response.status === 400 && errorText.includes("Cannot delete an issue that has subtasks without specifying deleteSubtasks=true")) {
        userMessage = `Error deleting issue ${issueIdOrKey}: This issue has subtasks. To delete it, set the 'deleteSubtasks' parameter to true.`;
      }
      return { 
        content: [{ 
          type: 'text', 
          text: userMessage 
        }] 
      };
    }
    
    // Successful DELETE to Jira /issue/{issueIdOrKey} usually returns 204 No Content
    if (response.status === 204) {
      return {
        content: [
          {
            type: 'text',
            text: `Issue ${issueIdOrKey} in domain ${domain} was successfully deleted.${deleteSubtasks ? ' Subtasks were also deleted.' : ''}`,
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 204 is standard.
      // For now, any other 2xx status that is 'ok' but not 204 will just indicate success.
      return {
        content: [
          {
            type: 'text',
            text: `Issue ${issueIdOrKey} in domain ${domain} deleted. Status: ${response.status}.${deleteSubtasks ? ' Subtasks were also deleted.' : ''}`,
          },
        ],
      };
    }
  }
);

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
  "getIssue",
  "Returns the details for an issue",
  {
    domain: z.string().describe("The domain of the workspace"),
    issueKey: z.string().describe("The issue key"),
  },
  async ({domain, issueKey}) => {
    const response = await fetch(`https://${domain}/rest/api/3/issue/${issueKey}`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      console.error(`Error: ${response.statusText} ${response.status})`);
      return { content: [{ type: 'text', text: `${response.statusText}` }] };
    }
    const data = JSON.stringify(await response.json(), null, 2);
    return {
      content: [
        {
          type: 'text',
          text: `The details for an issue from domain ${domain}: ${data}`,
        }
      ]
    };
  }
);

server.tool(
  "get_comments",
  "Returns all comments for an issue",
  {
    domain: z.string().describe("The domain of the workspace"),
    issueKey: z.string().describe("The issue key"),
  },
  async ({domain, issueKey}) => {
    const response = await fetch(`https://${domain}/rest/api/3/issue/${issueKey}/comment`, {
      method: "GET",
      headers: headers,
    });
    if (!response.ok) {
      console.error(`Error: ${response.statusText} ${response.status})`);
      return { content: [{ type: 'text', text: `${response.statusText}` }] };
    }
    const data = JSON.stringify(await response.json(), null, 2);
    return {
      content: [
        {
          type: 'text',
          text: `All comments for an issue ${domain}: ${data}`,
        }
      ]
    };
  }
);

server.tool(
  "add_comment",
  "Adds a comment to an issue",
  {
    domain: z.string().describe("The domain of the workspace"),
    issueKey: z.string().describe("The issue key"),
    comment: z.string().describe("The comment to add"),
  },
  async ({domain, issueKey, comment}) => {
    const response = await fetch(`https://${domain}/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST",
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: {
          "content": [
            { "content": [
                {"text": comment, "type": "text"}
              ],
              "type": "paragraph",
            }
          ],
          "type": "doc",
          "version": 1,
        }
      }),
    });
    if (!response.ok) {
      console.error(`Error: ${response.statusText} ${response.status})`);
      return { content: [{ type: 'text', text: `${response.statusText}` }] };
    }
        
    return {
      content: [
        {
          type: 'text',
          text: `Added comment to issue ${issueKey} in domain ${domain}`,
        }
      ]
    };
  }
);

server.tool(
  "editIssue",
  "Edits an existing issue in Jira. You can update various fields of an issue. For the 'description' field, ensure it is in Atlassian Document Format (ADF).",
  {
    domain: z.string().describe("The domain of the Jira instance (e.g., 'your-domain.atlassian.net')"),
    issueIdOrKey: z.string().describe("The ID or key of the issue to be edited (e.g., 'PROJ-123')"),
    fieldsToUpdate: z.record(z.string(), z.any()).describe("A JSON object containing the fields to update. For example: {\"summary\": \"New summary\", \"description\": {\"type\": \"doc\", \"version\": 1, \"content\": [{\"type\": \"paragraph\", \"content\": [{\"type\": \"text\", \"text\": \"New description.\"}]}]}}")
  },
  async ({ domain, issueIdOrKey, fieldsToUpdate }) => {
    const requestBody = {
      fields: fieldsToUpdate,
    };

    const response = await fetch(`https://${domain}/rest/api/3/issue/${issueIdOrKey}`, {
      method: "PUT",
      headers: {
        ...headers, // Includes Authorization and Accept
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // Jira typically returns 204 No Content on successful PUT, but other 2xx codes might be possible if specific query params are used.
      // We check for !response.ok to catch any non-2xx status.
      const errorText = await response.text();
      console.error(`Error editing issue ${issueIdOrKey}: ${response.status} ${response.statusText}`, errorText);
      return { 
        content: [{ 
          type: 'text', 
          text: `Error editing issue ${issueIdOrKey}: ${response.statusText}. Status: ${response.status}. Details: ${errorText}` 
        }] 
      };
    }
    
    // Successful PUT to Jira /issue/{issueIdOrKey} usually returns 204 No Content
    // If it's 204, response.json() would fail, so we directly return a success message.
    // If Jira's API behavior changes or if a specific query parameter like 'returnRepresentations=true' was used (not the case here),
    // it might return a body. For now, we assume 204 is the primary success indicator without a body.
    if (response.status === 204) {
      return {
        content: [
          {
            type: 'text',
            text: `Issue ${issueIdOrKey} in domain ${domain} was successfully updated.`,
          },
        ],
      };
    } else {
      // Handle other potential success codes if necessary, though 204 is standard for this PUT.
      // For now, any other 2xx status that is 'ok' but not 204 will just indicate success.
      // If there was a body, response.json() could be used here.
      return {
        content: [
          {
            type: 'text',
            text: `Issue ${issueIdOrKey} in domain ${domain} updated. Status: ${response.status}.`,
          },
        ],
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);