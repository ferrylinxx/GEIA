# 🕐 Sistema Cron para Agentes IA

## 📚 Descripción

Sistema completo de programación automática de agentes IA con soporte para:
- ⏱️ **Intervalos** (cada X minutos)
- 📅 **Diario** (a una hora específica)
- 🔧 **Cron** (expresiones cron completas)

---

## 🏗️ Arquitectura

### **1. Scheduler** (`/api/agents/scheduler`)
- Busca agentes activos cuyo `next_run_at` ya pasó
- Ejecuta cada agente
- Actualiza `last_run_at` y calcula nuevo `next_run_at`
- Guarda historial de ejecuciones

### **2. Worker** (`/api/agents/scheduler/worker`)
- Polling interno que llama al scheduler cada 2 minutos
- No requiere servicios externos
- Se ejecuta en el servidor Next.js

### **3. Cron Parser**
- Usa librería `cron-parser` para expresiones cron
- Timezone: `Europe/Madrid`
- Soporta expresiones estándar de cron

---

## 🚀 Cómo Usar

### **Opción 1: Worker Interno (Recomendado para desarrollo)**

1. **Iniciar el worker:**
```bash
curl http://localhost:3000/api/agents/scheduler/worker
```

2. **Verificar estado:**
```bash
curl http://localhost:3000/api/agents/scheduler/worker
```

3. **Detener el worker:**
```bash
curl -X POST http://localhost:3000/api/agents/scheduler/worker
```

### **Opción 2: Cron Externo (Recomendado para producción)**

Configura un servicio externo para llamar al scheduler cada 1-5 minutos:

**Ejemplo con cron-job.org:**
- URL: `https://tu-dominio.com/api/agents/scheduler`
- Método: GET
- Header: `Authorization: Bearer TU_CRON_SECRET`
- Intervalo: Cada 2 minutos

**Ejemplo con GitHub Actions:**
```yaml
name: Agent Scheduler
on:
  schedule:
    - cron: '*/2 * * * *'  # Cada 2 minutos
jobs:
  run-scheduler:
    runs-on: ubuntu-latest
    steps:
      - name: Call Scheduler
        run: |
          curl -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
               https://tu-dominio.com/api/agents/scheduler
```

### **Opción 3: Vercel Cron (Solo en Vercel)**

Crea `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/agents/scheduler",
    "schedule": "*/2 * * * *"
  }]
}
```

---

## ⚙️ Configuración

### **Variables de Entorno**

Añade a `.env.local`:
```env
# Opcional: Secret para proteger el endpoint del scheduler
CRON_SECRET=tu-secret-super-seguro-aqui

# URL de tu aplicación (para el worker interno)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 📝 Tipos de Programación

### **1. Manual**
```json
{
  "schedule_type": "manual",
  "schedule_config": {}
}
```
- Solo se ejecuta manualmente desde el panel admin o chat

### **2. Intervalo**
```json
{
  "schedule_type": "interval",
  "schedule_config": {
    "interval_minutes": 60
  }
}
```
- Se ejecuta cada X minutos
- Ejemplo: `interval_minutes: 30` → cada 30 minutos

### **3. Diario**
```json
{
  "schedule_type": "daily",
  "schedule_config": {
    "time": "09:00"
  }
}
```
- Se ejecuta todos los días a la hora especificada
- Formato: `HH:MM` (24 horas)

### **4. Cron**
```json
{
  "schedule_type": "cron",
  "schedule_config": {
    "cron_expression": "0 9 * * 1-5"
  }
}
```
- Expresión cron estándar
- Ejemplos:
  - `0 9 * * *` → Todos los días a las 9:00
  - `0 9 * * 1-5` → Lunes a viernes a las 9:00
  - `*/30 * * * *` → Cada 30 minutos
  - `0 */2 * * *` → Cada 2 horas
  - `0 0 1 * *` → Primer día de cada mes a medianoche

**Formato cron:**
```
┌───────────── minuto (0 - 59)
│ ┌───────────── hora (0 - 23)
│ │ ┌───────────── día del mes (1 - 31)
│ │ │ ┌───────────── mes (1 - 12)
│ │ │ │ ┌───────────── día de la semana (0 - 6) (0 = domingo)
│ │ │ │ │
* * * * *
```

---

## 🧪 Pruebas

### **1. Crear un agente de prueba**

En el panel admin (`/admin` → Agentes IA):
1. Nombre: "Agente de Prueba Cron"
2. Objetivo: "Enviar un saludo cada 5 minutos"
3. Herramientas: ninguna
4. Programación: Intervalo → 5 minutos
5. Activar agente

### **2. Iniciar el worker**
```bash
curl http://localhost:3000/api/agents/scheduler/worker
```

### **3. Esperar 5 minutos**

### **4. Verificar ejecución**

Ve a `/admin` → Agentes IA → Historial

Deberías ver una ejecución automática del agente.

---

## 📊 Monitoreo

### **Ver logs del scheduler**

En la consola del servidor verás:
```
[AgentScheduler] Starting scheduled agent execution check...
[AgentScheduler] Found 2 agents due for execution
[AgentScheduler] Executing agent: Agente FC Barcelona (abc-123)
[AgentScheduler] ✅ Successfully executed Agente FC Barcelona. Next run: 2026-02-16T15:30:00.000Z
[AgentScheduler] Completed. 2/2 agents executed successfully
```

### **Ver logs del worker**

```
[SchedulerWorker] Running scheduler...
[SchedulerWorker] ✅ Scheduler completed. Executed: 2, Successful: 2
```

---

## 🔒 Seguridad

1. **Protege el endpoint del scheduler** con `CRON_SECRET`
2. **No expongas** el worker en producción (solo para desarrollo)
3. **Usa HTTPS** en producción
4. **Limita** el número de agentes ejecutados por run (actualmente 10)

---

## 🐛 Troubleshooting

### **El worker no ejecuta agentes**

1. Verifica que el worker esté corriendo:
```bash
curl http://localhost:3000/api/agents/scheduler/worker
```

2. Verifica que haya agentes activos con `next_run_at` en el pasado

3. Revisa los logs del servidor

### **Expresión cron inválida**

Verifica la sintaxis en: https://crontab.guru/

### **Agentes no se ejecutan a la hora correcta**

Verifica el timezone en `src/app/api/agents/scheduler/route.ts`:
```typescript
tz: 'Europe/Madrid'
```

---

## 📈 Próximas Mejoras

- [ ] Dashboard de monitoreo en tiempo real
- [ ] Notificaciones cuando un agente falla
- [ ] Retry automático en caso de error
- [ ] Límite de ejecuciones concurrentes
- [ ] Historial de ejecuciones con filtros
- [ ] Pausar/reanudar agentes sin desactivarlos

