// Generated using webpack-cli https://github.com/webpack/webpack-cli

const path = require("path");

const config = {
  entry: "./src/client.ts",
  target: "node",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "client.js",
  },
  plugins: [],
  module: {
    rules: [
      {
        test: /\.(ts)$/i,
        loader: "ts-loader",
        exclude: ["/node_modules/"],
      },
    ],
  },
  resolve: {
    extensions: [".ts"],
  },
};

module.exports = () => {
  config.mode = "production";
  return config;
};
