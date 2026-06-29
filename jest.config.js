module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testPathIgnorePatterns: ['/node_modules/', '/.webpack/', '/out/'],
    transform: {
        '^.+\\.tsx?$': '<rootDir>/jest.ts-transformer.js',
    },
}
