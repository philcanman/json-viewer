// @ts-check
const path = require('path')
const webpack = require('webpack')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  watch: true,

  // eval not work in extension background, choose another here
  // https://webpack.js.org/configuration/devtool/#devtool
  devtool: 'cheap-source-map',
  entry: {
    'content-script': './src/content-script',
  },
  output: {
    filename: '[name].js',
    path: path.resolve('chrome/dist'),
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react'],
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.tsx?/,
        use: 'ts-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.svg$/,
        type: 'asset',
      },
      {
        test: /\.properties$/,
        use: 'properties-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '...'],
    alias: {
      // One React for the whole bundle: the copy the devtools code ships with
      react$: path.resolve('src/mozilla-react.js'),
      'react-dom$': path.resolve('src/mozilla-react-dom.js'),
      Services: path.resolve('src/services'),
      // Mirrors the content/jsonview/images mapping in devtools/client/jar.mn
      'devtools/client/jsonview/images': path.resolve(
        'vendor/gecko/devtools/client/jsonview/assets/icons'
      ),
      devtools: path.resolve('vendor/gecko/devtools'),
      l10n: path.resolve('vendor/l10n'),
    },
  },
  plugins: [
    new CleanWebpackPlugin(),
    new webpack.EnvironmentPlugin({ NODE_ENV: 'development' }),
  ],
}
