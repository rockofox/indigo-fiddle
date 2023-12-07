const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './standalone.js',
  mode: 'development',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'indigo_fiddle'
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.wasm$/,
        type: "asset/inline"
      },
      {
        test: /\.in$/,
        type: "asset/inline"
      }
    ],
  },
  resolve: {
    fallback: {
      'path': require.resolve('path-browserify'),
    }
  }
  // experiments: {
  //   asyncWebAssembly: true,
  // },
};
