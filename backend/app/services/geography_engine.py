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
