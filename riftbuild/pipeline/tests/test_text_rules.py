from riftbuild_pipeline.normalize.names import restore_casing
from riftbuild_pipeline.normalize.text_rules import damage_profile, find_cc, find_damage_types, find_tags


def values(matches) -> set[str]:
    return {m.value for m in matches}


def test_cc_detection_on_real_style_sentences() -> None:
    amumu_q = "Amumu throws a bandage that deals magic damage to the first enemy hit, stunning them for 1 second."
    assert "stun" in values(find_cc(amumu_q))
    mel_e = "Enemies hit by the orb are dealt magic damage and rooted for 1.5 seconds."
    assert "root" in values(find_cc(mel_e))
    knock = "Volibear slams down, knocking up enemies."
    assert "airborne" in values(find_cc(knock))


def test_cc_applied_to_the_champion_is_not_theirs() -> None:
    text = "If Volibear becomes immobilized or polymorphed by an enemy during Thundering Smash, it ends."
    assert not values(find_cc(text)) & {"root", "polymorph"}
    assert "ground" not in values(find_cc("Slams the ground, dealing damage."))
    assert "ground" in values(find_cc("Throws a vial on the ground, slowing and grounding enemies."))
    assert "ground" in values(find_cc("If a dash is stopped, the enemy is slowed and grounded."))
    for condition in [
        "Akali will not flip backwards if she is immobilized or grounded during the cast time.",
        "The dash fails if Akshan is moved, or becomes immobilized, grounded, or polymorphed during this time.",
        "Magical Journey cannot be taken while immobilized or grounded.",
        "Yasuo will be knocked down by any immobilizing or polymorphing crowd control during the dash.",
        "Bonus ends early if Kayn performs a basic attack or becomes immobilized or polymorphed.",
    ]:
        assert not values(find_cc(condition)) & {"ground", "root", "polymorph"}, condition
    assert "sleep" in values(find_cc("Causes the target to become drowsy, then fall asleep."))


def test_negated_cc_is_ignored() -> None:
    assert "slow" not in values(find_cc("Becomes immune to slows for 2 seconds."))
    assert "stun" not in values(find_cc("Cleanses all stuns and roots."))


def test_tags_and_heal_false_positive() -> None:
    mel_w = (
        "Mel forms a protective barrier, becoming invulnerable to non-turret damage. All hostile projectiles "
        "that collide with the barrier will be destroyed instantly."
    )
    tags = values(find_tags(mel_w))
    assert {"invulnerability", "projectile_reflect"} <= tags
    assert "heal" not in values(find_tags("Inflicts 40% Grievous Wounds, reducing healing."))
    assert "heal" in values(find_tags("Soraka heals an allied champion."))


def test_damage_types_from_labels_and_text() -> None:
    assert find_damage_types(["Magic Damage", ":"], "") == ["magic"]
    assert find_damage_types(["Physical Damage Reduction"], "") == []
    assert find_damage_types([], "deals bonus true damage") == ["true"]


def test_damage_profile_normalizes() -> None:
    profile = damage_profile([("Q", ["magic"]), ("R", ["magic"]), ("E", ["physical"])], ["mage"])
    assert abs(sum(profile.values()) - 1) < 0.011
    assert profile["magic"] > profile["physical"]
    assert damage_profile([], []) is None


def test_pt_casing() -> None:
    assert restore_casing("KAI'SA", "Kai'Sa") == "Kai'Sa"
    assert restore_casing("BARDO", "Bard") == "Bardo"
    assert restore_casing("NUNU E WILLUMP", "Nunu & Willump") == "Nunu e Willump"
    assert restore_casing("DR. MUNDO", "Dr. Mundo") == "Dr. Mundo"
