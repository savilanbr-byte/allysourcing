#!/usr/bin/env python3
"""Construye los datos del Mapa de Origen a partir del Excel de la red de proveedores.

Uso:  python3 scripts/construir_datos.py <Supply_Network.xlsx> <carpeta_geo> <carpeta_salida>

Excel: hoja «Proveedores» (ProveedorID, Pais, ProveedorNombre, Municipio, Región)
       hoja «Cropster Products» (Proveedor, Product, Farm)

Carpeta geo (geoBoundaries «simplified» + Natural Earth):
  ne_110m_admin_0_countries.geojson
  <ISO3>_ADM1.geojson, <ISO3>_ADM2.geojson (y CRI_ADM3.geojson para los distritos de Costa Rica)

Salidas: mundo.json, <ISO3>.json por país, red.json
"""
import json, sys, re, unicodedata, math
from collections import defaultdict, OrderedDict
import openpyxl

XLSX, GEO, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").strip().lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s)

def clean(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()

# =====================================================================
# Configuración por país
#   regiones: nombre en el Excel -> (nombre a mostrar, nivel, [unidades])
#     nivel adm1/adm2/adm3: la región se dibuja con esas unidades oficiales
#   municipios: (municipio Excel, región Excel) -> (nombre a mostrar, nivel, unidad, nota)
#     nivel None = sin especificar (se ubica en el centro de la región)
#     nivel "?"  = no se encontró (por confirmar)
#   Cualquier región que no esté en la tabla se busca como ADM1 con el mismo nombre,
#   y cualquier municipio, como ADM2 (o ADM3) con el mismo nombre dentro de la región.
# =====================================================================
PAISES = {
    "colombia": dict(iso3="COL", nombre="Colombia", etiqueta="Departamento", tol=(0.008, 0.003),
        municipios={
            ("arataco", "santander"): ("Aratoca", "adm2", "Aratoca", "En el Excel figura como «Arataco»."),
            ("dos quebradas", "risaralda"): ("Dosquebradas", "adm2", "Dosquebradas", None),
            ("ciudad bolivar", "antioquia"): ("Ciudad Bolívar", "adm2", "Ciudad Bolívar", None),
            ("tablon de gomez", "narino"): ("El Tablón de Gómez", "adm2", "El Tablón De Gómez", None),
            ("berruecos", "narino"): ("Arboleda", "adm2", "Arboleda", "Berruecos es corregimiento de Arboleda."),
            ("caldas", "caldas"): ("Caldas", "?", None, "No hay municipio «Caldas» en el departamento de Caldas (sí en Antioquia y en Boyacá)."),
        }),
    "costa rica": dict(iso3="CRI", nombre="Costa Rica", etiqueta="Región", tol=(0.003, 0.0015), adm3=True,
        regiones={
            "los santos": ("Los Santos", "adm2", ["Tarrazu", "Dota", "Leon Cortes Castro"]),
            "brunca": ("Brunca", "adm2", ["Perez Zeledon", "Coto Brus", "Buenos Aires"]),
            "chirripo": ("Chirripó", "adm3", ["Rivas", "Río Nuevo", "Páramo"]),
            "valle central": ("Valle Central", "adm2", ["Heredia", "Barva", "Santo Domingo", "Santa Barbara", "San Rafael",
                                                        "San Isidro", "San Pablo", "Flores", "Belen", "Alajuela",
                                                        "Moravia", "Vazquez de Coronado", "Tibas", "Goicoechea"]),
            "valle occidental": ("Valle Occidental", "adm2", ["Grecia", "Sarchi", "Naranjo", "San Ramon",
                                                              "Atenas", "Zarcero", "Poas",
                                                              "Palmeras"]),  # geoBoundaries escribe «Palmeras» por Palmares),
        },
        municipios={
            ("los santos", "los santos"): (None, None, None, None),
            ("san jeronimo", "brunca"): ("San Jerónimo", "?", None, "No hay un distrito San Jerónimo en la región Brunca (los hay en Esparza, Moravia y Naranjo)."),
            ("rivas", "chirripo"): ("Rivas", "adm3", "Rivas", None),
            ("san isidro heredia", "valle central"): ("San Isidro (Heredia)", "adm2", "San Isidro", None),
            ("poas alajuela", "valle occidental"): ("Poás", "adm2", "Poas", None),
            ("sanrchi", "valle central"): ("Sarchí", "adm2", "Sarchi", "En el Excel figura como «Sanrchí» y en la región Valle Central; Sarchí queda en el Valle Occidental."),
            ("sarchi", "valle occidental"): ("Sarchí", "adm2", "Sarchi", None),
            ("santa maria de dota", "los santos"): ("Santa María de Dota", "adm3", "Santa María", None),
            ("san francisco de leon cortes", "los santos"): ("San Francisco de León Cortés", "adm2", "Leon Cortes Castro", "San Francisco es un poblado; se muestra el cantón León Cortés."),
            ("san isidro de leon cortes", "los santos"): ("San Isidro de León Cortés", "adm3", "San Isidro", None),
            ("san marcos de tarrazu", "los santos"): ("San Marcos de Tarrazú", "adm3", "San Marcos", None),
        }),
    "guatemala": dict(iso3="GTM", nombre="Guatemala", etiqueta="Región", tol=(0.004, 0.002),
        regiones={
            "antigua": ("Antigua", "adm1", ["Sacatepéquez"]),
            "acatenango": ("Acatenango", "adm2", ["Acatenango"]),
        },
        municipios={
            ("antigua", "antigua"): ("Antigua Guatemala", "adm2", "Antigua Guatemala", None),
            ("acatenango", "acatenango"): ("Acatenango", "adm2", "Acatenango", None),
        }),
    "el salvador": dict(iso3="SLV", nombre="El Salvador", etiqueta="Región", tol=(0.003, 0.0015),
        regiones={
            "apaneca-ilamatepec": ("Apaneca-Ilamatepec", "adm1", ["Departamento de Ahuachapán", "Departamento de Sonsonate", "Departamento de Santa Ana"]),
            "usulutan": ("Usulután", "adm1", ["Departamento de Usulután"]),
        }),
    "nicaragua": dict(iso3="NIC", nombre="Nicaragua", etiqueta="Región", tol=(0.005, 0.0025),
        regiones={
            "nueva segovia": ("Nueva Segovia", "adm1", ["Nueva Segovia"]),
            "matagalpa": ("Matagalpa", "adm1", ["Matagalpa (Departemento)"]),
        }),
    "honduras": dict(iso3="HND", nombre="Honduras", etiqueta="Región", tol=(0.005, 0.0025),
        regiones={
            "santa barbara": ("Santa Bárbara", "adm1", ["Santa Bárbara"]),
            "ocotepeque": ("Ocotepeque", "adm1", ["Ocotepeque"]),
        }),
    "mexico": dict(iso3="MEX", nombre="México", etiqueta="Región", tol=(0.02, 0.004),
        regiones={"chiapas": ("Chiapas", "adm1", ["Chiapas"])}),
}

# ---------- geometría ----------
def perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))

