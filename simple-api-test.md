# Simple Express API Test

Create a simple Node.js Express REST API with the following features:

## Requirements

### Endpoints
1. **GET /health** - Health check endpoint
   - Returns JSON: `{ "status": "ok", "timestamp": <current_timestamp> }`
   - Always returns 200 status code

2. **POST /echo** - Echo endpoint
   - Accepts JSON request body
   - Returns the same JSON body back to the client
   - Returns 200 status code

### Error Handling
- Basic error handling middleware
- Return 404 for unknown routes
- Return 500 for server errors with error message

### Configuration
- Server runs on port 3000
- Use Express.js framework
- Include proper middleware (express.json())

### Files to Generate
1. `server.js` - Main application file with Express server
2. `package.json` - Dependencies (express only)
3. `README.md` - Setup and usage instructions

### Technical Constraints
- Use Node.js with Express
- Keep it simple - no database, no authentication
- Use ES6+ syntax where appropriate
- Include proper error handling

## Success Criteria
- Server starts without errors
- Health endpoint returns proper JSON
- Echo endpoint returns request body
- All files are created and properly structured
