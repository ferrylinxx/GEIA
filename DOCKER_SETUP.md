# 🐳 CONFIGURACIÓN DE DOCKER - GEIA v2.6.0

## 📋 Requisitos Previos

- Docker Desktop instalado
- Acceso a las unidades de red corporativas
- Claves de API de OpenAI, Supabase y Tavily

---

## 🚀 CONFIGURACIÓN INICIAL

### Paso 1: Copiar Archivos de Ejemplo

```bash
# Copiar Dockerfile de ejemplo
cp Dockerfile.example Dockerfile

# Copiar docker-compose.yml de ejemplo
cp docker-compose.yml.example docker-compose.yml
```

### Paso 2: Configurar Dockerfile

Edita `Dockerfile` y reemplaza los placeholders con tus claves reales:

```dockerfile
ENV NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY="tu_anon_key_aqui"
ENV SUPABASE_SERVICE_ROLE_KEY="tu_service_role_key_aqui"
ENV OPENAI_API_KEY="sk-proj-tu_openai_key_aqui"
ENV TAVILY_API_KEY="tvly-tu_tavily_key_aqui"
```

### Paso 3: Configurar docker-compose.yml

Edita `docker-compose.yml` y actualiza las rutas de las unidades de red:

```yaml
volumes:
  # Ejemplo para Windows
  - type: bind
    source: //TuServidor/TuCarpeta1
    target: /mnt/garcloud
    read_only: true
  - type: bind
    source: //TuServidor/TuCarpeta2
    target: /mnt/projectes
    read_only: true
```

### Paso 4: Actualizar Rutas en Supabase

Después de configurar los volúmenes, actualiza las rutas en la base de datos:

```sql
UPDATE network_drives 
SET unc_path = '/mnt/garcloud' 
WHERE name = 'GarCloud';

UPDATE network_drives 
SET unc_path = '/mnt/projectes' 
WHERE name = 'Projectes';
```

---

## 🏗️ CONSTRUCCIÓN Y DESPLIEGUE

### Opción 1: Construcción Local

```bash
# Construir la imagen
docker build -t geia:2.6.0 .

# Levantar el contenedor
docker-compose up -d

# Ver logs
docker-compose logs -f
```

### Opción 2: Usar Imagen de Docker Hub

```bash
# Descargar imagen
docker pull gabo9803/gia:2.6.0

# Actualizar docker-compose.yml
# image: gabo9803/gia:2.6.0

# Levantar el contenedor
docker-compose up -d
```

---

## 🔍 VERIFICACIÓN

### Verificar que los Volúmenes Están Montados

```bash
# Entrar al contenedor
docker exec -it geia-geia-1 sh

# Verificar carpetas montadas
ls -la /mnt/garcloud
ls -la /mnt/projectes

# Salir
exit
```

### Verificar Variables de Entorno

```bash
# Ver variables de entorno
docker exec geia-geia-1 env | grep -E "OPENAI|SUPABASE|TAVILY"
```

---

## 🛠️ COMANDOS ÚTILES

```bash
# Detener contenedor
docker-compose down

# Reconstruir y levantar
docker-compose up -d --build

# Ver logs en tiempo real
docker-compose logs -f

# Reiniciar contenedor
docker-compose restart

# Eliminar todo (contenedor, volúmenes, imágenes)
docker-compose down -v --rmi all
```

---

## ⚠️ SEGURIDAD

### ¡IMPORTANTE!

- **NUNCA** subas `Dockerfile` o `docker-compose.yml` con claves reales a Git
- Estos archivos están en `.gitignore` para proteger tus claves
- Solo los archivos `.example` se suben al repositorio
- Mantén tus claves de API seguras y rotadas regularmente

### Archivos Ignorados por Git

```
Dockerfile              # ✅ Ignorado (contiene claves reales)
docker-compose.yml      # ✅ Ignorado (contiene rutas reales)
.env.local              # ✅ Ignorado (contiene claves reales)
```

### Archivos en el Repositorio

```
Dockerfile.example          # ✅ Template sin claves
docker-compose.yml.example  # ✅ Template sin rutas reales
.env.example                # ✅ Template sin claves
```

---

## 📊 ESTRUCTURA DE VOLÚMENES

```
/mnt/garcloud/          # Unidad de red 1 (read-only)
  ├── documento1.pdf
  ├── documento2.docx
  └── ...

/mnt/projectes/         # Unidad de red 2 (read-only)
  ├── proyecto1.pdf
  ├── proyecto2.xlsx
  └── ...
```

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### Error: "Cannot access /mnt/garcloud"

**Solución:**
1. Verifica que estás conectado a la VPN/red corporativa
2. Verifica que puedes acceder desde PowerShell:
   ```powershell
   dir "\\TuServidor\TuCarpeta"
   ```
3. Verifica que Docker Desktop tiene acceso a recursos de red

### Error: "Permission denied"

**Solución:**
1. Verifica permisos de lectura en las carpetas de red
2. Intenta quitar `read_only: true` temporalmente
3. Verifica que el usuario de Docker tiene acceso

### Error: "API key invalid"

**Solución:**
1. Verifica que copiaste las claves correctamente en `Dockerfile`
2. Reconstruye la imagen: `docker-compose up -d --build`
3. Verifica las variables de entorno: `docker exec geia-geia-1 env`

---

## 📚 DOCUMENTACIÓN ADICIONAL

- [DOCKER_NETWORK_DRIVES_SETUP.md](./DOCKER_NETWORK_DRIVES_SETUP.md) - Configuración de unidades de red
- [MEJORAS_NETWORK_DRIVES.md](./MEJORAS_NETWORK_DRIVES.md) - Mejoras implementadas v2.6.0
- [README.md](./README.md) - Documentación general del proyecto

---

**¡Listo para usar GEIA v2.6.0 con Docker!** 🚀