def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        dmax, idx = 0, None
        for k in range(i + 1, j):
            d = perp(pts[k], pts[i], pts[j])
            if d > dmax:
                dmax, idx = d, k
        if idx is not None and dmax > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]

def ring_area(r):
    return 0.5 * sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))

def polys(geom):
    return geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]

def simplify(geom, tol, nd=4, min_area=None):
    min_area = min_area if min_area is not None else (tol * 2) ** 2
    out = []
    for poly in polys(geom):
        rings = []
        for i, r in enumerate(poly):
            if abs(ring_area(r)) < min_area and (i > 0 or len(polys(geom)) > 1):
                if i == 0:
                    break
                continue
            s = dp([tuple(p[:2]) for p in r], tol)
            s = [[round(x, nd), round(y, nd)] for x, y in s]
            dedup = [s[0]] + [p for k, p in enumerate(s[1:], 1) if p != s[k - 1]]
            if len(dedup) >= 4:
                a = ring_area(dedup)  # d3: exterior horario, huecos antihorarios
                if (len(rings) == 0 and a > 0) or (len(rings) > 0 and a < 0):
                    dedup = dedup[::-1]
                rings.append(dedup)
        if rings:
            out.append(rings)
    if not out:
        return None
    return {"type": "MultiPolygon", "coordinates": out} if len(out) > 1 else {"type": "Polygon", "coordinates": out[0]}

