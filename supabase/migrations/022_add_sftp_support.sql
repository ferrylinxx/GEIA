-- ============================================
-- ADD SFTP SUPPORT TO NETWORK DRIVES
-- Permite usar SFTP en lugar de SMB para acceder a unidades de red
-- ============================================

-- Add SFTP configuration columns
ALTER TABLE public.network_drives
  ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'smb' CHECK (connection_type IN ('smb', 'sftp')),
  ADD COLUMN IF NOT EXISTS sftp_host TEXT,
  ADD COLUMN IF NOT EXISTS sftp_port INT DEFAULT 22,
  ADD COLUMN IF NOT EXISTS sftp_username TEXT,
  ADD COLUMN IF NOT EXISTS sftp_password TEXT; -- Será encriptado en el futuro

-- Add comments
COMMENT ON COLUMN public.network_drives.connection_type IS 'Tipo de conexión: smb (local) o sftp (remoto)';
COMMENT ON COLUMN public.network_drives.sftp_host IS 'Host del servidor SFTP (ej: nas.ejemplo.com o IP)';
COMMENT ON COLUMN public.network_drives.sftp_port IS 'Puerto SFTP (por defecto 22)';
COMMENT ON COLUMN public.network_drives.sftp_username IS 'Usuario para autenticación SFTP';
COMMENT ON COLUMN public.network_drives.sftp_password IS 'Contraseña SFTP (TODO: encriptar)';

-- Update existing drives to use SMB by default
UPDATE public.network_drives 
SET connection_type = 'smb' 
WHERE connection_type IS NULL;

