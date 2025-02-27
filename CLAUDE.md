# node-smb2 Development Guide

## Build & Development Commands
- `npm run build` - Build TypeScript to JavaScript
- `npm run lint` - Run TSLint checks
- `npm start` - Start nodemon for development
- `node -r ts-node/register ./demo` - Run the demo directly

## Code Style Guidelines
- TypeScript with strict types where possible
- Class-based OOP approach with inheritance for protocol structures
- Promise-based API for async operations
- Error handling via try/catch with descriptive error messages
- Use BigInt (Nx) for IDs and numeric protocol values

## Naming Conventions
- PascalCase for classes and types
- camelCase for variables, methods, and properties
- Prefix private class properties with underscore (_)
- Use interfaces for defining public APIs and type contracts

## Module Structure
- Export default for primary class in each file
- Group protocol-related code in the protocol/ directory
- Separate client and server implementations
- Use relative imports with explicit file extensions