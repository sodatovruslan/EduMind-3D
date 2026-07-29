from app.services.geography_engine import classify_continent, get_continent_info, get_layer_info


def test_known_layer_returns_info():
    layer = get_layer_info("crust")
    assert layer is not None
    assert layer.name == "Земная кора"


def test_all_four_layers_are_defined():
    for key in ("crust", "mantle", "outer_core", "inner_core"):
        assert get_layer_info(key) is not None


def test_unknown_layer_returns_none():
    assert get_layer_info("atmosphere") is None


def test_classify_continent_known_points():
    # Москва, Каир, Нью-Йорк, Сидней, Южный полюс
    assert classify_continent(55.75, 37.6) == "europe"
    assert classify_continent(30.0, 31.2) == "africa"
    assert classify_continent(40.7, -74.0) == "north_america"
    assert classify_continent(-33.9, 151.2) == "oceania"
    assert classify_continent(-89.0, 0.0) == "antarctica"


def test_classify_continent_open_ocean_returns_none():
    assert classify_continent(0.0, -140.0) is None  # середина Тихого океана


def test_all_seven_continents_are_defined():
    for key in ("africa", "asia", "north_america", "south_america", "europe", "oceania", "antarctica"):
        assert get_continent_info(key) is not None
