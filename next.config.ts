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
};

export default nextConfig;