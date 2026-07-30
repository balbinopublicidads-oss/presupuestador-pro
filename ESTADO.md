# Estado del proyecto — Presupuestador Pro

Última actualización: 30 de julio de 2026.

## Qué es

App web para que independientes argentinos (oficios, creativos, profesionales) generen presupuestos profesionales en PDF, con cuenta en la nube, aprobación del cliente por link público, seguimiento de cobros, dashboard mensual, suscripción paga vía Mercado Pago, y landing propia para captar tráfico de Meta Ads.

## Arquitectura

- **Frontend**: HTML + CSS + JS vanilla, sin build ni framework. Un archivo por página.
- **Backend**: Supabase (Postgres + Auth + Edge Functions). Proyecto: `tczjkfcfpfplzzrnpufr` (org: balbinopublicads-oss — ver panel de Supabase).
- **Pagos**: Mercado Pago Suscripciones (API `/preapproval`), credenciales de **producción** ya cargadas.
- **Analítica**: Google Analytics 4 (Measurement ID `G-MC63EQBD0Q`), con eventos `begin_checkout` y `purchase`.
- **Hosting**: Vercel, deploy automático al pushear a `main` en GitHub.
- **Repo**: https://github.com/balbinopublicidads-oss/presupuestador-pro
- **Sitio en producción**: https://presupuestador-pro.vercel.app (landing) — la app está en `/app.html`.

## Archivos clave

| Archivo | Qué es |
|---|---|
| `index.html` | Landing page de marketing (pública, sin login), con GA4 |
| `app.html` | La aplicación completa (login, dashboard, presupuestos, plan, ajustes), con GA4 |
| `presupuesto.html` | Vista pública de un presupuesto (sin login), donde el cliente aprueba o rechaza |
| `gracias.html` | Página de éxito post-pago de Mercado Pago; dispara el evento `purchase` de GA4 |
| `terminos.html` / `privacidad.html` | Páginas legales mínimas enlazadas desde el footer |
| `supabase-schema.sql` | Esquema inicial: `businesses`, `quotes`, `catalog_items` (ya ejecutado) |
| `supabase-schema-billing.sql` | Esquema de suscripciones: `subscriptions`, `founder_counter`, cron de founders (ya ejecutado) |
| `supabase-schema-reset.sql` | Reset puntual, histórico (ya ejecutado) |
| `supabase-schema-feedback.sql` | Tabla `feedback` del widget flotante (ya ejecutado) |
| `supabase-fase1-aprobacion.sql` | Migra `quotes.status` a enviado/aprobado/rechazado/vencido, agrega `work_status`, `public_token`, `notifications`, cron de vencimiento (ya ejecutado) |
| `supabase-fix-aldana-subscription.sql` | Reconciliación manual de una suscripción real, histórico (ya ejecutado) |
| `supabase/functions/create-subscription/index.ts` | Edge Function: crea la suscripción en Mercado Pago |
| `supabase/functions/mp-webhook/index.ts` | Edge Function: recibe avisos de pago de Mercado Pago |
| `supabase/functions/public-quote/index.ts` | Edge Function: sirve un presupuesto por `public_token`, sin login |
| `supabase/functions/decide-quote/index.ts` | Edge Function: registra la aprobación/rechazo del cliente |

Los `.sql` en la raíz son **migraciones históricas ya aplicadas** — quedan como registro, no hace falta volver a correrlos salvo que se arme un proyecto de Supabase nuevo desde cero.

## Cuenta de prueba

- Email: `balbinopublicidads+test@gmail.com`
- Contraseña: `test123456`
- Negocio: "Plomería Test" (ya tiene 1 presupuesto real aprobado+cobrado, y un catálogo de 8 ítems precargado de la plantilla Plomería — quedaron de las pruebas, son datos reales y sirven de referencia)

⚠️ Esta cuenta usa un "+alias" de Gmail — **no sirve para probar el flujo de Mercado Pago** (ver bug conocido más abajo). Para probar pagos, usar un email sin "+".

## Qué está hecho y verificado

### Base (sesiones anteriores)
1. **Backend Supabase**: auth por email/contraseña, datos persistidos en la nube con RLS por usuario.
2. **Planes y suscripciones**: Free (2 presupuestos **de por vida**, no por mes — corregido), Founder ($3.990/mes 3 meses, después $7.990/mes, cupo 30), Pro ($8.990/mes).
3. **Mercado Pago end-to-end**: producción, pago real de prueba confirmado, webhook actualiza estado correctamente.
4. **Deploy**: GitHub → Vercel automático.
5. **Rebranding**: paleta azul + Inter en toda la app, PDF y landing.
6. **Landing page** en `/` orientada a conversión, con footer legal.
7. **Widget de feedback** 💡 flotante.
8. **Google Analytics 4**: instalado en landing y app, con `begin_checkout` (clic en Suscribirme) y `purchase` (página `/gracias.html`, con el precio real de la suscripción).

