module.exports = {
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true, compilerOptions: { noEmit: false } },
        },
      },
      {
        test: /\.module\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              modules: { namedExport: false, localIdentName: '[name]__[local]__[hash:base64:5]' },
            },
          },
        ],
      },
    ],
  },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
};
