import { dirname, extname } from 'path'
import { resolve as resolveExports } from 'resolve.exports'

interface ResolveOptions {
    rootDir: string
    basedir: string
    paths: string[]
    moduleDirectory: string[]
    browser: boolean
    extensions: string[]
    defaultResolver: any
}

let compilerSetup: any
let ts: any

function getCompilerSetup(rootDir: string) {
    const tsConfigPath =
        ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.spec.json') ||
        ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.test.json') ||
        ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.jest.json')

    if (!tsConfigPath) {
        // No tsconfig found
        const errorMessage =
            'Cannot locate a tsconfig.spec.json. Please create one at ' +
            rootDir +
            '/tsconfig.spec.json'
        throw new Error(errorMessage)
    }

    const readResult = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
    const config = ts.parseJsonConfigFileContent(
        readResult.config,
        ts.sys,
        dirname(tsConfigPath)
    )
    const compilerOptions = config.options
    const host = ts.createCompilerHost(compilerOptions, true)
    return { compilerOptions, host }
}

export default function resolver(path: string, options: ResolveOptions) {
    const ext = extname(path)
    if (
        ext === '.css' ||
        ext === '.scss' ||
        ext === '.sass' ||
        ext === '.less' ||
        ext === '.styl'
    ) {
        return require.resolve('identity-obj-proxy')
    }
    try {
        try {
            // Try to use the defaultResolver with default options
            return options.defaultResolver(path, options)
        } catch {
            return options.defaultResolver(path, {
                ...options,
                packageFilter: (pkg: any) => ({
                    ...pkg,
                    main: pkg.main || pkg.es2015 || pkg.module,
                }),
                pathFilter: (pkg: any) => {
                    if (!pkg.exports) {
                        return path
                    }

                    return resolveExports(pkg, path) || path
                },
            })
        }
    } catch (e) {
        if (
            path === 'jest-sequencer-@jest/test-sequencer' ||
            path === '@jest/test-sequencer'
        ) {
            return
        }
        ts = ts || require('typescript')
        compilerSetup = compilerSetup || getCompilerSetup(options.rootDir)
        const { compilerOptions, host } = compilerSetup
        return ts.resolveModuleName(
            path,
            options.basedir,
            compilerOptions,
            host
        ).resolvedModule.resolvedFileName
    }
}
