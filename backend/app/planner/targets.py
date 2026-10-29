"""Targets for the planner: the Moon, planets, a built-in list of showpiece objects, or any SIMBAD name / RA-Dec."""
from __future__ import annotations

from datetime import datetime
from typing import Any

import astronomy as ae

from ..core import astro
from ..core.envelope import Provenance
from ..core.http import ProviderError, fetch
from ..lens.catalog import SIMBAD_MIRRORS, _find_mirror, _params

# name, jp, kind, ra_deg, dec_deg, note  (J2000; the planner needs degree-level accuracy only)
BUILTIN: list[dict[str, Any]] = [
    {"id": "moon", "name": "The Moon", "jp": "月", "kind": "moon", "note": "Bright at any site; moonlight is not a problem for itself."},
    {"id": "jupiter", "name": "Jupiter", "jp": "木星", "kind": "planet", "body": "Jupiter", "note": "Bands and moons in any telescope."},
    {"id": "saturn", "name": "Saturn", "jp": "土星", "kind": "planet", "body": "Saturn", "note": "Rings from 30x upward."},
    {"id": "mars", "name": "Mars", "jp": "火星", "kind": "planet", "body": "Mars", "note": "Best near opposition."},
    {"id": "venus", "name": "Venus", "jp": "金星", "kind": "planet", "body": "Venus", "note": "Evening or morning only."},
    {"id": "m31", "name": "Andromeda Galaxy (M31)", "jp": "アンドロメダ銀河", "kind": "deepsky", "ra": 10.6847, "dec": 41.2687, "note": "Naked-eye smudge from a dark site."},
    {"id": "m42", "name": "Orion Nebula (M42)", "jp": "オリオン大星雲", "kind": "deepsky", "ra": 83.8221, "dec": -5.3911, "note": "Bright enough for the city with binoculars."},
    {"id": "m45", "name": "Pleiades (M45)", "jp": "すばる", "kind": "deepsky", "ra": 56.75, "dec": 24.1167, "note": "Subaru. Binoculars are the best instrument."},
    {"id": "m13", "name": "Hercules Cluster (M13)", "jp": "ヘルクレス座球状星団", "kind": "deepsky", "ra": 250.4235, "dec": 36.4613, "note": "Globular; resolves in a 6-inch telescope."},
    {"id": "m57", "name": "Ring Nebula (M57)", "jp": "環状星雲", "kind": "deepsky", "ra": 283.3963, "dec": 33.0292, "note": "Small; needs a telescope."},
    {"id": "m8", "name": "Lagoon Nebula (M8)", "jp": "干潟星雲", "kind": "deepsky", "ra": 270.9042, "dec": -24.3867, "note": "Summer Milky Way showpiece."},
    {"id": "m51", "name": "Whirlpool Galaxy (M51)", "jp": "子持ち銀河", "kind": "deepsky", "ra": 202.4696, "dec": 47.1952, "note": "Faint; dark sky needed."},
    {"id": "omegacen", "name": "Omega Centauri", "jp": "オメガ星団", "kind": "deepsky", "ra": 201.6971, "dec": -47.4795, "note": "Largest globular; southern sky."},
    {"id": "sirius", "name": "Sirius", "jp": "シリウス", "kind": "star", "ra": 101.2872, "dec": -16.7161, "note": "Brightest star."},
    {"id": "betelgeuse", "name": "Betelgeuse", "jp": "ベテルギウス", "kind": "star", "ra": 88.7929, "dec": 7.4071, "note": "Red supergiant in Orion."},
    {"id": "vega", "name": "Vega", "jp": "ベガ", "kind": "star", "ra": 279.2347, "dec": 38.7837, "note": "Summer Triangle."},
    {"id": "polaris", "name": "Polaris", "jp": "北極星", "kind": "star", "ra": 37.9546, "dec": 89.2641, "note": "Does not move; fine for alignment, dull for viewing."},
]

