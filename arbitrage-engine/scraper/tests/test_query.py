"""Unit tests for the eBay comp-query builder — the lever that finds (or misses) comps."""
from src.models import ScrapedItem
from src.query import build_comp_query


def item(title, model=None, brand=None):
    return ScrapedItem(source="t", url="https://x/y", title=title, ask_price=1,
                       model_number=model, brand=brand)


def test_strips_lot_number_and_filler():
    q = build_comp_query(item("ONE LEBLOND REGAL LATHE - SOLD AS IS - 671"))
    assert q.lower() == "leblond regal lathe"


def test_keeps_model_from_title_and_drops_separator():
    q = build_comp_query(item("BRAKE LATHE ~ MR-25-3", model="MR-25-3"))
    assert q.lower() == "brake lathe mr-25-3"


def test_prepends_brand_when_missing_from_title():
    q = build_comp_query(item("HL600 60Qt Mixer", model="HL600", brand="Hobart"))
    assert q.lower().startswith("hobart")
    assert "hl600" in q.lower()


def test_appends_model_when_absent_from_title():
    q = build_comp_query(item("Refrigerated Centrifuge", model="ST 16R", brand="Thermo"))
    assert q.lower() == "thermo refrigerated centrifuge st 16r"


def test_strips_for_parts_and_hash_lot():
    q = build_comp_query(item("Lathe #4451 for parts or repair"))
    assert q.lower() == "lathe"


def test_caps_length():
    long = "Super Heavy Industrial Commercial Grade Precision Machine Tool Apparatus Device Unit"
    assert len(build_comp_query(item(long)).split()) <= 9


def test_falls_back_to_model_when_title_is_all_noise():
    q = build_comp_query(item("USED AS-IS LOT", model="QM-46-2"))
    assert q == "QM-46-2"
