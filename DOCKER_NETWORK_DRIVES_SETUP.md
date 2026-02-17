# 🐳 CONFIGURACIÓN DE UNIDADES DE RED EN DOCKER

## ✅ CAMBIOS REALIZADOS

### 1. **docker-compose.yml Actualizado**

Se han añadido volúmenes para montar las unidades de red en el contenedor:

```yaml
volumes:
  # GarCloud network drive (read-only)
  - type: bind
    source: //GarCloud/gabo/Windows FGB
    target: /mnt/garcloud
    read_only: true
  # Projectes network drive (read-only)
  - type: bind
    source: //gesem-dc/Datos0/Web - Marketing/Ferran Garola treballs/Projectes (ideas)
    target: /mnt/projectes
    read_only: true
```

### 2. **Base de Datos Actualizada**

Las rutas UNC se han actualizado para apuntar a las rutas montadas:

| Unidad | Ruta Original | Ruta Docker |
|--------|---------------|-------------|
| GarCloud | `\\GarCloud\gabo\Windows FGB` | `/mnt/garcloud` |
| Projectes | `\\gesem-dc\Datos0\Web - Marketing\Ferran Garola treballs\Projectes (ideas)` | `/mnt/projectes` |

---

## 🚀 PASOS PARA APLICAR LOS CAMBIOS

### Paso 1: Reiniciar Docker

```bash
# Detener el contenedor actual
docker-compose down

# Reconstruir y levantar con los nuevos volúmenes
docker-compose up -d --build
```

### Paso 2: Verificar que los Volúmenes Están Montados

```bash
# Entrar al contenedor
docker exec -it geia-geia-1 sh

# Verificar que las carpetas están montadas
ls -la /mnt/garcloud
ls -la /mnt/projectes

# Salir del contenedor
exit
```

### Paso 3: Probar la Sincronización

1. Ve a la interfaz web: **Admin → Unidades de Red**
2. Haz clic en **"Sincronizar"** en cualquiera de las dos unidades
3. Observa los logs en la consola del navegador (F12)
4. Verifica que no hay errores de acceso a archivos

---

## 🔍 VERIFICACIÓN DE LOGS

Durante la sincronización, deberías ver en los logs:

```
[Sync] Starting sync for drive: GarCloud
[Sync] Found X files in /mnt/garcloud
[OCR] PDF text too short, applying OCR...
[LLM Analysis] Analyzing document: example.pdf
✅ Cache hit for chunk 1
[Duplicate Detection] Found 0 similar files
[Sync] Completed: X files processed
```

---

## ⚠️ SOLUCIÓN DE PROBLEMAS

### Error: "Cannot access /mnt/garcloud"

**Causa:** Docker no puede acceder a la unidad de red

**Soluciones:**

1. **Verificar que estás conectado a la VPN/red corporativa**
2. **Verificar credenciales de red en Windows:**
   ```powershell
   # Verificar que puedes acceder desde PowerShell
   dir "\\GarCloud\gabo\Windows FGB"
   dir "\\gesem-dc\Datos0\Web - Marketing\Ferran Garola treballs\Projectes (ideas)"
   ```

3. **Docker Desktop debe tener acceso a las credenciales:**
   - Abre Docker Desktop
   - Settings → Resources → File Sharing
   - Añade las rutas de red si es necesario

4. **Alternativa: Mapear unidades de red en Windows primero**
   ```powershell
   # Mapear como unidad Z:
   net use Z: "\\GarCloud\gabo\Windows FGB" /persistent:yes
   
   # Luego en docker-compose.yml usar:
   # source: Z:/
   # target: /mnt/garcloud
   ```

### Error: "Permission denied"

**Causa:** El contenedor no tiene permisos de lectura

**Solución:**
- Verifica que el usuario de Docker tiene permisos de lectura en las carpetas de red
- Intenta quitar `read_only: true` temporalmente para probar

---

## 📊 ESTADO ACTUAL

### Unidades de Red Configuradas:

| Nombre | Ruta Docker | Archivos | Chunks | Estado |
|--------|-------------|----------|--------|--------|
| GarCloud | `/mnt/garcloud` | 7 | 126 | ✅ Configurado |
| Projectes | `/mnt/projectes` | 5 | 28 | ✅ Configurado |

### Mejoras Activas:

- ✅ M1: text-embedding-3-large
- ✅ M2: OCR automático para PDFs escaneados
- ✅ M3: Análisis LLM de documentos
- ✅ M4: Chunking semántico con LangChain
- ✅ M5: Caché de embeddings
- ✅ M6: Detección de duplicados inteligente

---

## 🎯 PRÓXIMOS PASOS

1. **Reiniciar Docker** con los comandos del Paso 1
2. **Verificar montaje** con los comandos del Paso 2
3. **Sincronizar unidades** desde la interfaz web
4. **Verificar metadata** en la base de datos:

```sql
SELECT 
  filename,
  doc_type,
  doc_importance,
  doc_department,
  doc_summary,
  analyzed_at
FROM network_files
WHERE analyzed_at IS NOT NULL
ORDER BY analyzed_at DESC
LIMIT 10;
```

---

## ✅ CHECKLIST

- [x] docker-compose.yml actualizado con volúmenes
- [x] Base de datos actualizada con rutas Docker
- [ ] Docker reiniciado
- [ ] Volúmenes verificados
- [ ] Sincronización probada
- [ ] Metadata verificada

---

**¡Todo listo para reiniciar Docker y probar las mejoras!** 🚀

