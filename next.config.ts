import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root — a stray lockfile in the home dir made Next infer it wrong.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