### Paquete de features de retención (esta sesión, 7 fases)
- **Fase 0** — Límite free corregido a "2 de por vida" (antes decía 2/mes).
- **Fase 1** — El cliente aprueba/rechaza el presupuesto desde un link público (`/presupuesto.html?t=...`), sin cuenta. Se separó el ciclo del presupuesto (`status`) del ciclo del trabajo (`work_status`) en columnas distintas. Notificaciones in-app al dueño. Vencimiento automático diario de presupuestos sin respuesta.
- **Fase 2** — Seguimiento de cobros: panel de estado del trabajo (pendiente/en ejecución/cobrado), alerta a los 7+ días sin cobrar, texto de recordatorio para copiar a WhatsApp, filtro "Cobro pendiente" en Historial.
- **Fase 3** — Dashboard mensual con navegación entre meses y flechas de tendencia (▲/▼) vs. el mes anterior en presupuestado, aprobado, cobrado y tasa de aceptación.
- **Fase 4** — Al crear el negocio, si el rubro tiene una plantilla con ítems, se ofrece precargar el catálogo de precios (opt-in, reusa las 17 plantillas existentes).
- **Fase 5** — Botón nuevo de un clic en cada fila del Historial que duplica un presupuesto como plantilla para un cliente nuevo (copia ítems y precios, vacía el cliente). Distinto del "Duplicar" ya existente, que preserva el cliente.
- **Fase 6** — PDF "Acuerdo de trabajo" (no "Contrato" — ver nota legal abajo) para presupuestos aprobados: datos de ambas partes, descripción, monto, forma de pago, plazo, 3 cláusulas simples, disclaimer, firmas.
- **Fase 7** — Onboarding rápido: después de crear el negocio (y el modal de precarga de catálogo), se genera automáticamente un presupuesto de ejemplo con la plantilla del rubro elegido, precios de muestra y "Cliente de ejemplo", listo para revisar y enviar. Aviso bien visible de que es un ejemplo (no persiste, no aparece en el PDF real).

**Fase 8 (recordatorio semanal por email) — pendiente, sin empezar.** Requiere elegir y configurar un proveedor de email transaccional (Resend, SendGrid, Postmark, etc.) antes de escribir código; no hay ninguno configurado todavía.

## Decisiones de producto tomadas en esta sesión (para tener en cuenta)

- **Dos columnas de estado, no una**: `quotes.status` (enviado/aprobado/rechazado/vencido, lo decide el cliente) y `quotes.work_status` (pendiente/en_ejecucion/cobrado, lo maneja el dueño). Antes eran 5 valores mezclados en una sola columna.
- **El link público no pide contraseña** — cualquiera con el link puede aprobar/rechazar (como un link de pago). Si en algún momento se quiere más seguridad, se podría pedir confirmar los últimos 4 dígitos del teléfono del cliente antes de decidir.
- **"Duplicar" (existente) vs. "duplicar como plantilla" (nuevo, Fase 5) son cosas distintas a propósito**: el primero preserva el cliente (para reenviar ajustado a la misma persona), el segundo lo vacía (para cotizarle rápido a alguien nuevo).
- **El PDF de Fase 6 se llama "Acuerdo de trabajo", no "Contrato"** — no lo redactó un abogado, y el documento aclara explícitamente que es un resumen en lenguaje simple, no un reemplazo de asesoramiento legal/contable.
- **Fase 4 reusa las 17 plantillas existentes** en vez de crear una tabla `catalog_templates` separada — mismo contenido, cero SQL adicional.

## Pendiente / próxima sesión

- [ ] **Fase 8**: recordatorio semanal por email a usuarios inactivos. Primer paso: elegir proveedor (Resend recomendado, plan gratis de 3.000 emails/mes) y crear la cuenta.
- [ ] **Cambiar la foto de perfil de la cuenta de Mercado Pago** (cambio manual en la cuenta de MP, no por código). Dado que la marca es anónima, probablemente el isotipo azul "P".
- [ ] **Resetear el contador de founders antes del lanzamiento real con Meta Ads** (hoy hay cupos consumidos por pruebas).
- [ ] Revisar si conviene cancelar la suscripción de prueba real (founder, ya autorizada, cobra $3.990/mes) antes del lanzamiento.

## Bugs conocidos (no bloqueantes)

- **Emails con "+alias" rompen la creación de suscripción en Mercado Pago** (error 500 genérico de la API de MP, no de nuestro código). Con emails normales funciona perfecto.
- El logo del negocio se guarda como base64 en `businesses` (no en Supabase Storage) — funciona pero no ideal para logos grandes.
- Al borrar una fila de `quotes` que tiene una notificación asociada, la notificación NO se borra en cascada (queda con `quote_id = null`, por diseño de `ON DELETE SET NULL`) — no hay política de DELETE en `notifications` para el cliente (correcto: nadie debería poder borrar notificaciones ajenas). Si hace falta limpiar una notificación puntual, se hace por SQL directo.

## Cómo retomar en la próxima sesión

1. Leer este archivo entero primero.
2. Accesos necesarios: panel de Supabase (proyecto `tczjkfcfpfplzzrnpufr`), panel de Mercado Pago developers, Vercel, GitHub.
3. Local: `python3 -m http.server 8080` desde la carpeta del proyecto, abrir `http://localhost:8080/app.html` (o `/` para la landing, o `/presupuesto.html?t=<public_token>` para la vista del cliente).
4. Deploy: commitear y pushear a `main` → Vercel publica solo. Las Edge Functions (`supabase/functions/*`) se pegan a mano en el panel de Supabase y no se despliegan solas desde GitHub.
5. Los ítems de "Pendiente" de arriba son el punto de partida sugerido — empezar por Fase 8 si se define el proveedor de email.