def centroid(geom):
    best = max((p[0] for p in polys(geom)), key=lambda r: abs(ring_area(r)))
    a = ring_area(best)
    if a == 0:
        return best[0][:2]
    f = lambda i: best[i][0] * best[i + 1][1] - best[i + 1][0] * best[i][1]
    cx = sum((best[i][0] + best[i + 1][0]) * f(i) for i in range(len(best) - 1)) / (6 * a)
    cy = sum((best[i][1] + best[i + 1][1]) * f(i) for i in range(len(best) - 1)) / (6 * a)
    return [cx, cy]

def area(geom):
    return sum(abs(ring_area(p[0])) for p in polys(geom))

def in_ring(pt, r):
    x, y, inside = pt[0], pt[1], False
    for i in range(len(r) - 1):
        (x1, y1), (x2, y2) = r[i][:2], r[i + 1][:2]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside

def in_geom(pt, geom):
    return any(in_ring(pt, p[0]) and not any(in_ring(pt, h) for h in p[1:]) for p in polys(geom))

def r4(c):
    return [round(c[0], 4), round(c[1], 4)]

def load(iso, lvl):
    try:
        fs = json.load(open(f"{GEO}/{iso}_{lvl.upper()}.geojson"))["features"]
    except FileNotFoundError:
        return []
    out = []
    for f in fs:
        if not f.get("geometry"):
            continue
        nm = clean(f["properties"]["shapeName"])
        nm = re.sub(r"\bDe\b", "de", nm)
        out.append({"name": nm, "geom": f["geometry"], "c": centroid(f["geometry"])})
    return out

# ---------- Excel ----------
wb = openpyxl.load_workbook(XLSX, data_only=True)
ws = wb["Proveedores"]
hdr = [norm(h) for h in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))]
col = lambda *names: next(i for i, h in enumerate(hdr) if h in names)
iP, iN, iM, iR = col("pais", "país"), col("proveedornombre"), col("municipio"), col("region", "región", "departamento")
prov_rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]
prod_rows = [r for r in wb["Cropster Products"].iter_rows(min_row=2, values_only=True) if r[0] and r[1]]

prods_by = defaultdict(list)
for pid, product, farm in prod_rows:
    prods_by[clean(pid)].append({"nombre": clean(product), "finca": clean(farm)})

avisos = []
by_country = OrderedDict()
for r in prov_rows:
    pid, pais, nombre, mun_raw, reg_raw = clean(r[0]), clean(r[iP]), clean(r[iN]), clean(r[iM]), clean(r[iR])
    cfg = PAISES.get(norm(pais))
    if not cfg:
        avisos.append(f"{pid} {nombre}: país «{pais}» sin configurar."); continue
    by_country.setdefault(norm(pais), []).append((pid, nombre, mun_raw, reg_raw))

ids = {clean(r[0]) for r in prov_rows}
for pid, ps in prods_by.items():
    if pid not in ids:
        fincas = sorted({p["finca"] for p in ps if p["finca"]})
        avisos.append(f"{pid} ({', '.join(fincas)}): {len(ps)} productos en «Cropster Products», pero el proveedor no está en la hoja «Proveedores».")

