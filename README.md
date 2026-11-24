# Analizador de Juicios SENA

Aplicación web en React, TypeScript, Vite y Tailwind CSS para analizar reportes de juicios evaluativos de SOFIA Plus, cruzarlos con el Excel de aprendices disponibles y verificar disponibilidad para Etapa Práctica.

## Funcionalidades principales

- **Tarjetas de Aprendices**: Muestra únicamente los aprendices cargados desde el Excel de aprendices disponibles (Dirección, Teléfono, Correo Electrónico, Municipio, Fecha Grabación, Especialidad), cruzados por Número de Documento (Columna B) para activar el botón verde **Disponible** cuando solo tienen `POR EVALUAR` en `RESULTADOS DE APRENDIZAJE ETAPA PRACTICA` y `0` No Aprobados.
- **Repositorio Drive**: Sincronización automática directa desde enlaces compartidos de Google Drive sin necesidad de iniciar sesión en Gmail (con respaldo OAuth para carpetas privadas).
- **Fichas y Reportes**: Vista consolidada por Ficha de Caracterización con `Fecha del Reporte:` por cada archivo Excel de Drive.
- **Matriz de Competencias y Configurar Lectura**: Resumen por competencia/grupo y ajuste manual de hojas, fila de encabezados y columna de documento.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación corre en `http://localhost:3000`.

## Subir a GitHub

```bash
git init -b main
git add .
git commit -m "Configuración inicial lista para GitHub y Vercel"
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

## Publicar en Vercel

1. Ingresa a [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **Add New → Project** y selecciona el repositorio.
3. Vercel detectará automáticamente la configuración de `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Funciones Serverless**: `/api/drive/list` y `/api/drive/download` se despliegan automáticamente sin configuración adicional.
4. Haz clic en **Deploy**.
