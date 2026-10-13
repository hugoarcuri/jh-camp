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

Los precios y la fecha del campamento también están ahí (`CAMP_DATE`, `PRICE_EARLY_UNTIL`, `PRICE_EARLY`, `PRICE_REGULAR`).

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

- Acampantes: agregar, editar, eliminar. Datos: apellido y nombre, DNI, fecha de nacimiento (edad calculada al 18/01/2027), celular, mail, iglesia.
- Pagos: agregar por acampante o desde la sección pagos, con modo (transferencia, efectivo, etc.), fecha y nota. Muestra saldo pagado y saldo a cobrar.
- Precio dinámico por fecha: hasta 31/10/2026 = $270.000; después = $320.000. El saldo se recalcula según el precio vigente (si no terminó de pagar y cambió la fecha, se ajusta).
- Resumen con totales.

## Notas de seguridad

La app usa la anon key con RLS permisivo (sin login). Para un entorno real con datos sensibles, conviene agregar autenticación (Supabase Auth) y restringir las políticas RLS a usuarios autenticados.
