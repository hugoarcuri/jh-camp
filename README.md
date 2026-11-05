# Campamento Cristiano - Gestión de acampantes y pagos

Sitio estático (HTML/CSS/JS) que se conecta a Supabase para guardar acampantes y pagos.

## 1. Crear proyecto en Supabase

1. Entrá a https://supabase.com y creá un proyecto.
2. En **SQL Editor** ejecutá el contenido de `schema.sql`.
3. En **Project Settings -> API** copiá la **Project URL** y la **anon public key**.

## 2. Configurar la app

Editá `config.js` y reemplazá:

```js
SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
SUPABASE_ANON_KEY: "TU_ANON_KEY",
```

Los precios y la fecha del campamento también están ahí (`CAMP_DATE`, `PRICE_TIERS`, `FIRST_TIER_PRICE`).

## 3. Probar localmente

Con Python:
```powershell
cd "C:\Users\Hugo\OneDrive - Plan Sarmiento\openCode\haedocamp"
python -m http.server 8080
```
Abrí http://localhost:8080

## 4. Publicar

Podés subir la carpeta a Netlify, Vercel, GitHub Pages o cualquier hosting estático. Solo sirve los archivos (el navegador se conecta directo a Supabase).

## Funcionalidades

- Acampantes: agregar, editar, eliminar. Datos: apellido y nombre, categoría (Acampante / Equipo), DNI, fecha de nacimiento (edad calculada al 18/01/2027), celular, mail, iglesia. La categoría se puede cambiar directo desde la tabla con un desplegable; se puede filtrar por categoría y el PDF respeta el filtro.
- Valor final por acampante: se puede editar en la tabla (o en el modal) cuando sea necesario. Si se deja vacío, se usa el precio general por tramos. El botón ↺ vuelve al precio general.
- Pagos: agregar por acampante o desde la sección pagos, con modo (transferencia, efectivo, etc.), fecha y nota. Muestra saldo pagado y saldo a cobrar.
- Precios por tramos: hasta 30/09/2026 = $230.000; hasta 30/11/2026 = $270.000; hasta el campamento (18/01/2027) = $320.000. Si la persona ya pagó el tramo completo ($230.000 o más), queda saldada; si no terminó de pagar, el saldo se recalcula con el precio vigente cuando se pasa la fecha. El valor final personalizado reemplaza ese cálculo para esa persona.
- Resumen con totales.

## 5. Migración: categoría y valor final

Si la tabla `campers` ya existía, ejecutá esta sección en **Supabase -> SQL Editor** (también está al final de `schema.sql`):

```sql
alter table public.campers
  add column if not exists category text not null default 'Acampante';

alter table public.campers
  add column if not exists custom_price numeric(12,2);

alter table public.campers drop constraint if exists campers_category_check;
alter table public.campers
  add constraint campers_category_check check (category in ('Acampante', 'Equipo'));

alter table public.campers drop constraint if exists campers_custom_price_check;
alter table public.campers
  add constraint campers_custom_price_check check (custom_price is null or custom_price >= 0);
```

Después recargá la app. Mientras falten las columnas, la app avisa y guarda los acampantes sin categoría ni valor personalizado.

## Notas de seguridad

La app usa la anon key con RLS permisivo (sin login). Para un entorno real con datos sensibles, conviene agregar autenticación (Supabase Auth) y restringir las políticas RLS a usuarios autenticados.
