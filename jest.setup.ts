// Stub global fetch to prevent accidental real HTTP calls in unit tests
global.fetch = jest.fn() as typeof global.fetch;
