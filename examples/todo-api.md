# TODO API

Build a simple RESTful API for managing TODO items.

## Description

A backend API service that allows users to create, read, update, and delete TODO items. The API should include user authentication to ensure each user can only access their own TODOs.

## Features

- **User Authentication** - JWT-based authentication system
- **CRUD Operations** - Create, read, update, and delete TODO items
- **User Isolation** - Each user can only see and manage their own TODOs
- **Database Persistence** - Store data in PostgreSQL
- **Input Validation** - Validate all incoming requests
- **Error Handling** - Proper HTTP status codes and error messages
- **API Documentation** - Clear endpoint documentation

## Technical Requirements

### Backend Framework
- Node.js with Express.js
- RESTful API design

### Database
- PostgreSQL for data storage
- Proper schema design with relationships
- Database migrations

### Authentication
- JWT tokens for authentication
- Password hashing with bcrypt
- Secure authentication endpoints

### Testing
- Unit tests for business logic
- Integration tests for API endpoints
- Test coverage of at least 80%
- Use Jest as testing framework

### API Endpoints

#### Authentication
- POST /api/auth/register - Create new user account
- POST /api/auth/login - Login and get JWT token

#### TODOs
- GET /api/todos - Get all TODOs for authenticated user
- POST /api/todos - Create new TODO
- GET /api/todos/:id - Get specific TODO
- PUT /api/todos/:id - Update TODO
- DELETE /api/todos/:id - Delete TODO

### Data Models

#### User
- id (UUID)
- email (unique, validated)
- password (hashed)
- createdAt
- updatedAt

#### TODO
- id (UUID)
- userId (foreign key)
- title (required, max 200 chars)
- description (optional)
- completed (boolean, default false)
- dueDate (optional)
- createdAt
- updatedAt

## Constraints

- Budget: $2.00
- Keep it simple and focused on core functionality
- Follow Express.js best practices
- Use proper error handling middleware
- Environment variables for configuration
