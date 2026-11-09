"""Exoplanet facts shared by the ingest script, Starship (table RAG) and Planet Lab."""

from __future__ import annotations

import math

# Columns of the planets table the language model is allowed to filter and sort on,
# with a description it reads when turning a question into a query plan.
COLUMNS = {
    "name": "planet name, e.g. 'TRAPPIST-1 e'",
    "host": "host star name, e.g. 'TRAPPIST-1'",
    "dist_pc": "distance from the Sun in parsecs (1 parsec = 3.26 light years)",
    "radius": "planet radius in Earth radii",
    "mass": "planet mass in Earth masses",
    "period": "orbital period in days",
    "semi_major": "orbit size in AU (Earth = 1)",
    "eccentricity": "orbit eccentricity, 0 = circle",
    "eq_temp": "equilibrium temperature in kelvin (Earth about 255)",
    "insolation": "starlight received, Earth = 1",
    "star_teff": "star surface temperature in kelvin (Sun 5772)",
    "star_radius": "star radius in Sun radii",
    "star_mass": "star mass in Sun masses",
    "star_type": "spectral type text, e.g. 'M2.5 V'",
    "planets_in_system": "number of known planets in the system",
    "disc_year": "year of discovery",
    "disc_method": "discovery method: 'Transit', 'Radial Velocity', 'Microlensing', 'Imaging', 'Transit Timing Variations', ...",
    "disc_facility": "telescope or survey, e.g. 'Kepler', 'Transiting Exoplanet Survey Satellite (TESS)', 'K2', 'James Webb Space Telescope (JWST)'",
    "size_class": "'Earth-size', 'Super-Earth', 'Sub-Neptune', 'Neptune-like' or 'Gas giant'",
    "in_hz": "true if inside the habitable zone",
    "esi": "Earth Similarity Index from 0 to 1 (Earth = 1)",
}
NUMERIC = {"dist_pc", "radius", "mass", "period", "semi_major", "eccentricity", "eq_temp", "insolation", "star_teff", "star_radius", "star_mass", "planets_in_system", "disc_year", "esi"}
TEXT = {"name", "host", "star_type", "disc_method", "disc_facility", "size_class"}
BOOL = {"in_hz"}
PUBLIC = [
    "name", "host", "dist_pc", "ra", "dec", "radius", "mass", "period", "semi_major", "eq_temp", "insolation",
    "star_teff", "star_type", "planets_in_system", "disc_year", "disc_method", "disc_facility", "size_class", "in_hz", "esi",
]

HZ = (0.25, 1.75)  # optimistic habitable zone, in Earth's starlight


def size_class(radius: float | None, mass: float | None = None) -> str | None:
    if radius is None and mass is not None:  # radial-velocity planets often only have a mass
        radius = mass ** 0.28 if mass < 120 else 11.0
    if radius is None:
        return None
    if radius < 1.25:
        return "Earth-size"
    if radius < 2.0:
        return "Super-Earth"
    if radius < 4.0:
        return "Sub-Neptune"
    if radius < 8.0:
        return "Neptune-like"
    return "Gas giant"


def in_hz(insolation: float | None) -> bool | None:
    return None if insolation is None else HZ[0] <= insolation <= HZ[1]


def esi(radius: float | None, insolation: float | None) -> float | None:
    """Earth Similarity Index (Schulze-Makuch et al. 2011), from radius and starlight."""
    if radius is None or insolation is None or radius <= 0 or insolation <= 0:
        return None
    r = ((radius - 1) / (radius + 1)) ** 2
    s = ((insolation - 1) / (insolation + 1)) ** 2
    return round(1 - math.sqrt(0.5 * (r + s)), 3)


def star_word(teff: float | None, stype: str | None) -> str:
    letter = (stype or "").strip()[:1].upper()
    if letter not in "OBAFGKM" or not letter:
        if teff is None:
            return "star"
        letter = "M" if teff < 3900 else "K" if teff < 5300 else "G" if teff < 6000 else "F" if teff < 7500 else "A"
    names = {"M": "red dwarf (M-type)", "K": "orange dwarf (K-type)", "G": "Sun-like (G-type)", "F": "F-type", "A": "hot A-type", "B": "B-type", "O": "O-type"}
    return names.get(letter, "star")


def _f(v, fmt="{:.3g}"):
    return None if v is None else fmt.format(v)


def describe(p: dict) -> str:
    """A plain-English card for one planet; this is what gets embedded for semantic search."""
    bits = [f"{p['name']} orbits {p['host']}, a {star_word(p.get('star_teff'), p.get('star_type'))} star"]
    if p.get("star_teff"):
        bits[-1] += f" at {p['star_teff']:.0f} K"
    if p.get("dist_pc"):
        bits[-1] += f", {p['dist_pc'] * 3.26156:.0f} light years away"
    bits[-1] += "."
    size = p.get("size_class")
    if p.get("radius"):
        bits.append(f"Radius {_f(p['radius'])} Earth radii ({size}).")
    elif size:
        bits.append(f"Probably {size} by mass.")
    if p.get("mass"):
        bits.append(f"Mass {_f(p['mass'])} Earth masses.")
    if p.get("period"):
        bits.append(f"One orbit takes {_f(p['period'])} days.")
    if p.get("eq_temp"):
        t = p["eq_temp"]
        feel = "frozen" if t < 180 else "cold" if t < 240 else "temperate" if t < 320 else "hot" if t < 700 else "scorching"
        bits.append(f"Equilibrium temperature {t:.0f} K ({feel}).")
    if p.get("insolation") is not None:
        bits.append(f"Receives {_f(p['insolation'])} times Earth's starlight" + (", inside the habitable zone." if p.get("in_hz") else "."))
    if p.get("esi"):
        bits.append(f"Earth Similarity Index {p['esi']:.2f}.")
    if p.get("planets_in_system", 1) and p.get("planets_in_system", 1) > 1:
        bits.append(f"One of {p['planets_in_system']} known planets in its system.")
    if p.get("disc_year"):
        bits.append(f"Discovered in {p['disc_year']} by {(p.get('disc_method') or 'unknown method').lower()} with {p.get('disc_facility') or 'an unknown facility'}.")
    return " ".join(bits)


# ---------- Planet Lab: compare an invented planet with real ones ----------
FEATURES = ["radius", "mass", "period", "insolation", "star_teff"]


def feature_vector(p: dict) -> list[float] | None:
    """Log scale, so 'twice as big' counts the same for small and large planets."""
    try:
        return [
            math.log10(p["radius"]),
            math.log10(p["mass"]) / 2,
            math.log10(p["period"]) / 2,
            math.log10(p["insolation"]),
            (p["star_teff"] - 5000) / 1500,
        ]
    except (TypeError, ValueError, KeyError):
        return None


def distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))
