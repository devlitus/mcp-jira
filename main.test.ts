// Import the server instance from main.ts
// Note: Jest specific types might be preferred for mockFetch if using Jest, e.g. jest.MockedFunction<typeof fetch>
// For simplicity, using a generic jest.Mock type.
import { server } from './main'; // Ensure this path is correct

// Mocking global fetch
let mockFetch: jest.Mock<Promise<any>, [RequestInfo | URL, RequestInit | undefined]>;

beforeEach(() => {
  // Reset mocks before each test
  mockFetch = jest.fn();
  global.fetch = mockFetch as any; // Cast to any to satisfy TypeScript for global.fetch
});

// Set JIRA_EMAIL and JIRA_API_TOKEN for testing purposes
// These are used by main.ts to construct headers
process.env.JIRA_EMAIL = "test@example.com";
process.env.JIRA_API_TOKEN = "test_token";

// Helper to get the tool function from the server instance
const getToolFunction = (toolName: string) => {
  const tool = server.tools[toolName];
  if (!tool || typeof tool.fn !== 'function') {
    throw new Error(`Tool ${toolName} or its function is not defined properly on the server instance.`);
  }
  return tool.fn;
};

describe('Jira Tooling', () => {
  describe('getUser', () => {
    const getUser = getToolFunction('getUser');

    it('should retrieve user details successfully', async () => {
      const mockUserData = { accountId: '123', displayName: 'Test User', emailAddress: 'test@example.com' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUserData,
        text: async () => JSON.stringify(mockUserData), // Fallback for text()
      });

      const result = await getUser({ domain: 'test.atlassian.net', accountId: '123' });
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/user?accountId=123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic '),
            'Accept': 'application/json',
          }),
        })
      );
      expect(result.content[0].text).toEqual(JSON.stringify(mockUserData, null, 2));
    });

    it('should handle user not found (404)', async () => {
      const errorResponseJson = { message: 'User not found' };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => errorResponseJson, // For APIs that return JSON on error
        text: async () => JSON.stringify(errorResponseJson), // For text() fallback
      });

      const result = await getUser({ domain: 'test.atlassian.net', accountId: 'unknown' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.content[0].text).toContain('Error retrieving user unknown: Not Found. Status: 404.');
      expect(result.content[0].text).toContain('Details: {"message":"User not found"}');
    });

    it('should handle other API errors (e.g., 500 with non-JSON response)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error details text', // Non-JSON response
      });
      const result = await getUser({ domain: 'test.atlassian.net', accountId: '123err' });
      expect(result.content[0].text).toContain('Error retrieving user 123err: Internal Server Error. Status: 500.');
      expect(result.content[0].text).toContain('Details: Server error details text');
    });
    
    it('should handle JSON parsing error for successful response (malformed JSON)', async () => {
        mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error("Simulated Malformed JSON"); }, // Simulate JSON parse failure
        text: async () => "{malformed json", // The raw text that might have caused the error
      });
      const result = await getUser({ domain: 'test.atlassian.net', accountId: '123jsonfail' });
      expect(result.content[0].text).toContain('Error parsing JSON response for user 123jsonfail.');
      // The actual error message from new Error("Simulated Malformed JSON") will be part of the output
      expect(result.content[0].text).toContain('Details: Simulated Malformed JSON.'); 
      expect(result.content[0].text).toContain('Raw response: {malformed json');
    });
  });

  describe('findUsers', () => {
    const findUsers = getToolFunction('findUsers');

    it('should find multiple users successfully', async () => {
      const mockUsersData = [{ accountId: '1', displayName: 'User One' }, { accountId: '2', displayName: 'User Two' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUsersData,
        text: async () => JSON.stringify(mockUsersData),
      });
      const result = await findUsers({ domain: 'test.atlassian.net', query: 'User' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/user/search?query=User',
        expect.any(Object)
      );
      expect(result.content[0].text).toEqual(JSON.stringify(mockUsersData, null, 2));
    });

    it('should handle no users found (empty array)', async () => {
      const mockUsersData: any[] = [];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockUsersData,
        text: async () => JSON.stringify(mockUsersData),
      });
      const result = await findUsers({ domain: 'test.atlassian.net', query: 'NonExistentUser' });
      expect(result.content[0].text).toEqual(JSON.stringify(mockUsersData, null, 2));
    });

    it('should handle API error for invalid query (400 with JSON error)', async () => {
      const errorResponseJson = { errorMessages: ['Invalid query parameter'], errors: {} };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => errorResponseJson,
        text: async () => JSON.stringify(errorResponseJson),
      });
      const result = await findUsers({ domain: 'test.atlassian.net', query: '' });
      expect(result.content[0].text).toContain('Error finding users: Bad Request. Status: 400.');
      expect(result.content[0].text).toContain(`Details: ${JSON.stringify(errorResponseJson)}`);
    });
    
    it('should handle JSON parsing error for successful findUsers response', async () => {
        mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error("Oops Malformed JSON"); },
        text: async () => "[malformed json array string",
      });
      const result = await findUsers({ domain: 'test.atlassian.net', query: 'testquery' });
      expect(result.content[0].text).toContain('Error parsing JSON response for user search.');
      expect(result.content[0].text).toContain('Details: Oops Malformed JSON.');
      expect(result.content[0].text).toContain('Raw response: [malformed json array string');
    });
  });

  describe('getUserGroups', () => {
    const getUserGroups = getToolFunction('getUserGroups');

    it('should retrieve user groups successfully', async () => {
      const mockGroupsData = [{ name: 'group-a', self: '...url1' }, { name: 'group-b', self: '...url2' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockGroupsData,
        text: async () => JSON.stringify(mockGroupsData),
      });
      const result = await getUserGroups({ domain: 'test.atlassian.net', accountId: '123withgroups' });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/3/user/groups?accountId=123withgroups',
        expect.any(Object)
      );
      expect(result.content[0].text).toEqual(JSON.stringify(mockGroupsData, null, 2));
    });

    it('should handle user with no groups (empty array)', async () => {
      const mockGroupsData: any[] = [];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockGroupsData,
        text: async () => JSON.stringify(mockGroupsData),
      });
      const result = await getUserGroups({ domain: 'test.atlassian.net', accountId: 'userWithNoGroups' });
      expect(result.content[0].text).toEqual(JSON.stringify(mockGroupsData, null, 2));
    });

    it('should handle user not found when fetching groups (404 with text error)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'User not found plain text.', // API returns plain text for this error
      });
      const result = await getUserGroups({ domain: 'test.atlassian.net', accountId: 'unknownUserForGroups' });
      expect(result.content[0].text).toContain('Error retrieving groups for user unknownUserForGroups: Not Found. Status: 404.');
      expect(result.content[0].text).toContain('Details: User not found plain text.');
    });

    it('should handle JSON parsing error for successful getUserGroups response', async () => {
        mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error("Bad Group JSON"); },
        text: async () => "[malformed group array string",
      });
      const result = await getUserGroups({ domain: 'test.atlassian.net', accountId: '123groupjsonfail' });
      expect(result.content[0].text).toContain('Error parsing JSON response for user groups.');
      expect(result.content[0].text).toContain('Details: Bad Group JSON.');
      expect(result.content[0].text).toContain('Raw response: [malformed group array string');
    });
  });
});
