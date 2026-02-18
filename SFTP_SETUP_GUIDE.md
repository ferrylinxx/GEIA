# 📘 Guía de Configuración SFTP para Synology NAS

Esta guía te ayudará a configurar tu Synology NAS para que sea accesible desde Vercel mediante SFTP.

---

## 🎯 Objetivo

Permitir que GEIA (desplegado en Vercel) acceda a los archivos de tu Synology NAS mediante SFTP para indexarlos y hacerlos buscables.

---

## ⚠️ Problema Actual

El error `Timed out while waiting for handshake` indica que Vercel **NO puede conectarse** a tu NAS. Las causas más comunes son:

1. **IP Local**: Si configuraste una IP local (192.168.x.x), Vercel no puede acceder porque está en la nube
2. **Puerto Bloqueado**: El puerto 22 (SFTP) no está abierto en tu router
3. **Firewall**: El firewall del NAS o router está bloqueando la conexión
4. **Credenciales Incorrectas**: Usuario o contraseña incorrectos

---

## 🔧 Solución: Configurar Acceso Remoto

### **Paso 1: Habilitar SFTP en Synology**

1. Abre **DSM** (DiskStation Manager) de tu Synology
2. Ve a **Panel de Control** → **Terminal & SNMP**
3. En la pestaña **Terminal**:
   - ✅ Marca **"Habilitar servicio SSH"**
   - Puerto: **22** (por defecto) o cambia si prefieres
   - Haz clic en **Aplicar**

### **Paso 2: Crear Usuario para SFTP**

1. Ve a **Panel de Control** → **Usuario**
2. Haz clic en **Crear** → **Crear usuario**
3. Configura:
   - **Nombre**: `geia-sftp` (o el que prefieras)
   - **Contraseña**: Una contraseña segura
   - **Permisos**: Solo lectura en las carpetas que quieres indexar
4. En **Aplicaciones**:
   - ✅ Desmarca todo excepto **"Permitir acceso SSH"**
5. Guarda el usuario

### **Paso 3: Exponer el NAS a Internet**

Tienes **3 opciones**:

#### **Opción A: DDNS de Synology (Recomendado)**

1. Ve a **Panel de Control** → **Acceso Externo** → **DDNS**
2. Haz clic en **Agregar**
3. Selecciona **Synology** como proveedor
4. Elige un nombre: `tunas.synology.me` (ejemplo)
5. Guarda

Ahora tu NAS será accesible en: `tunas.synology.me`

#### **Opción B: Port Forwarding Manual**

1. Accede a tu **router** (ej: 192.168.1.1)
2. Busca **Port Forwarding** o **NAT**
3. Crea una regla:
   - **Puerto Externo**: 22 (o el que configuraste)
   - **Puerto Interno**: 22
   - **IP Interna**: La IP de tu Synology (ej: 192.168.1.100)
   - **Protocolo**: TCP
4. Guarda

Ahora tu NAS será accesible en: `tu-ip-publica:22`

Para saber tu IP pública: https://www.whatismyip.com/

#### **Opción C: QuickConnect (Más Fácil pero Menos Confiable)**

1. Ve a **Panel de Control** → **QuickConnect**
2. Activa QuickConnect
3. Anota tu ID de QuickConnect

**Nota**: QuickConnect puede no funcionar bien con SFTP directo.

---

## 🧪 Probar la Configuración

### **Desde tu PC (Local)**

Abre una terminal y ejecuta:

```bash
sftp -P 22 geia-sftp@tunas.synology.me
```

O si usas IP pública:

```bash
sftp -P 22 geia-sftp@TU_IP_PUBLICA
```

Si te pide contraseña y puedes conectarte, ¡funciona! ✅

### **Desde GEIA (Vercel)**

1. Ve a **Admin → Unidades de Red**
2. Haz clic en **"Añadir unidad"**
3. Selecciona **"SFTP (Remoto)"**
4. Completa los campos:
   - **Host SFTP**: `tunas.synology.me` (o tu IP pública)
   - **Puerto SFTP**: `22`
   - **Usuario SFTP**: `geia-sftp`
   - **Contraseña SFTP**: La contraseña que configuraste
   - **Ruta Remota**: `/volume1/documentos` (ajusta según tu estructura)
5. Haz clic en **"Probar Conexión SFTP"**
6. Si aparece ✅ **"Conexión exitosa"**, ¡listo!

---

## 🔒 Seguridad

### **Recomendaciones:**

1. **Cambia el puerto SSH** de 22 a otro (ej: 2222) para evitar ataques automatizados
2. **Usa contraseñas fuertes** (mínimo 16 caracteres)
3. **Habilita 2FA** en tu cuenta de Synology
4. **Limita permisos** del usuario SFTP solo a las carpetas necesarias
5. **Considera usar claves SSH** en lugar de contraseñas (más avanzado)

### **Firewall de Synology:**

1. Ve a **Panel de Control** → **Seguridad** → **Firewall**
2. Crea una regla para permitir puerto 22 (o el que uses)
3. **Opcional**: Limita por IP (pero Vercel usa IPs dinámicas)

---

## 🐛 Solución de Problemas

### **Error: "Timed out while waiting for handshake"**

✅ **Soluciones**:
- Verifica que el host sea accesible desde internet (no 192.168.x.x)
- Asegúrate de que el puerto esté abierto en el router
- Prueba la conexión desde tu PC primero
- Revisa el firewall del NAS y router

### **Error: "Authentication failed"**

✅ **Soluciones**:
- Verifica usuario y contraseña
- Asegúrate de que el usuario tenga permisos SSH
- Revisa que la cuenta no esté bloqueada

### **Error: "Connection refused"**

✅ **Soluciones**:
- Verifica que SSH esté habilitado en el NAS
- Comprueba que el puerto sea el correcto
- Revisa el firewall

---

## 📞 Soporte

Si sigues teniendo problemas:

1. Ejecuta el **"Probar Conexión SFTP"** en GEIA
2. Copia el mensaje de error completo
3. Revisa los logs de Vercel para más detalles

---

## 🎉 ¡Listo!

Una vez configurado, podrás:
- ✅ Sincronizar archivos desde tu NAS
- ✅ Indexarlos automáticamente
- ✅ Buscarlos en el chat de GEIA
- ✅ Acceder desde cualquier lugar (Vercel)

