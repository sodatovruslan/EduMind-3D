"""
Геологическое ядро GeoWorld: справочные данные по внутреннему строению
Земли (кора, мантия, внешнее и внутреннее ядро) для разреза 3D-глобуса.

Числа — общепринятые школьные приближения (глубина/температура из
геофизических моделей типа PREM), не претендуют на исследовательскую
точность, но достаточны для образовательной 3D-демонстрации.
"""
from dataclasses import dataclass

LayerKey = str


@dataclass(frozen=True)
class EarthLayer:
    name: str
    depth_km: str
    temperature_c: str
    state: str
    composition: str


EARTH_LAYERS: dict[LayerKey, EarthLayer] = {
    "crust": EarthLayer(
        name="Земная кора",
        depth_km="0–35",
        temperature_c="0–1000",
        state="твердое",
        composition="Базальт (океаническая), гранит (континентальная)",
    ),
    "mantle": EarthLayer(
        name="Мантия",
        depth_km="35–2890",
        temperature_c="1000–3700",
        state="пластичное твердое вещество (медленная конвекция)",
        composition="Силикаты железа и магния (перидотит)",
    ),
    "outer_core": EarthLayer(
        name="Внешнее ядро",
        depth_km="2890–5150",
        temperature_c="3700–5200",
        state="жидкое",
        composition="Железо и никель — конвекция создает магнитное поле Земли",
    ),
    "inner_core": EarthLayer(
        name="Внутреннее ядро",
        depth_km="5150–6371",
        temperature_c="5200–6000",
        state="твердое (несмотря на температуру — из-за огромного давления)",
        composition="Железо и никель",
    ),
}


def get_layer_info(layer: str) -> EarthLayer | None:
    """Справочная информация о слое Земли или None, если слой неизвестен."""
    return EARTH_LAYERS.get(layer)


@dataclass(frozen=True)
class ContinentInfo:
    name: str
    area_million_km2: float
    population_millions: int
    fact: str


CONTINENTS: dict[str, ContinentInfo] = {
    "africa": ContinentInfo(
        name="Африка",
        area_million_km2=30.4,
        population_millions=1460,
        fact="Самый жаркий континент; здесь протекает Нил — самая длинная река в мире.",
    ),
    "asia": ContinentInfo(
        name="Азия",
        area_million_km2=44.6,
        population_millions=4700,
        fact="Самый большой и населенный континент; здесь находится Эверест — высочайшая точка Земли.",
    ),
    "north_america": ContinentInfo(
        name="Северная Америка",
        area_million_km2=24.7,
        population_millions=600,
        fact="Простирается от Арктики до тропиков; включает Великие озера — крупнейшую систему пресной воды.",
    ),
    "south_america": ContinentInfo(
        name="Южная Америка",
        area_million_km2=17.8,
        population_millions=430,
        fact="Здесь находится Амазония — крупнейший тропический лес планеты.",
    ),
    "europe": ContinentInfo(
        name="Европа",
        area_million_km2=10.2,
        population_millions=750,
        fact="Самый густонаселенный континент относительно площади; более 40 стран.",
    ),
    "oceania": ContinentInfo(
        name="Океания",
        area_million_km2=8.5,
        population_millions=44,
        fact="Включает Австралию и тысячи островов Тихого океана.",
    ),
    "antarctica": ContinentInfo(
        name="Антарктида",
        area_million_km2=14.2,
        population_millions=0,
        fact="Самый холодный континент; постоянного населения нет — только научные станции.",
    ),
}


def classify_continent(lat: float, lng: float) -> str | None:
    """
    Приблизительная классификация континента по широте/долготе через
    грубые прямоугольные bounding box'ы — не точные береговые линии
    (это не GIS-сервис), но достаточно для образовательной 3D-демонстрации.
    Возвращает None, если точка попадает в океан между границами.
    """
    if lat <= -60:
        return "antarctica"
    if -50 <= lat <= -10 and 110 <= lng <= 180:
        return "oceania"
    if -60 <= lat <= 13 and -82 <= lng <= -34:
        return "south_america"
    if 7 <= lat <= 83 and -170 <= lng <= -52:
        return "north_america"
    if -35 <= lat <= 37 and -18 <= lng <= 52:
        return "africa"
    if 36 <= lat <= 71 and -25 <= lng <= 40:
        return "europe"
    if -10 <= lat <= 81 and 40 <= lng <= 180:
        return "asia"
    return None


def get_continent_info(key: str) -> ContinentInfo | None:
    """Справочная информация о континенте или None, если ключ неизвестен."""
    return CONTINENTS.get(key)


# порог аномалии глобальной температуры (°C сверх нормы), после которого
# в сценарии считаем, что таяние горных ледников вызывает сход селя —
# упрощенная образовательная модель, не настоящий гидрологический расчет
CLIMATE_THRESHOLD_C = 3.0


@dataclass(frozen=True)
class ClimateEvent:
    location: str
    phenomenon: str
    description: str


def evaluate_climate_scenario(temperature_anomaly: float) -> ClimateEvent | None:
    """
    Сценарий "таяние ледников -> сель": при аномалии потепления выше
    CLIMATE_THRESHOLD_C возвращает событие схода селя в горах Памира
    (реальная природная угроза для Центральной Азии), иначе None.
    """
    if temperature_anomaly < CLIMATE_THRESHOLD_C:
        return None
    return ClimateEvent(
        location="Памир, Таджикистан",
        phenomenon="Сель",
        description=(
            "Из-за ускоренного таяния горных ледников вода переполнила русла рек и "
            "увлекла за собой камни и грунт — сошёл сель. Это одна из главных природных "
            "угроз в горных регионах Центральной Азии при потеплении климата."
        ),
    )
