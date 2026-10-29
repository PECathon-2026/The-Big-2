"""Traditional lunisolar calendar (旧暦): lunar months from true new moons, the 24 sekki from the Sun's ecliptic
longitude in 15° steps, and the 72 kō (micro-seasons) in 5° steps. Everything is computed; nothing is tabulated by date.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import astronomy as ae
from pydantic import BaseModel

from ..core import astro
from .moon import moon_name

SEKKI = [
    (315, "立春", "Risshun", "Beginning of spring"), (330, "雨水", "Usui", "Rainwater"), (345, "啓蟄", "Keichitsu", "Insects awaken"),
    (0, "春分", "Shunbun", "Spring equinox"), (15, "清明", "Seimei", "Pure and clear"), (30, "穀雨", "Kokuu", "Grain rains"),
    (45, "立夏", "Rikka", "Beginning of summer"), (60, "小満", "Shōman", "Lesser ripening"), (75, "芒種", "Bōshu", "Grain beards and seeds"),
    (90, "夏至", "Geshi", "Summer solstice"), (105, "小暑", "Shōsho", "Lesser heat"), (120, "大暑", "Taisho", "Greater heat"),
    (135, "立秋", "Risshū", "Beginning of autumn"), (150, "処暑", "Shosho", "Manageable heat"), (165, "白露", "Hakuro", "White dew"),
    (180, "秋分", "Shūbun", "Autumn equinox"), (195, "寒露", "Kanro", "Cold dew"), (210, "霜降", "Sōkō", "Frost falls"),
    (225, "立冬", "Rittō", "Beginning of winter"), (240, "小雪", "Shōsetsu", "Lesser snow"), (255, "大雪", "Taisetsu", "Greater snow"),
    (270, "冬至", "Tōji", "Winter solstice"), (285, "小寒", "Shōkan", "Lesser cold"), (300, "大寒", "Daikan", "Greater cold"),
]

# 72 kō, three per sekki, in sekki order starting at Risshun (315°). Japanese (Meiji) version.
KO = [
    ("東風解凍", "East wind melts the ice"), ("黄鶯睍睆", "Bush warblers start singing"), ("魚上氷", "Fish emerge from the ice"),
    ("土脉潤起", "Rain moistens the soil"), ("霞始靆", "Mist starts to linger"), ("草木萌動", "Grass sprouts, trees bud"),
    ("蟄虫啓戸", "Hibernating insects surface"), ("桃始笑", "First peach blossoms"), ("菜虫化蝶", "Caterpillars become butterflies"),
    ("雀始巣", "Sparrows start to nest"), ("桜始開", "First cherry blossoms"), ("雷乃発声", "Distant thunder"),
    ("玄鳥至", "Swallows return"), ("鴻雁北", "Wild geese fly north"), ("虹始見", "First rainbows"),
    ("葭始生", "First reeds sprout"), ("霜止出苗", "Last frost, rice seedlings grow"), ("牡丹華", "Peonies bloom"),
    ("蛙始鳴", "Frogs start singing"), ("蚯蚓出", "Worms surface"), ("竹笋生", "Bamboo shoots sprout"),
    ("蚕起食桑", "Silkworms start feasting on mulberry"), ("紅花栄", "Safflowers bloom"), ("麦秋至", "Wheat ripens"),
    ("螳螂生", "Praying mantises hatch"), ("腐草為蛍", "Rotten grass becomes fireflies"), ("梅子黄", "Plums turn yellow"),
    ("乃東枯", "Self-heal withers"), ("菖蒲華", "Irises bloom"), ("半夏生", "Crow-dipper sprouts"),
    ("温風至", "Warm winds blow"), ("蓮始開", "First lotus blossoms"), ("鷹乃学習", "Hawks learn to fly"),
    ("桐始結花", "Paulownia trees produce seeds"), ("土潤溽暑", "Earth is damp, air is humid"), ("大雨時行", "Great rains sometimes fall"),
    ("涼風至", "Cool winds blow"), ("寒蝉鳴", "Evening cicadas sing"), ("蒙霧升降", "Thick fog descends"),
    ("綿柎開", "Cotton flowers bloom"), ("天地始粛", "Heat starts to die down"), ("禾乃登", "Rice ripens"),
    ("草露白", "Dew glistens white on grass"), ("鶺鴒鳴", "Wagtails sing"), ("玄鳥去", "Swallows leave"),
    ("雷乃収声", "Thunder ceases"), ("蟄虫坏戸", "Insects hole up underground"), ("水始涸", "Farmers drain the fields"),
    ("鴻雁来", "Wild geese return"), ("菊花開", "Chrysanthemums bloom"), ("蟋蟀在戸", "Crickets chirp around the door"),
    ("霜始降", "First frost"), ("霎時施", "Light rains sometimes fall"), ("楓蔦黄", "Maple leaves and ivy turn yellow"),
    ("山茶始開", "Camellias bloom"), ("地始凍", "Land starts to freeze"), ("金盞香", "Daffodils bloom"),
    ("虹蔵不見", "Rainbows hide"), ("朔風払葉", "North wind blows the leaves from the trees"), ("橘始黄", "Tachibana citrus turns yellow"),
    ("閉塞成冬", "Cold sets in, winter begins"), ("熊蟄穴", "Bears start hibernating"), ("鱖魚群", "Salmon gather and swim upstream"),
    ("乃東生", "Self-heal sprouts"), ("麋角解", "Deer shed antlers"), ("雪下出麦", "Wheat sprouts under snow"),
    ("芹乃栄", "Parsley flourishes"), ("水泉動", "Springs thaw"), ("雉始雊", "Pheasants start to call"),
    ("款冬華", "Butterburs bud"), ("水沢腹堅", "Ice thickens on streams"), ("鶏始乳", "Hens start laying eggs"),
]


def sun_longitude(dt: datetime) -> float:
    return ae.SunPosition(astro.to_time(dt)).elon % 360


def sekki_for(dt: datetime) -> dict:
    lon = sun_longitude(dt)
    rel = (lon - 315) % 360  # degrees since Risshun
    idx = int(rel // 15)
    ko_idx = int(rel // 5)
    deg, kanji, romaji, meaning = SEKKI[idx]
    ko_kanji, ko_meaning = KO[ko_idx]
    return {
        "sun_longitude": round(lon, 3),
        "sekki": {"kanji": kanji, "romaji": romaji, "meaning": meaning, "index": idx + 1},
        "ko": {"kanji": ko_kanji, "meaning": ko_meaning, "index": ko_idx + 1},
    }


class CalendarDay(BaseModel):
    date: str
    weekday: int
    moon_age: float
    illumination: float
    phase_deg: float
    moon_name: dict
    lunar_month: int
    lunar_day: int
    sekki: dict
    ko: dict
    is_new_moon: bool
    is_full_moon: bool
    is_today: bool


class LunarCalendar(BaseModel):
    year: int
    month: int
    timezone: str
    days: list[CalendarDay]
    lunar_months: list[dict]
    note: str


def lunar_month_number(new_moon: datetime) -> int:
    """Traditional rule (simplified): the lunar month containing the winter solstice is month 11; count from there.

    We approximate by counting new moons since the month holding the previous winter solstice (Sun longitude 270°).
    """
    t = astro.to_time(new_moon)
    sol = ae.SearchSunLongitude(270.0, t.AddDays(-400), 400)
    if sol is None:
        return 1
    # new moon on/before the solstice
    nm = ae.SearchMoonPhase(0.0, sol.AddDays(-30), 31)
    n = 0
    cur = nm
    while cur is not None and cur.ut < t.ut - 1:
        nxt = ae.SearchMoonPhase(0.0, cur.AddDays(1), 35)
        if nxt is None or nxt.ut > t.ut + 1:
            break
        cur = nxt
        n += 1
    return ((11 + n - 1) % 12) + 1


def month_calendar(lat: float, lon: float, year: int, month: int) -> LunarCalendar:
    zone = astro.tz(lat, lon)
    today = datetime.now(zone).date()
    first = datetime(year, month, 1, 21, 0, tzinfo=zone)  # evaluate each day at 21:00 local (the observing hour)
    days: list[CalendarDay] = []
    d = first
    # collect new moons from before the month start
    nm_t = ae.SearchMoonPhase(0.0, astro.to_time(first - timedelta(days=31)), 32)
    new_moons: list[datetime] = []
    cur = nm_t
    while cur is not None and astro.from_time(cur) < first + timedelta(days=40):
        new_moons.append(astro.from_time(cur))
        cur = ae.SearchMoonPhase(0.0, cur.AddDays(1), 35)
    months = [{"new_moon": nm, "number": lunar_month_number(nm)} for nm in new_moons]
    while d.month == month:
        du = d.astimezone(timezone.utc)
        age = astro.moon_age_days(du)
        ph = ae.MoonPhase(astro.to_time(du))
        ill = astro.moon_illumination(du)
        lm = max((m for m in months if m["new_moon"] <= du), key=lambda m: m["new_moon"], default=months[0])
        lunar_day = int((du - lm["new_moon"]).total_seconds() // 86400) + 1
        sk = sekki_for(du)
        days.append(
            CalendarDay(
                date=d.date().isoformat(),
                weekday=d.weekday(),
                moon_age=round(age, 2),
                illumination=round(ill, 3),
                phase_deg=round(ph, 1),
                moon_name=moon_name(age),
                lunar_month=lm["number"],
                lunar_day=lunar_day,
                sekki=sk["sekki"],
                ko=sk["ko"],
                is_new_moon=age < 1.0,
                is_full_moon=abs(ph - 180) < 6.1,
                is_today=d.date() == today,
            )
        )
        d += timedelta(days=1)
    return LunarCalendar(
        year=year,
        month=month,
        timezone=astro.tz_name(lat, lon),
        days=days,
        lunar_months=[{"new_moon": m["new_moon"], "number": m["number"]} for m in months],
        note="Lunar months begin at the true new moon; month numbers follow the winter-solstice rule (simplified, no leap-month insertion). Sekki and kō from the Sun's apparent ecliptic longitude.",
    )