PLANET_BODIES = {"Mercury": ae.Body.Mercury, "Venus": ae.Body.Venus, "Mars": ae.Body.Mars, "Jupiter": ae.Body.Jupiter, "Saturn": ae.Body.Saturn, "Uranus": ae.Body.Uranus, "Neptune": ae.Body.Neptune}


class Target:
    def __init__(self, name: str, kind: str, ra: float | None = None, dec: float | None = None, body: ae.Body | None = None, note: str | None = None, source: str = "built-in"):
        self.name, self.kind, self.ra, self.dec, self.body, self.note, self.source = name, kind, ra, dec, body, note, source

    def altaz(self, dt: datetime, obs: ae.Observer) -> tuple[float, float]:
        if self.body is not None:
            return astro.altaz(self.body, dt, obs)
        return astro.radec_to_altaz(self.ra / 15.0, self.dec, dt, obs)  # type: ignore[arg-type]

    def radec(self, dt: datetime, obs: ae.Observer) -> tuple[float, float]:
        if self.body is not None:
            eq = ae.Equator(self.body, astro.to_time(dt), obs, True, True)
            return eq.ra * 15.0, eq.dec
        return self.ra, self.dec  # type: ignore[return-value]

    def describe(self) -> dict[str, Any]:
        return {"name": self.name, "kind": self.kind, "ra": self.ra, "dec": self.dec, "note": self.note, "source": self.source}


def _builtin(target_id: str) -> Target | None:
    for t in BUILTIN:
        if t["id"] == target_id.lower() or t["name"].lower() == target_id.lower():
            if t["kind"] == "moon":
                return Target(t["name"], "moon", body=ae.Body.Moon, note=t["note"])
            if t["kind"] == "planet":
                return Target(t["name"], "planet", body=PLANET_BODIES[t["body"]], note=t["note"])
            return Target(t["name"], t["kind"], ra=t["ra"], dec=t["dec"], note=t["note"])
    if target_id.title() in PLANET_BODIES:
        return Target(target_id.title(), "planet", body=PLANET_BODIES[target_id.title()])
    return None


async def resolve(name: str | None, ra: float | None, dec: float | None, kind: str | None) -> tuple[Target, Provenance]:
    """RA/Dec wins; then the built-in list; then SIMBAD by name (several id spellings)."""
    if ra is not None and dec is not None:
        return Target(name or f"{ra:.4f}, {dec:+.4f}", kind or "deepsky", ra=ra, dec=dec, source="coordinates"), Provenance(source="computed")
    if not name:
        raise ValueError("give a target name or RA/Dec")
    b = _builtin(name)
    if b is not None:
        return b, Provenance(source="built-in list")
    url, errors = await _find_mirror()
    if url is None:
        raise ProviderError("simbad", "name resolution unavailable: " + "; ".join(errors))
    variants = [name.strip(), name.strip().upper(), " ".join(name.split()), "NAME " + name.strip()]
    for v in dict.fromkeys(variants):
        adql = f"SELECT TOP 1 b.ra, b.dec, b.main_id, b.otype FROM basic AS b JOIN ident AS i ON b.oid = i.oidref WHERE i.id = '{v.replace(chr(39), '')}'"
        f = await fetch("simbad", url, params=_params(adql), ttl=30 * 86400, retries=0)
        rows = f.data.get("data") or []
        if rows and rows[0][0] is not None:
            r_ra, r_dec, main_id, otype = rows[0]
            k = kind or ("star" if str(otype).startswith(("*", "Star", "PM", "V*", "SB")) else "deepsky")
            return Target(str(main_id), k, ra=float(r_ra), dec=float(r_dec), note=f"SIMBAD {otype}", source="simbad"), f.provenance
    raise ValueError(f"SIMBAD does not know {name!r}; try another spelling (e.g. 'M 31', 'NGC 7000') or give RA/Dec")