world_regs = []
red = {"fuente": XLSX.split("/")[-1], "paises": [], "avisos": avisos}

for key, rows in by_country.items():
    cfg = PAISES[key]; iso = cfg["iso3"]; tb, tu = cfg["tol"]
    A1, A2, A3 = load(iso, "adm1"), load(iso, "adm2"), (load(iso, "adm3") if cfg.get("adm3") else [])
    find = lambda L, nm: [u for u in L if norm(u["name"]) == norm(nm)]
    # ---- regiones ----
    regs = OrderedDict()
    for _, _, _, reg_raw in rows:
        k = norm(reg_raw)
        if k in regs:
            continue
        disp, lvl, units = cfg.get("regiones", {}).get(k, (reg_raw, "adm1", [reg_raw]))
        L = {"adm1": A1, "adm2": A2, "adm3": A3}[lvl]
        parts = []
        for u in units:
            m = find(L, u)
            if not m:
                avisos.append(f"{cfg['nombre']}: no encontré «{u}» para dibujar la región {disp}.")
            elif len(m) > 1 and lvl == "adm3":
                # distritos homónimos: el que cae en el cantón de la región (Chirripó → Pérez Zeledón)
                pz = find(A2, "Perez Zeledon")
                m = [x for x in m if pz and in_geom(x["c"], pz[0]["geom"])] or m[:1]
            parts += m[:1] if lvl != "adm3" else m
        regs[k] = {"name": disp, "lvl": lvl, "parts": parts, "munis": OrderedDict()}
    # ---- municipios y proveedores ----
    for pid, nombre, mun_raw, reg_raw in rows:
        R = regs[norm(reg_raw)]
        inR = lambda u: any(in_geom(u["c"], p["geom"]) for p in R["parts"]) or any(u is p for p in R["parts"])
        rule = cfg.get("municipios", {}).get((norm(mun_raw), norm(reg_raw)))
        unit, lvl, disp, nota = None, None, mun_raw, None
        if rule:
            disp, lvl, uname, nota = rule
            if lvl in ("adm2", "adm3"):
                L = A2 if lvl == "adm2" else A3
                cands = find(L, uname)
                inside = [u for u in cands if inR(u)]  # homónimos: el que cae dentro de la región
                unit = (inside or cands or [None])[0]
                if unit is None:
                    lvl = "?"
        elif norm(mun_raw) == norm(reg_raw):
            lvl = None
        else:
            for L, lv in ((A2, "adm2"), (A3, "adm3")):
                inside = [u for u in find(L, mun_raw) if inR(u)]
                if inside:
                    unit, lvl, disp = inside[0], lv, inside[0]["name"]; break
            else:
                lvl = "?"
        if lvl is None:
            disp, mkey = "Municipio sin especificar", "_sin"
            c, ok = None, "sin"
        elif lvl == "?":
            mkey = "?" + norm(disp)
            c, ok = None, "conf"
            if not nota:
                nota = f"No encontré el municipio «{mun_raw}» en {R['name']}."
        else:
            mkey, c, ok = norm(disp), unit["c"], "ok"
        if nota:
            avisos.append(f"{pid} {nombre}: {nota}")
        M = R["munis"].setdefault(mkey, {"name": disp, "c": c, "ok": ok, "unit": unit, "lvl": lvl, "proveedores": []})
        prods = prods_by.get(pid, [])
        if not prods:
            avisos.append(f"{pid} {nombre}: sin productos en «Cropster Products».")
        M["proveedores"].append({"id": pid, "nombre": nombre, "localidad": "Berruecos" if norm(mun_raw) == "berruecos" else None,
                                 "productos": prods})
    # ---- centros ----
    for R in regs.values():
        big = max(R["parts"], key=lambda p: area(p["geom"])) if R["parts"] else None
        R["c"] = big["c"] if big else None
        for M in R["munis"].values():
            if M["c"] is None:
                M["c"] = R["c"]
    # ---- geo de salida ----
    feats = []
    reg_of_adm1 = defaultdict(list)
    for R in regs.values():
        if R["lvl"] == "adm1":
            for p in R["parts"]:
                reg_of_adm1[id(p)].append(R["name"])
    for a in A1:
        g = simplify(a["geom"], tb)
        if g:
            props = {"t": "base", "name": a["name"]}
            if reg_of_adm1.get(id(a)):
                props["reg"] = reg_of_adm1[id(a)]
            feats.append({"type": "Feature", "properties": props, "geometry": g})
    bg = A3 if A3 else A2
    for R in regs.values():
        if R["lvl"] != "adm1":
            for p in R["parts"]:
                g = simplify(p["geom"], tu)
                if g:
                    feats.append({"type": "Feature", "properties": {"t": "reg", "reg": [R["name"]], "name": p["name"]}, "geometry": g})
        # unidades de fondo dentro de la región y polígonos de los municipios con proveedores
        mun_units = {id(M["unit"]): M["name"] for M in R["munis"].values() if M["unit"] is not None}
        used = set()
        for u in bg:
            if any(in_geom(u["c"], p["geom"]) for p in R["parts"]) or any(u is p for p in R["parts"]):
                g = simplify(u["geom"], tu)
                if g:
                    props = {"t": "unit", "reg": R["name"], "name": u["name"]}
                    if id(u) in mun_units:
                        props["mun"] = mun_units[id(u)]; used.add(id(u))
                    feats.append({"type": "Feature", "properties": props, "geometry": g})
        for M in R["munis"].values():
            u = M["unit"]
            if u is not None and id(u) not in used:
                g = simplify(u["geom"], tu)
                if g:
                    feats.append({"type": "Feature", "properties": {"t": "mun", "reg": R["name"], "name": u["name"], "mun": M["name"]}, "geometry": g})
    json.dump({"type": "FeatureCollection", "features": feats}, open(f"{OUT}/{iso}.json", "w"), ensure_ascii=False, separators=(",", ":"))
    # ---- red ----
    regiones = []
    for R in regs.values():
        ms = []
        for M in R["munis"].values():
            ms.append({"name": M["name"], "c": r4(M["c"]), "ok": M["ok"], "proveedores": M["proveedores"]})
        regiones.append({"name": R["name"], "c": r4(R["c"]), "municipios": ms})
    cs = [R["c"] for R in regs.values()]
    red["paises"].append({"iso3": iso, "nombre": cfg["nombre"], "etiqueta": cfg["etiqueta"],
                          "centro": r4([sum(c[0] for c in cs) / len(cs), sum(c[1] for c in cs) / len(cs)]),
                          "regiones": regiones})

json.dump(red, open(f"{OUT}/red.json", "w"), ensure_ascii=False, separators=(",", ":"))

ne = json.load(open(f"{GEO}/ne_110m_admin_0_countries.geojson"))["features"]
mundo = {"type": "FeatureCollection", "features": []}
for f in ne:
    p = f["properties"]
    g = simplify(f["geometry"], 0.05, 2, 0.01)
    if g:
        mundo["features"].append({"type": "Feature", "properties": {"iso3": p.get("ADM0_A3"), "name": p.get("NAME_ES") or p.get("NAME")}, "geometry": g})
json.dump(mundo, open(f"{OUT}/mundo.json", "w"), ensure_ascii=False, separators=(",", ":"))

for P in red["paises"]:
    nprov = sum(len(m["proveedores"]) for r in P["regiones"] for m in r["municipios"])
    nprod = sum(len(v["productos"]) for r in P["regiones"] for m in r["municipios"] for v in m["proveedores"])
    print(f"{P['nombre']:12} regiones {len(P['regiones']):2}  municipios {sum(len(r['municipios']) for r in P['regiones']):2}  proveedores {nprov:2}  productos {nprod}")
print("Avisos:"); [print(" -", a) for a in avisos]
