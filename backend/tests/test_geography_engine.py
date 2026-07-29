from app.services.geography_engine import get_layer_info


def test_known_layer_returns_info():
    layer = get_layer_info("crust")
    assert layer is not None
    assert layer.name == "Земная кора"


def test_all_four_layers_are_defined():
    for key in ("crust", "mantle", "outer_core", "inner_core"):
        assert get_layer_info(key) is not None


def test_unknown_layer_returns_none():
    assert get_layer_info("atmosphere") is None
