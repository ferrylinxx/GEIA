import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: 'standalone',

  // Configuración para permitir imágenes externas con <Image>
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tecnofgb.com',
        port: '', // vacío si no usas puerto específico
        pathname: '/wp-content/uploads/**', // permite cualquier archivo dentro de /wp-content/uploads/
      },
    ],
  },

  // Empty turbopack config to silence the warning
  turbopack: {},

  // Mark ssh2 packages as external for server-side
  // This prevents Turbopack from trying to bundle these Node.js-only modules
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client'],
};

export default nextConfig;