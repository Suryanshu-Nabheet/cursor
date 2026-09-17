const path = require('path')
const webpack = require('webpack')
const rules = require('./webpack.rules')

// Renderer must not use native-module relocators (those are main-only)
const rendererRules = rules.filter((rule) => {
    if (rule.use && typeof rule.use === 'object' && rule.use.loader) {
        return (
            !rule.use.loader.includes(
                '@vercel/webpack-asset-relocator-loader'
            ) && !rule.use.loader.includes('node-loader')
        )
    }
    if (rule.use === 'node-loader') return false
    return true
})

rendererRules.push({
    test: /\.css$/,
    use: [
        { loader: 'style-loader' },
        { loader: 'css-loader' },
        {
            loader: 'postcss-loader',
            options: {
                postcssOptions: {
                    plugins: [require('tailwindcss'), require('autoprefixer')],
                },
            },
        },
    ],
})

module.exports = {
    // Inject connector singleton into renderer modules
    plugins: [
        new webpack.ProvidePlugin({
            connector: [
                path.resolve(__dirname, 'src/connector.ts'),
                'connector',
            ],
        }),
    ],
    module: {
        rules: rendererRules,
    },
    cache: {
        type: 'filesystem',
    },
    externals: 'node-pty',
    node: {
        __dirname: true,
    },
    resolve: {
        extensions: ['.js', '.ts', '.jsx', '.tsx'],
    },
}
