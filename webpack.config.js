const path = require("path");

module.exports = {
  entry: "./src/index.ts",
  mode: "development",
  target: "web",

  devtool: "inline-source-map",
  devServer: {
    contentBase: "./dist",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    symlinks: false,
  },
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist"),
  },
};
