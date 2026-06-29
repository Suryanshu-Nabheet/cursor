const ts = require('typescript')

module.exports = {
    process(sourceText, sourcePath) {
        const result = ts.transpileModule(sourceText, {
            compilerOptions: {
                esModuleInterop: true,
                jsx: ts.JsxEmit.ReactJSX,
                module: ts.ModuleKind.CommonJS,
                moduleResolution: ts.ModuleResolutionKind.NodeJs,
                target: ts.ScriptTarget.ES2019,
            },
            fileName: sourcePath,
        })

        return { code: result.outputText }
    },
}
