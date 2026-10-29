# Mapa de Origen

Globo 3D interactivo con la red de proveedores de café: **mundo → país → departamento → municipio → proveedor → productos**.

## Estructura

```
index.html                 la app completa (HTML + CSS + JS)
lib/d3.min.js              d3 v7.9.0 (dibujo del globo)
data/red.json              red de proveedores, generada desde el Excel
data/mundo.json            países (Natural Earth 1:110m)
data/COL.json              departamentos de Colombia + municipios de los departamentos con proveedores (geoBoundaries)
scripts/construir_datos.py convierte el Excel en los tres JSON
.nojekyll                  para que GitHub Pages sirva todo tal cual
```

No usa servidores ni librerías externas, salvo las fuentes de Google. Para verla en el computador: `python3 -m http.server` en esta carpeta y abrir http://localhost:8000.

## Publicar en GitHub Pages

Sube todo a la raíz del repositorio y en **Settings → Pages** elige la rama `main` y la carpeta `/ (root)`.

> **Ojo:** una página de GitHub Pages es pública, aunque el repositorio sea privado. `data/red.json` contiene la lista completa de proveedores y productos.

## Actualizar los datos

1. Edita el Excel (hojas `Proveedores` y `Cropster Products`, con las mismas columnas).
2. Descarga una vez los mapas base en una carpeta `geo/`:
   - `COL_ADM1.geojson` y `COL_ADM2.geojson`: https://www.geoboundaries.org (Colombia, ADM1 y ADM2, versión *simplified*)
   - `ne_110m_admin_0_countries.geojson`: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
3. Ejecuta `python3 scripts/construir_datos.py Supply_Network.xlsx geo data` (necesita `openpyxl`).
4. Revisa los avisos que imprime el script (municipios no reconocidos, proveedores sin productos). La app los muestra en «datos por revisar».

Si un municipio del Excel está mal escrito o es un corregimiento, agrégalo al diccionario `ALIAS` del script.

## Para agregar otro país

Hoy el script arma solo Colombia. Para otro país hacen falta sus límites de regiones y municipios (geoBoundaries ADM1/ADM2) y una columna `País` en la hoja de proveedores. La app ya está preparada para varios países: carga `data/<ISO3>.json` por cada uno.
