# Figma Prototype Recorder

Plugin de Figma para grabar sesiones de prototipos animados desde una interfaz simple.

## Estado actual

MVP funcional para entorno web con `MediaRecorder` + opcion MP4:

- Iniciar grabacion de pantalla o ventana con `getDisplayMedia`.
- Detener grabacion y previsualizar video.
- Exportar en WebM (rapido) o MP4 (transcodificacion con `FFmpeg.wasm`).
- Interfaz conectada con el runtime del plugin de Figma.

## Estructura

```text
/figma-prototype-recorder
├── src/
│   ├── code.js
│   ├── ui/
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── app.js
│   ├── ffmpeg/
│   │   └── ffmpeg.js
│   └── recorder/
│       └── recorder.js
├── scripts/
│   ├── build.mjs
│   ├── clean.mjs
│   └── zip.mjs
├── manifest.json
├── package.json
└── README.md
```

## Requisitos

- Node.js 18+
- Figma Desktop o Web (modo desarrollo de plugins)

## Probar en local (sin marketplace)

1. Instala dependencias:

```bash
npm install
```

2. Genera `dist/`:

```bash
npm run build
```

3. En Figma: `Plugins > Development > Import plugin from manifest...`
4. Selecciona `manifest.json` de este proyecto.
5. Ejecuta: `Plugins > Development > Figma Prototype Recorder`.
6. Elige formato de salida (`WebM` o `MP4`) en la UI del plugin.
7. Haz una grabacion de prueba y descarga el resultado.

## Modo Desktop (fallback recomendado)

Si en Figma Desktop ves `Este entorno no soporta getDisplayMedia`, usa este flujo:

1. En el plugin, pulsa `Abrir grabador en navegador`.
2. En el navegador, elige la ventana de Figma al iniciar grabacion.
3. Deten la grabacion y descarga el archivo WebM.

## Produccion (usuarios sin instalar nada)

Objetivo: que cualquier usuario use el plugin en Figma Web o Desktop sin instalar software adicional.

### Paso 1: Publicar grabador web externo

1. Publica la carpeta `tools/recorder-web` en Vercel, Netlify o similar.
2. Este repositorio ya incluye `vercel.json` para desplegar esa carpeta como sitio estatico.
3. Obtendras una URL publica (ejemplo: `https://figma-prototype-recorder.vercel.app`).

### Paso 2: Configurar URL en el plugin

1. Abre `src/code.js`.
2. Ajusta la constante `EXTERNAL_RECORDER_URL` con tu dominio publico.

### Paso 3: Construir y empaquetar

```bash
npm run dist
```

Esto genera `dist/plugin.zip` y deja listo el `manifest.json`.

### Paso 4: Publicar plugin en Figma

1. Desde Figma Plugin Console, crea un plugin nuevo.
2. Sube el contenido para review/publicacion (o distribucion privada por organizacion).
3. Una vez aprobado, usuarios en Web y Desktop podran usarlo.

Comportamiento final por plataforma:

- Figma Web: intenta grabacion directa con `getDisplayMedia`.
- Figma Desktop: abre automaticamente el grabador web externo cuando no hay soporte directo.

### Ciclo de desarrollo local

1. Modifica archivos en `src/`.
2. Ejecuta `npm run build`.
3. En Figma: `Plugins > Development > Reload plugins`.
4. Abre de nuevo el plugin y valida cambios.

No necesitas publicar nada en marketplace para este flujo.

## Build para distribucion

```bash
npm run dist
```

Este comando limpia, construye y genera un zip dentro de `dist/plugin.zip`.

## Limitaciones actuales

- WebM es el formato mas estable y rapido para grabar.
- MP4 requiere conversion posterior y puede tardar segun la duracion del video.
- Para MP4, el plugin descarga runtime de FFmpeg desde `unpkg.com`.
- En escritorio, la disponibilidad depende de permisos del sistema y del runtime embebido.
