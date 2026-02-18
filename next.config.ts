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

  // Exclude ssh2 and ssh2-sftp-client from client bundle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle these modules on the client side
      config.resolve.alias = {
        ...config.resolve.alias,
        'ssh2': false,
        'ssh2-sftp-client': false,
      }
    }
    return config
  },

  // Mark ssh2 packages as external for server-side
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client'],
};

export default nextConfig;