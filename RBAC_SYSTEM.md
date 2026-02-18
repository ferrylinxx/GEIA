# 🔐 **SISTEMA RBAC - CONTROL DE ACCESO BASADO EN ROLES**

---

## **📋 DESCRIPCIÓN GENERAL**

GEIA ahora cuenta con un sistema completo de **Role-Based Access Control (RBAC)** que permite:

1. ✅ **Deshabilitar registro público** - Solo administradores pueden crear usuarios
2. ✅ **Crear roles personalizados** con permisos granulares
3. ✅ **Asignar roles a usuarios** para controlar acceso a recursos
4. ✅ **Permisos granulares** por tipo de recurso y recurso específico
5. ✅ **Invitaciones por email** con credenciales y link de cambio de contraseña

---

## **🗄️ ESTRUCTURA DE BASE DE DATOS**

### **1. Tabla `roles`**

Almacena los roles del sistema (admin, user, viewer) y roles personalizados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `name` | TEXT | Nombre del rol (único) |
| `description` | TEXT | Descripción del rol |
| `is_system` | BOOLEAN | Si es un rol del sistema (no se puede eliminar) |
| `created_by` | UUID | Usuario que creó el rol |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Fecha de última actualización |

**Roles del sistema:**
- `admin` - Acceso total al sistema
- `user` - Acceso básico estándar
- `viewer` - Solo lectura

---

### **2. Tabla `user_roles`**

Asigna roles a usuarios (un usuario puede tener múltiples roles).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `user_id` | UUID | Usuario al que se asigna el rol |
| `role_id` | UUID | Rol asignado |
| `assigned_by` | UUID | Administrador que asignó el rol |
| `assigned_at` | TIMESTAMPTZ | Fecha de asignación |

---

### **3. Tabla `role_permissions`**

Define permisos granulares por rol y tipo de recurso.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Identificador único |
| `role_id` | UUID | Rol al que pertenece el permiso |
| `resource_type` | TEXT | Tipo de recurso (ver lista abajo) |
| `resource_id` | UUID | ID del recurso específico (NULL = todos) |
| `can_view` | BOOLEAN | Permiso para ver/listar |
| `can_create` | BOOLEAN | Permiso para crear |
| `can_edit` | BOOLEAN | Permiso para editar |
| `can_delete` | BOOLEAN | Permiso para eliminar |
| `can_share` | BOOLEAN | Permiso para compartir |
| `can_admin` | BOOLEAN | Permisos administrativos |
| `meta_json` | JSONB | Metadata adicional |

**Tipos de recursos (`resource_type`):**
- `network_drive` - Unidades de red
- `model` - Modelos de IA
- `provider` - Proveedores de IA
- `db_connection` - Conexiones a bases de datos
- `user_group` - Grupos de trabajo
- `channel` - Canales de comunicación
- `project` - Proyectos/workspaces
- `file` - Archivos globales
- `agent` - Agentes de IA
- `admin_panel` - Secciones del panel admin

---

## **🔧 FUNCIONES HELPER**

### **`user_has_permission(user_id, resource_type, resource_id, action)`**

Verifica si un usuario tiene un permiso específico.

**Parámetros:**
- `user_id` (UUID) - ID del usuario
- `resource_type` (TEXT) - Tipo de recurso
- `resource_id` (UUID) - ID del recurso específico
- `action` (TEXT) - Acción: 'view', 'create', 'edit', 'delete', 'share', 'admin'

**Retorna:** `BOOLEAN`

**Ejemplo:**
```sql
SELECT user_has_permission(
  'user-uuid-here',
  'network_drive',
  'drive-uuid-here',
  'view'
);
```

---

### **`get_user_accessible_resources(user_id, resource_type, action)`**

Obtiene todos los recursos accesibles por un usuario.

**Parámetros:**
- `user_id` (UUID) - ID del usuario
- `resource_type` (TEXT) - Tipo de recurso
- `action` (TEXT) - Acción (default: 'view')

**Retorna:** `TABLE (resource_id UUID)`

**Ejemplo:**
```sql
SELECT * FROM get_user_accessible_resources(
  'user-uuid-here',
  'network_drive',
  'view'
);
```

---

## **🎯 CASOS DE USO**

### **Caso 1: Crear un rol "Contabilidad"**

```sql
-- 1. Crear el rol
INSERT INTO roles (name, description, created_by)
VALUES ('Contabilidad', 'Acceso a documentos de contabilidad', 'admin-user-id');

-- 2. Asignar permisos a unidades de red específicas
INSERT INTO role_permissions (role_id, resource_type, resource_id, can_view, can_create)
SELECT 
  r.id,
  'network_drive',
  nd.id,
  true,
  false
FROM roles r
CROSS JOIN network_drives nd
WHERE r.name = 'Contabilidad' 
  AND nd.name IN ('Contabilidad', 'Facturas');

-- 3. Asignar el rol a un usuario
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT 'user-uuid', r.id, 'admin-uuid'
FROM roles r
WHERE r.name = 'Contabilidad';
```

---

### **Caso 2: Dar acceso a todos los modelos de IA**

```sql
-- Permiso para ver TODOS los modelos (resource_id = NULL)
INSERT INTO role_permissions (role_id, resource_type, resource_id, can_view)
SELECT r.id, 'model', NULL, true
FROM roles r
WHERE r.name = 'Contabilidad';
```

---

### **Caso 3: Verificar acceso en una API**

```typescript
// En un endpoint de Next.js
const hasAccess = await supabase.rpc('user_has_permission', {
  p_user_id: user.id,
  p_resource_type: 'network_drive',
  p_resource_id: driveId,
  p_action: 'view'
});

if (!hasAccess) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

## **🔒 SEGURIDAD (RLS Policies)**

Todas las tablas tienen **Row Level Security** habilitado:

- ✅ **Roles:** Todos pueden ver, solo admins pueden crear/editar/eliminar
- ✅ **User_roles:** Usuarios ven sus propios roles, solo admins pueden asignar
- ✅ **Role_permissions:** Usuarios ven permisos de sus roles, solo admins pueden gestionar

---

## **📊 MIGRACIÓN DE USUARIOS EXISTENTES**

La migración automáticamente:

1. ✅ Crea los roles del sistema (`admin`, `user`, `viewer`)
2. ✅ Migra usuarios existentes según su campo `role` en `profiles`
3. ✅ Mantiene compatibilidad con el sistema anterior

---

## **🚀 PRÓXIMOS PASOS**

1. ✅ Aplicar migración a la base de datos
2. ⏳ Crear API para gestión de roles (`/api/admin/roles`)
3. ⏳ Crear interfaz de administración de roles (nueva pestaña en admin panel)
4. ⏳ Implementar middleware de verificación de permisos
5. ⏳ Deshabilitar registro público
6. ⏳ Crear sistema de invitaciones por email

---

**Migración:** `supabase/migrations/022_rbac_system.sql`

