# Mapa de Origen

Globo 3D interactivo con la red de proveedores de café: **mundo → país → región → municipio → proveedor → productos**.

Países: Colombia, Costa Rica, Guatemala, El Salvador, Nicaragua, Honduras y México.

## Estructura

```
index.html                 página (estructura y estilos)
app.js                     lógica del globo, navegación, búsqueda y fichas
lib/d3.min.js              d3 v7.9.0 (dibujo del globo)
data/red.json              red de proveedores, generada desde el Excel
data/mundo.json            países (Natural Earth 1:110m)
data/<ISO3>.json           límites de cada país: provincias/departamentos, regiones y municipios (geoBoundaries)
scripts/construir_datos.py convierte el Excel en los JSON de data/
.nojekyll                  para que GitHub Pages sirva todo tal cual
```

No usa servidores ni librerías externas, salvo las fuentes de Google. Para verla en el computador: `python3 -m http.server` en esta carpeta y abrir http://localhost:8000.

> **Privacidad:** `data/red.json` contiene la lista completa de proveedores y productos. Este repositorio es privado; si se activa GitHub Pages, la página publicada es pública.

## Actualizar los datos

1. Edita el Excel:
   - hoja `Proveedores`: `ProveedorID`, `Pais`, `ProveedorNombre`, `Municipio`, `Región`
   - hoja `Cropster Products`: `Proveedor` (el ID), `Product`, `Farm`
2. Descarga una vez los mapas base en una carpeta `geo/`:
   - `ne_110m_admin_0_countries.geojson` de https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
   - por país, `<ISO3>_ADM1.geojson` y `<ISO3>_ADM2.geojson` (versión *simplified*) de https://www.geoboundaries.org; para Costa Rica también `CRI_ADM3.geojson` (distritos)
3. Ejecuta `python3 scripts/construir_datos.py Supply_Network_America.xlsx geo data` (necesita `openpyxl`).
4. Revisa los avisos que imprime el script. La app también los muestra en «datos por revisar».

## Cómo se ubican regiones y municipios

Todo está en el diccionario `PAISES` al comienzo del script:

- **Regiones.** Si la región del Excel coincide con una división oficial (departamento, provincia o estado), se usa esa división. Las regiones cafeteras se dibujan con las unidades que las forman. Por ejemplo, Los Santos = cantones de Tarrazú, Dota y León Cortés; Apaneca-Ilamatepec = departamentos de Ahuachapán, Sonsonate y Santa Ana.
- **Municipios.** Se busca el municipio (o distrito, en Costa Rica) con ese nombre dentro de la región. Si el Excel repite el nombre de la región, queda como «Municipio sin especificar» en el centro de la región. Si el nombre no existe, queda «por confirmar».
- **Nombres mal escritos o corregimientos.** Se corrigen en `municipios` del país correspondiente.

Para agregar un país nuevo hay que añadirlo a `PAISES` y descargar sus mapas `ADM1` y `ADM2`.
