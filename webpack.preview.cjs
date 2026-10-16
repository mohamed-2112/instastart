const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = {
  ...require('./webpack.renderer.cjs'),
  entry: './src/ui/main.tsx',
  output: { path: path.resolve(__dirname, 'ui-dist'), filename: 'app.js', clean: true },
  plugins: [new HtmlWebpackPlugin({ template: './src/ui/index.html' })],
};
