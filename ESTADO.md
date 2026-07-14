# Estado del proyecto — Presupuestador Pro

Última actualización: 14 de julio de 2026.

## Qué es

App web para que independientes argentinos (oficios, creativos, profesionales) generen presupuestos profesionales en PDF, con cuenta en la nube, suscripción paga vía Mercado Pago, y landing propia para captar tráfico de Meta Ads.

## Arquitectura

- **Frontend**: HTML + CSS + JS vanilla, sin build ni framework. Un solo archivo por página.
- **Backend**: Supabase (Postgres + Auth + Edge Functions). Proyecto: `tczjkfcfpfplzzrnpufr` (org: balbinopublicads-oss... ver panel de Supabase).
- **Pagos**: Mercado Pago Suscripciones (API `/preapproval` + `/preapproval_plan`), credenciales de **producción** ya cargadas.
- **Hosting**: Vercel, deploy automático al pushear a `main` en GitHub.
- **Repo**: https://github.com/balbinopublicidads-oss/presupuestador-pro
- **Sitio en producción**: https://presupuestador-pro.vercel.app (landing) — la app está en `/app.html`.

## Archivos clave

| Archivo | Qué es |
|---|---|
| `index.html` | Landing page de marketing (pública, sin login) |
| `app.html` | La aplicación completa (login, dashboard, presupuestos, plan, ajustes) |
| `terminos.html` / `privacidad.html` | Páginas legales mínimas enlazadas desde el footer |
| `supabase-schema.sql` | Esquema inicial: `businesses`, `quotes`, `catalog_items` (ya ejecutado) |
| `supabase-schema-billing.sql` | Esquema de suscripciones: `subscriptions`, `founder_counter`, límite free, cron de founders (ya ejecutado) |
| `supabase-schema-reset.sql` | Reset puntual que bajó el límite free de 3 a 2/mes (ya ejecutado) |
| `supabase-schema-feedback.sql` | Tabla `feedback` del widget flotante (ya ejecutado) |
| `supabase-fix-aldana-subscription.sql` | Reconciliación manual de una suscripción real (ya ejecutado, histórico) |
| `supabase/functions/create-subscription/index.ts` | Edge Function: crea la suscripción en Mercado Pago |
| `supabase/functions/mp-webhook/index.ts` | Edge Function: recibe avisos de pago de Mercado Pago |

Los `.sql` en la raíz son **migraciones históricas ya aplicadas** — quedan como registro, no hace falta volver a correrlos salvo que se arme un proyecto de Supabase nuevo desde cero.

## Cuenta de prueba

- Email: `balbinopublicidads+test@gmail.com`
- Contraseña: `test123456`
- Negocio: "Plomería Test"

⚠️ Esta cuenta usa un "+alias" de Gmail — **no sirve para probar el flujo de Mercado Pago** (ver bug conocido más abajo). Para probar pagos, usar un email sin "+".

## Qué está hecho y verificado

1. **Backend Supabase**: auth por email/contraseña (con confirmación de email obligatoria), datos de negocio/presupuestos/catálogo persistidos en la nube con RLS por usuario. Se detectó y corrigió un bug de la librería `supabase-js` que colgaba la restauración de sesión al recargar la página (se resolvió manejando la persistencia de sesión a mano).
2. **Planes y suscripciones**:
   - Free: 2 presupuestos por mes (límite reforzado a nivel de base de datos, no solo en el frontend).
   - Founder: $3.990/mes los primeros 3 meses, después $7.990/mes de por vida. Cupo limitado a 30, con contador atómico (sin condiciones de carrera).
   - Pro (regular, sin cupo): $8.990/mes.
   - Suba automática de precio de founders a los 3 meses vía cron diario en Supabase.
3. **Mercado Pago end-to-end**: se creó la suscripción con credenciales de producción, **se completó un pago real de prueba y se confirmó que el webhook actualiza el estado a "authorized" correctamente**. Se encontró y corrigió un bug real en el camino: el flujo original (redirigir al link genérico del plan) no conservaba el dato que identifica al usuario (`external_reference`), lo que iba a impedir vincular automáticamente cualquier pago real a una cuenta. Se resolvió creando la suscripción directo por API.
4. **Deploy**: repo en GitHub conectado a Vercel, deploy automático en cada push a `main`.
5. **Rebranding**: paleta azul profesional + tipografía Inter en toda la app, dashboard, PDF y landing (se descartó la estética negro/crema con serif del MVP inicial).
6. **Landing page** en `/`: hero, historia de identificación, beneficios por rubro, precio visible, sección de urgencia con contador en vivo de cupos founder, footer legal.
7. **Widget de feedback** 💡 flotante para usuarios logueados, guardando sugerencias en Supabase.

## Pendiente / próxima sesión

- [ ] **Cambiar el límite del plan free de "2 por mes" a "2 en total" (de por vida)**. Hoy el trigger `enforce_quote_quota` en la base cuenta presupuestos del mes calendario en curso (`created_at >= date_trunc('month', now())`); hay que cambiarlo a un conteo total sin ventana de tiempo. También hay que actualizar los textos del frontend ("2 de por vida" en vez de "2 este mes") en `app.html`: buscar `quotesThisMonth`, la vista `vBilling`, el banner de `vHome`, y el modal `showQuotaModal`.
- [ ] **Cambiar la foto de perfil de la cuenta de Mercado Pago**. Es un cambio manual en la configuración de la cuenta de MP (no vía código) — pensar qué imagen usar (dado que la marca busca ser anónima/sin cara visible, probablemente el isotipo azul "P" del rebranding).
- [ ] **Resetear el contador de founders antes del lanzamiento real con Meta Ads**. Al día de hoy quedaron consumidos 2 lugares (1 suscripción real de prueba + 1 de la cuenta de test). Decidir si se resetea a 0 antes de arrancar la campaña o se dejan esos cupos como ya usados.
- [ ] Revisar si la suscripción de prueba real (founder, ya autorizada) se debe cancelar antes del lanzamiento para no seguir cobrando ese monto mensual de prueba.

## Bugs conocidos (no bloqueantes)

- **Emails con "+alias" rompen la creación de suscripción en Mercado Pago** (tira error 500 genérico). Confirmado que es un comportamiento de la API de Mercado Pago, no de nuestro código — con emails normales funciona perfecto. Bajo impacto esperado (poca gente usa "+alias"), pero si un usuario reporta error al suscribirse, preguntar por el formato del email.
- El logo del negocio se guarda como base64 en la tabla `businesses` (no en Supabase Storage). Funciona pero no es ideal para logos grandes — posible mejora futura, no urgente.

## Cómo retomar en la próxima sesión

1. Contexto rápido: leer este archivo entero primero.
2. Accesos que vas a necesitar tener a mano: panel de Supabase (proyecto `tczjkfcfpfplzzrnpufr`), panel de Mercado Pago developers, Vercel, y GitHub (repo arriba).
3. Para levantar el entorno local: `python3 -m http.server 8080` desde la carpeta del proyecto, y abrir `http://localhost:8080/app.html` (o `/` para la landing).
4. Para deployar cambios: commitear y pushear a `main` — Vercel lo publica solo. Para cambios en las Edge Functions (`supabase/functions/*`), hay que pegar el código a mano en el panel de Supabase (no se despliegan solas desde GitHub) y hacer clic en Deploy ahí.
5. Los ítems de la sección "Pendiente" de arriba son el punto de partida sugerido.
