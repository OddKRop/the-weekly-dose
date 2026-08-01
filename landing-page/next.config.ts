import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Kreves av Docker-imaget: samler server + kun nødvendige node_modules i
  // .next/standalone, slik at runner-steget slipper hele avhengighetstreet.
  output: "standalone",
};

export default nextConfig;
