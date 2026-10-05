#!/usr/bin/env python3
"""Erzeugt die Datendateien des Once-Human-Build-Planers (planner/data/*.json).

Quellen (alle öffentlich, Spielwerte = Fakten, keine Codeübernahme):
  * OHDB-Export (oncehumandb.com, "aus den Spieldateien extrahiert"), gespiegelt im
    GitHub-Repo saitoh183/once-human-build-planner: Waffen, Rüstung, Mods, Deviants,
    Cradle-Overrides, Kalibrierungen, Essen.
  * meta-builds.net-Snapshot (Spielversion 3.0.5, 24.09.2026), gespiegelt im Repo
    josephfmmarzin-ai/ONCE_HUMAN: Waffen-Statprofile (Crit, Weakspot, Magazin, Pellets,
    Nachladen), Rüstungs-Grundwerte (HP / Psi / Pollution je Slot und Seltenheit),
    Set-Boni, Effekttexte, Kalibrierungseffekte.
  * Hand gepflegte Tabellen in diesem Skript (Sternkurven, Essen, Deviant-Werte,
    Suffix-Werte) mit Quellenangabe und Verifizierungsstatus.

Aufruf:
    python3 tools/build_planner_data.py                 # lädt Quellen von GitHub (raw)
    python3 tools/build_planner_data.py --ohdb DIR --mb DIR   # lokale Kopien der Repos

Die erzeugten Dateien werden eingecheckt; das Skript dient zum Aktualisieren.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "planner" / "data"

OHDB_RAW = "https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/"
MB_RAW = "https://raw.githubusercontent.com/josephfmmarzin-ai/ONCE_HUMAN/main/data/"

SNAPSHOT_DATE = "2026-09-25"
GAME_VERSION = "3.0.5"

# --------------------------------------------------------------------------------------
# Hand gepflegte Tabellen
# --------------------------------------------------------------------------------------

# Sternkurve (Blueprint Enhancement). Multiplikator auf DMG (Waffe) bzw. HP + Psi (Rüstung).
# Abgeleitet aus den Fandom-Wiki-Tabellen (Lonewolf Jacket 1924→2020→…→2405,
# Heavy Duty Helmet 666→706→739→779→813, Raid Helmet 592→628→669→704) und
# Ultra Force 264→330 (wikily). Standard-Kurve (3 Sterne) ist geschätzt.
STAR_CURVES = {
    "legendary": [1.00, 1.05, 1.10, 1.15, 1.20, 1.25],
    "epic": [1.00, 1.06, 1.11, 1.17, 1.22],
    "rare": [1.00, 1.06, 1.13, 1.19],
    "uncommon": [1.00, 1.07, 1.13],
    "common": [1.00],
}
STAR_CURVE_STATUS = {
    "legendary": "verified-wiki",
    "epic": "verified-wiki (HP), Psi-Spalte weicht bei Stern 4 um 2 Punkte ab",
    "rare": "verified-wiki",
    "uncommon": "estimated",
    "common": "n/a",
}

# Rüstungs-Grundwerte Tier V, Stern 1 (HP, Psi, Pollution) je Slot und Seltenheit.
# HP + Pollution: meta-builds-Snapshot (Fandom-Wiki-Werte liegen ~2 HP darüber).
# Psi: meta-builds-Wert / 1.25 (meta-builds listet die 6-Sterne-Psi), stimmt mit den
# Fandom-Tabellen überein (Shelterer Hat 92, Heavy Duty Helmet 83, Raid Helmet 74).
ARMOR_BASE = {
    "legendary": {"Helmet": (738, 92, 21), "Mask": (369, 115, 28), "Top": (1918, 63, 28),
                  "Gloves": (1106, 69, 21), "Bottoms": (1770, 75, 21), "Shoes": (1475, 46, 21)},
    "epic": {"Helmet": (664, 83, 21), "Mask": (331, 107, 28), "Top": (1721, 59, 28),
             "Gloves": (995, 65, 21), "Bottoms": (1598, 71, 21), "Shoes": (1328, 42, 21)},
    "rare": {"Helmet": (590, 74, 21), "Mask": (295, 91, 28), "Top": (1536, 51, 28),
             "Gloves": (885, 57, 21), "Bottoms": (1414, 57, 21), "Shoes": (1180, 34, 21)},
    "uncommon": {"Helmet": (516, 64, 21), "Mask": (258, 81, 28), "Top": (1340, 47, 28),
                 "Gloves": (774, 52, 21), "Bottoms": (1241, 52, 21), "Shoes": (1032, 35, 21)},
}
ARMOR_BASE["common"] = ARMOR_BASE["uncommon"]

MAX_STARS = {"common": 1, "uncommon": 3, "rare": 4, "epic": 5, "legendary": 6}

# Waffen-Tier (Blueprint Tier I..V). OHDB / meta-builds listen den Attack von Tier IV
# (SOCR Last Valor 174, KVD Boom! Boom! 168, DE.50 Jaws 494); die Fandom-Tabellen nennen
# SOCR 45/70/111/174/264, KVD 44/67/108/168/255, Jaws T5 751. Faktoren relativ zu Tier IV:
TIER_CURVE = [0.26, 0.40, 0.64, 1.00, 1.52]
TIER_STATUS = "Tier IV = Datenbasis (OHDB). Tier V = ×1.52 (±1 Attack, drei Waffen geprüft), Tier I–III gerundet."
WEAPON_DATA_TIER = 4

# Essen / Getränke mit Kampfwirkung. Quelle: Steam-Guide "All about Food", Fandom
# "Buffs and Effects", game8. Dauer 1800 s. "cond" = Bedingung (im Planer schaltbar).
FOOD = [
    {"id": "shattered-bread", "name": "Shattered Bread", "kind": "food",
     "effect": "Weapon Pro: Weapon DMG +25%", "stats": {"weaponDmg": 25}, "status": "verified"},
    {"id": "stargazy-pie", "name": "Stargazy Pie", "kind": "food",
     "effect": "Full Stomach: Crit DMG +25% solange Energie voll", "stats": {"critDmg": 25},
     "cond": "Energie voll", "status": "verified"},
    {"id": "assorted-canned-fruit", "name": "Assorted Canned Fruit", "kind": "food",
     "effect": "Cool Head: Weakspot DMG +25% solange Sanity > 80%", "stats": {"weakspotDmg": 25},
     "cond": "Sanity über 80%", "status": "verified"},
    {"id": "whimsical-drink", "name": "Whimsical Drink", "kind": "drink",
     "effect": "Status Enhancement: Status DMG +25% (eine Quelle nennt stattdessen Psi Intensity +30%)", "stats": {"statusDmg": 25}, "status": "verified"},
    {"id": "shellfish-dish", "name": "Gericht mit Shellfish Meat", "kind": "food",
     "effect": "Getroffene Ziele erhalten 10 s lang +5% Schaden (Verwundbarkeit)", "stats": {"vulnerability": 5}, "status": "community"},
    {"id": "honey-glazed-meat", "name": "Honey Glazed Meat", "kind": "food",
     "effect": "Chillbreaker: Crit Rate +15% gegen Ziele im Frost Vortex", "stats": {"critRate": 15},
     "cond": "Ziel im Frost Vortex", "status": "verified"},
    {"id": "stardust-pumpkin-salad", "name": "Stardust Pumpkin Salad", "kind": "food",
     "effect": "Crit DMG +15% (laut Fandom-Wiki stattdessen Swiftfooted / Bewegung – unsicher)", "stats": {"critDmg": 15}, "status": "estimated"},
    {"id": "bone-in-deviated-sausage", "name": "Bone-in Deviated Sausage", "kind": "food",
     "effect": "DMG gegen Bosse +15%", "stats": {"dmgVsBoss": 15}, "status": "community"},
    {"id": "french-fries", "name": "French Fries", "kind": "food",
     "effect": "Weapon DMG +20% während Fortress Warfare", "stats": {"weaponDmg": 20},
     "cond": "Fortress Warfare aktiv", "keyword": "Fortress Warfare", "status": "community"},
    {"id": "mixed-fried-hot-dog", "name": "Mixed Fried Hot Dog", "kind": "food",
     "effect": "DMG +20% gegen Ziele mit The Bull's Eye", "stats": {"dmgVsMarked": 20},
     "cond": "Ziel mit Bull's Eye markiert", "keyword": "The Bull's Eye", "status": "community"},
    {"id": "canned-meat", "name": "Canned Meat / Ginger Poppers", "kind": "food",
     "effect": "Shrapnel DMG +10%", "stats": {"keywordDmg": 10}, "keyword": "Shrapnel", "status": "community"},
    {"id": "sparkling-pumpkin-soup", "name": "Sparkling Pumpkin Soup", "kind": "food",
     "effect": "Power Surge DMG +10%", "stats": {"keywordDmg": 10}, "keyword": "Power Surge", "status": "community"},
    {"id": "pure-meat-dish", "name": "Reines Fleisch (Pure Meat, je Keyword)", "kind": "food",
     "effect": "Keyword DMG +3% (Pure Bear = Shrapnel, Pure Poultry = Bounce, Venison = Bull's Eye, Hare = Fast Gunner, Fine Turtle = Fortress Warfare, Pure Goat = Burn, Pure Crocodile = Power Surge, Pure Beef = Frost Vortex, Pure Pork = Unstable Bomber)",
     "stats": {"keywordDmg": 3}, "status": "community"},
    {"id": "borscht-deluxe", "name": "Borscht Deluxe", "kind": "food",
     "effect": "Max HP +10%", "stats": {"hpPct": 10}, "status": "community"},
    {"id": "taco-bear", "name": "Taco (Bear Meat)", "kind": "food",
     "effect": "Max HP +100", "stats": {"hpFlat": 100}, "status": "community"},
    {"id": "pristine-pork", "name": "Gericht mit Pristine Pork", "kind": "food",
     "effect": "Max HP +15%", "stats": {"hpPct": 15}, "status": "community"},
    {"id": "barracuda", "name": "Gericht mit Barracuda", "kind": "food",
     "effect": "Psi Intensity +5%", "stats": {"psiPct": 5}, "status": "community"},
    {"id": "signature-ice-brew", "name": "Signature Ice Brew", "kind": "drink",
     "effect": "Pollution Resist +30%", "stats": {"pollutionPct": 30}, "status": "community"},
    {"id": "chilled-icemelon-soup", "name": "Chilled Icemelon Soup", "kind": "food",
     "effect": "Pollution Resist +20%", "stats": {"pollutionPct": 20}, "status": "community"},
    {"id": "malt-ale", "name": "Malt Ale", "kind": "drink",
     "effect": "Sanity-Regeneration, Pollution-Immunität 30 min (kein Statwert)", "stats": {}, "status": "community"},
]

# Kampf-Deviants mit messbarem Build-Effekt. Werte je Stufe (Index 0 = Stufe 1).
DEVIANT_BUFFS = {
    "lonewolfs-whisper": {"stat": "weaponDmg", "levels": [16.2, 21.6, 27.0, 32.4, 37.8],
                          "note": "Erhöht den Weapon DMG, den das angegriffene Ziel erhält (theriagames, Werte je Stufe). Varianten (Lunar Oracle, Radiant) nennen 18.75/25/31.25/37.5/43.75%.",
                          "status": "community"},
    "butterflys-emissary": {"stat": "weakspotDmg", "levels": [25, 30, 35],
                            "note": "Markiert den Weakspot: +25/30/35% Weakspot DMG für 5 s.", "status": "community"},
    "mini-feaster": {"stat": "weaponDmg", "levels": [70],
                     "note": "+17% Weapon DMG je Tentakel, max. 70% (bei Bounce-Builds praktisch dauerhaft).",
                     "status": "community", "cond": "Tentakel aktiv (Bounce)"},
    "pyro-dino": {"stat": "elementalDmg", "element": "Blaze", "levels": [24.5],
                  "note": "Ziel erhält +24.5% Blaze DMG; Explosion auf brennende Ziele.", "status": "community"},
    "mr-wish": {"stat": "dmgVsMarked", "levels": [8],
                "note": "Markiert Ziele mit The Bull's Eye; +8% DMG gegen markierte Ziele für 12 s (eine Quelle nennt zusätzlich Weakspot DMG +30% gegen markierte Ziele; ggf. manuell eintragen).", "status": "community"},
    "zapcam": {"stat": "weaponDmg", "levels": [21.6],
               "note": "Weapon-DMG-Buff analog Lonewolf's Whisper (Community-Wert, unverifiziert).", "status": "estimated"},
    "polar-jelly": {"stat": "elementalDmg", "element": "Frost", "levels": [36],
                    "note": "Getroffene Ziele erhalten +36% Frost DMG (Community-Wert).", "status": "community"},
    "snowsprite": {"stat": "elementalDmg", "element": "Frost", "levels": [20],
                   "note": "Frostkristalle erhöhen den erhaltenen Frost DMG (Wert geschätzt).", "status": "estimated"},
    "enchanting-void": {"stat": "meleeDmg", "levels": [100],
                        "note": "Midnight Maul: Nahkampf-DMG am Ziel +100% (nur Melee).", "status": "community"},
}

# Mod-Suffixe (Zweitattribut legendärer Mods). Community-Werte, im Planer editierbar.
MOD_SUFFIXES = {
    "General": {"weaponDmg": 2.4, "reload": 2}, "Violent": {"critDmg": 12}, "Precision": {"weakspotDmg": 7.2},
    "Deviant Energy": {"statusDmg": 8}, "Survival": {"hpPct": 4.8}, "Fury": {"weaponDmg": 5, "critDmg": 5},
    "Resistance": {"dmgReduction": 6}, "Battle": {"weaponDmg": 4, "critDmg": 4},
    "Mirror": {"weaponDmg": 4, "critDmg": 4}, "Wild": {"weaponDmg": 4, "critDmg": 4},
    "Downstar": {"weaponDmg": 3, "critDmg": 3}, "Aero": {"weaponDmg": 2, "critDmg": 2},
    "Resonance": {"statusDmg": 6}, "Resonance Deviant Energy": {"statusDmg": 8},
    "Mirror Deviant Energy": {"statusDmg": 6}, "Wild Deviant Energy": {"statusDmg": 6},
    "Downstar Deviant Energy": {"statusDmg": 5}, "Aero Deviant Energy": {"statusDmg": 3},
    "Lunar": {"critDmg": 8, "weaponDmg": 2}, "Lunar Deviant Energy": {"statusDmg": 6},
    "Crescent": {"critDmg": 6, "weaponDmg": 3}, "Crescent Deviant Energy": {"statusDmg": 5},
    "Phantasmal": {"weaponDmg": 4, "critDmg": 4}, "Phantasmal Deviant Energy": {"statusDmg": 6},
    "Shrapnel": {"keywordDmg": 8}, "Bounce": {"keywordDmg": 8}, "The Bull's Eye": {"keywordDmg": 8},
    "Fast Gunner": {"keywordDmg": 8}, "Fortress Warfare": {"keywordDmg": 8}, "Burn": {"keywordDmg": 8},
    "Power Surge": {"keywordDmg": 8}, "Frost Vortex": {"keywordDmg": 8}, "Unstable Bomber": {"keywordDmg": 8},
}

KEYWORDS = ["Shrapnel", "Bounce", "Burn", "Frost Vortex", "Power Surge", "Unstable Bomber",
            "The Bull's Eye", "Fortress Warfare", "Fast Gunner"]

# Keyword-Schadensformeln (Status-/Zusatzschaden). Quellen: Dev-Blog 23.11.2024 (Bounce 40%),
# sportskeeda / Fandom (Power Surge 50% Psi, Burn 10% Psi je 0.5 s, Frost Vortex 50% Psi je 0.5 s,
# Unstable Bomber 100% Psi), Waffentexte (Shrapnel 60% Attack).
KEYWORD_FORMULAS = {
    "Power Surge": {"base": "psi", "ratio": 0.50, "ticks": 1, "damageType": "status", "element": "Shock",
                    "desc": "Pro Auslösung 50% Psi Intensity als Status DMG (Shock)."},
    "Burn": {"base": "psi", "ratio": 0.10, "ticks": 12, "damageType": "status", "element": "Blaze",
             "desc": "Je Stack 10% Psi Intensity alle 0.5 s über 6 s (12 Ticks), bis 5 Stacks."},
    "Frost Vortex": {"base": "psi", "ratio": 0.50, "ticks": 8, "damageType": "status", "element": "Frost",
                     "desc": "50% Psi Intensity alle 0.5 s über 4 s (8 Ticks) im Wirbel."},
    "Unstable Bomber": {"base": "psi", "ratio": 1.20, "ticks": 1, "damageType": "status", "element": "Blast",
                        "desc": "Explosion mit 120% Psi Intensity als Status DMG (Fandom; andere Quellen nennen 100% oder 50%), kein Crit/Weakspot."},
    "Bounce": {"base": "attack", "ratio": 0.40, "ticks": 1, "damageType": "weapon", "element": None,
               "desc": "Jeder Bounce trifft mit 40% Attack als Weapon DMG (Dev-Blog 23.11.2024)."},
    "Shrapnel": {"base": "attack", "ratio": 0.60, "ticks": 1, "damageType": "weapon", "element": None,
                 "desc": "Shrapnel trifft ein anderes Körperteil mit 60% Attack (kann Crit/Weakspot)."},
    "The Bull's Eye": {"base": None, "desc": "Markierung: erhöht Weakspot-/DMG-Boni, kein eigener Schaden."},
    "Fortress Warfare": {"base": None, "desc": "Bonus bei stehendem Feuern; Werte stehen im Waffen-/Modtext."},
    "Fast Gunner": {"base": None, "desc": "Feuerraten-Stacks; Werte stehen im Waffen-/Modtext."},
}

# --------------------------------------------------------------------------------------
# Hilfsfunktionen
# --------------------------------------------------------------------------------------

def load_json(source: str | Path):
    if isinstance(source, Path) or not str(source).startswith("http"):
        return json.loads(Path(source).read_text(encoding="utf-8"))
    req = urllib.request.Request(str(source), headers={"User-Agent": "planner-data-build/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def strip_html(text: str | None) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"</li>\s*", "; ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("\r", "")
    text = re.sub(r"\s+", " ", text).strip(" ;")
    return text


def norm_name(name: str) -> str:
    return re.sub(r"\s+", " ", name or "").strip().lower()


def family_of(name: str) -> str:
    return name.split(" - ")[0].strip()


# Keyword-Präfixe, die aus einem globalen Stat einen Keyword-Stat machen ("Bounce Crit Rate +10%").
KW_PREFIX = r"(?<!Shrapnel )(?<!Bounce )(?<!Burn )(?<!Frost Vortex )(?<!Power Surge )(?<!Unstable Bomber )"

STAT_PATTERNS = [
    (KW_PREFIX + r"Crit Rate \+([\d.]+)%", "critRate"),
    (KW_PREFIX + r"Crit DMG \+([\d.]+)%", "critDmg"),
    (KW_PREFIX + r"Weakspot DMG \+([\d.]+)%", "weakspotDmg"),
    (r"Psi Intensity \+([\d.]+)%", "psiPct"),
    (r"Max HP \+([\d.]+)%", "hpPct"),
    (r"Magazine Capacity \+([\d.]+)%", "magazine"),
    (r"Reload Speed \+([\d.]+)%", "reload"),
    (r"Fire Rate \+([\d.]+)%", "fireRate"),
    (r"(?<!Melee )Attack \+([\d.]+)%", "attackPct"),
    (r"Attack -([\d.]+)%", "attackPct:neg"),
    (r"Fire Rate -([\d.]+)%", "fireRate:neg"),
    (r"Magazine Capacity -([\d.]+)%", "magazine:neg"),
    (r"Reload Speed -([\d.]+)%", "reload:neg"),
    (r"(Blaze|Frost|Shock|Blast) (?:Elemental )?DMG(?: bonus)? \+([\d.]+)%", "elemental"),
    (r"(?<!Blaze )(?<!Frost )(?<!Shock )(?<!Blast )Elemental DMG \+([\d.]+)%", "elementalAll"),
    (r"DMG (?:Bonus )?(?:against|to|vs\.?) (?:Boss(?:es)?|Boss Enemies) \+([\d.]+)%", "dmgVsBoss"),
    (r"DMG (?:Bonus )?(?:against|to|vs\.?) Elite(?: Enemies)? \+([\d.]+)%", "dmgVsElite"),
    (r"(Shrapnel|Bounce|Burn|Frost Vortex|Power Surge|Unstable Bomber|The Bull's Eye|Fortress Warfare|Fast Gunner) DMG \+([\d.]+)%", "keyword"),
    (r"Pollution Resist \+([\d.]+)", "pollutionFlat"),
    (r"(?:Vulnerability|DMG (?:taken|received)) \+([\d.]+)%", "vulnerability"),
]

# "Weapon DMG +10%", "Weapon and Status DMG +10%", "Melee, Weapon, Status DMG +10%", "+20% Melee, Weapon, and Status DMG",
# "Weapon DMG and Melee DMG +30%": jede genannte Schadensart bekommt den Wert genau einmal.
_DMG_LIST = r"((?:Melee|Weapon|Status)(?: DMG)?(?:,? (?:and )?(?:Melee|Weapon|Status)(?: DMG)?)*)"
COMBO_PATTERNS = [
    re.compile(r"(?<!Heavy )" + _DMG_LIST + r" DMG(?: Bonus)? \+([\d.]+)%", re.I),
    # "+4% Weapon DMG, capped at 20%" ist ein Stack-Zuwachs, kein Grundwert → nicht mitzählen
    re.compile(r"\+([\d.]+)% " + _DMG_LIST + r" DMG(?!,? (?:capped|up to))", re.I),
]
COMBO_KEYS = {"melee": "meleeDmg", "weapon": "weaponDmg", "status": "statusDmg"}

# Keyword-gebundene Crit-/Weakspot-Werte ("Shrapnel Crit DMG +35%") gelten nur für dieses Keyword.
KEYWORD_STAT_PATTERN = re.compile(
    r"(Shrapnel|Bounce|Burn|Frost Vortex|Power Surge|Unstable Bomber) (Crit Rate|Crit DMG|Weakspot DMG) \+([\d.]+)%", re.I)
KEYWORD_STAT_KEYS = {"crit rate": "critRate", "crit dmg": "critDmg", "weakspot dmg": "weakspotDmg"}

CONDITION_HINTS = re.compile(r"\b(when|while|after|if|upon|for every|each|per|stack|chance|within|during|below|above|killing|hitting|reload)\b", re.I)


def _blank(text: str, m: "re.Match") -> str:
    """Ersetzt einen bereits verarbeiteten Treffer durch Leerzeichen, damit kein anderes Muster ihn noch einmal zählt."""
    return text[: m.start()] + " " * (m.end() - m.start()) + text[m.end():]


def parse_stats(effect: str) -> dict:
    """Zieht einfache Prozentboni aus dem Effekttext. Alles, was an Bedingungen hängt, wird als
    conditional markiert (im Planer per Schalter aktivierbar)."""
    out: dict = {}
    text = effect or ""

    # 1. Kombinierte Schadensarten (Melee / Weapon / Status DMG)
    for i, pattern in enumerate(COMBO_PATTERNS):
        for m in list(pattern.finditer(text)):
            names, val = (m.group(1), m.group(2)) if i == 0 else (m.group(2), m.group(1))
            for part in re.split(r",? (?:and )?", names):
                key = COMBO_KEYS.get(part.replace(" DMG", "").strip().lower())
                if key:
                    out[key] = out.get(key, 0) + float(val)
            text = _blank(text, m)

    # 2. Keyword-gebundene Crit-/Weakspot-Werte
    for m in list(KEYWORD_STAT_PATTERN.finditer(text)):
        kw = next(k for k in KEYWORDS if k.lower() == m.group(1).lower())
        key = KEYWORD_STAT_KEYS[m.group(2).lower()]
        ks = out.setdefault("keywordStats", {}).setdefault(kw, {})
        ks[key] = ks.get(key, 0) + float(m.group(3))
        text = _blank(text, m)

    # 3. Einfache Muster
    for pattern, key in STAT_PATTERNS:
        for m in re.finditer(pattern, text, re.I):
            if key == "elemental":
                out.setdefault("elemental", {})[m.group(1).title()] = out.get("elemental", {}).get(m.group(1).title(), 0) + float(m.group(2))
            elif key == "keyword":
                out.setdefault("keyword", {})[m.group(1)] = out.get("keyword", {}).get(m.group(1), 0) + float(m.group(2))
            else:
                base, _, neg = key.partition(":")
                val = float(m.group(1)) * (-1 if neg else 1)
                out[base] = out.get(base, 0) + val
    return out


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")


def strip_variant(slug: str, variant: str | None) -> str:
    suffix = "-" + slugify(variant) if variant else ""
    return slug[: -len(suffix)] if suffix and slug.endswith(suffix) else slug


def parse_stacks(effect: str) -> int:
    m = re.search(r"(?:stack(?:ing|s)? (?:independently, )?up to|up to) (\d+) (?:stack|time)", effect or "", re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+) stack\(s\)", effect or "", re.I)
    return int(m.group(1)) if m else 1


def is_conditional(effect: str) -> bool:
    return bool(CONDITION_HINTS.search(effect or ""))


def detect_keyword(text: str) -> str | None:
    hits = [k for k in KEYWORDS if k.lower() in (text or "").lower()]
    if not hits:
        return None
    # Das häufigste / erste genannte Keyword gilt als Waffen-Keyword
    first = min(hits, key=lambda k: (text.lower().find(k.lower())))
    return first


# --------------------------------------------------------------------------------------
# Aufbau
# --------------------------------------------------------------------------------------

def build(ohdb: str, mb: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = lambda base, name: (Path(base) / name) if not base.startswith("http") else base + name

    weapons_src = load_json(src(ohdb, "weapons.json"))
    armor_src = load_json(src(ohdb, "armor.json"))
    mods_src = load_json(src(ohdb, "mods.json"))
    dev_src = load_json(src(ohdb, "deviations.json"))
    cradle_src = load_json(src(ohdb, "cradle.json"))
    all_data = load_json(src(mb, "metabuilds/allData.json"))
    gear_stats = load_json(src(mb, "metabuilds/gear_stats.json"))
    det_weapons = load_json(src(mb, "details/weapons.json"))
    det_armor = load_json(src(mb, "details/armor.json"))
    det_sets = load_json(src(mb, "details/sets.json"))
    det_devs = load_json(src(mb, "details/deviations.json"))

    gears_by_id = {str(g["id"]): g for g in all_data["gears"]}
    gear_by_name = {norm_name(g["title"]): g for g in all_data["gears"]}
    profile_by_name = {}
    for gid, prof in gear_stats["weapons"].items():
        g = gears_by_id.get(gid)
        if g:
            profile_by_name[norm_name(g["title"])] = prof

    # ---- Waffen -------------------------------------------------------------------
    weapons = []
    family_profiles: dict[str, dict] = {}
    for name, prof in profile_by_name.items():
        family_profiles.setdefault(family_of(name), prof)
    type_profiles: dict[str, dict] = {}
    for name, prof in profile_by_name.items():
        wtype = next((w["type"] for w in weapons_src if norm_name(w["name"]) == name), None)
        if wtype and prof.get("critRate") is not None:
            acc = type_profiles.setdefault(wtype, {"n": 0})
            acc["n"] += 1
            for k in ("critRate", "critDmg", "weakspotDmg", "mag", "pellets", "reloadSec"):
                if prof.get(k) is not None:
                    acc[k] = acc.get(k, 0) + prof[k]
    for wtype, acc in type_profiles.items():
        n = acc.pop("n")
        for k in list(acc):
            acc[k] = round(acc[k] / n, 2)
        acc["pellets"] = round(acc.get("pellets", 1))
        if "mag" in acc:
            acc["mag"] = round(acc["mag"])
    for w in weapons_src:
        if not w.get("damage"):
            continue
        key = norm_name(w["name"])
        prof = profile_by_name.get(key)
        prof_source = "meta-builds"
        if not prof:
            prof = family_profiles.get(family_of(key))
            prof_source = "family-estimate" if prof else "none"
        if not prof:
            prof = type_profiles.get(w["type"])
            prof_source = "type-estimate" if prof else "none"
        g = gear_by_name.get(key)
        effect = strip_html(g["description"]) if g and g.get("description") else ""
        if not effect:
            d = det_weapons.get(w["slug"]) or {}
            effect = d.get("effectEn") or d.get("effect") or ""
        rarity = w["rarity"]
        weapons.append(OrderedDict([
            ("id", w["slug"]), ("name", w["name"]), ("type", w["type"]), ("rarity", rarity),
            ("maxStars", MAX_STARS.get(rarity, 6)),
            ("damage", w["damage"]), ("damageTier", WEAPON_DATA_TIER), ("rpm", w.get("rpm")),
            ("mag", (prof or {}).get("mag")), ("pellets", (prof or {}).get("pellets") or 1),
            ("critRate", (prof or {}).get("critRate")), ("critDmg", (prof or {}).get("critDmg")),
            ("weakspotDmg", (prof or {}).get("weakspotDmg")), ("reloadSec", (prof or {}).get("reloadSec")),
            ("ammo", (prof or {}).get("ammo")),
            ("keyword", detect_keyword(effect)), ("effect", effect),
            ("profileSource", prof_source), ("damageSource", "ohdb"),
            ("image", w.get("imageUrl")), ("url", w.get("url")),
        ]))
    weapons.sort(key=lambda x: (x["type"], x["name"]))

    # ---- Rüstung + Sets ------------------------------------------------------------
    mb_sets = {s["title"]: s for s in all_data["sets"]}
    sets = {}
    for name, s in det_sets.items():
        sets[name] = {"name": name, "rarity": s.get("rarity"), "bonus": []}
        for b in s.get("bonus", []):
            eff = b["effect"]
            sets[name]["bonus"].append({"pieces": b["pieces"], "effect": eff,
                                         "stats": parse_stats(eff), "conditional": is_conditional(eff),
                                         "maxStacks": parse_stacks(eff)})
    for title, s in mb_sets.items():
        title = "Blackstone" if title == "Blackstone Set" else title
        if title in sets or title in ("No set", "None"):
            continue
        bonus = []
        for i, k in enumerate(["bonus_one", "bonus_two", "bonus_three", "bonus_four"], start=1):
            if s.get(k):
                eff = strip_html(s[k])
                bonus.append({"pieces": i, "effect": eff, "stats": parse_stats(eff), "conditional": is_conditional(eff),
                              "maxStacks": parse_stacks(eff)})
        sets[title] = {"name": title, "rarity": None, "bonus": bonus}

    armor = []
    for a in armor_src:
        slot = a["slot"]
        rarity = a["rarity"]
        base = ARMOR_BASE.get(rarity, ARMOR_BASE["uncommon"]).get(slot)
        if not base:
            continue
        d = det_armor.get(a["slug"]) or {}
        set_name = d.get("set") or ""
        if set_name in ("No set", "None"):
            set_name = ""
        if set_name == "Blackstone Set":
            set_name = "Blackstone"
        if not set_name:
            g = gear_by_name.get(norm_name(a["name"]))
            if g and g.get("linked_set"):
                for s in all_data["sets"]:
                    if s["id"] == g["linked_set"]:
                        set_name = s["title"]
        if set_name in ("No set", "None", "Blackstone Set"):
            set_name = "Blackstone" if set_name == "Blackstone Set" else ""
        effect = a.get("effect") or ""
        if not effect:
            g = gear_by_name.get(norm_name(a["name"]))
            if g and g.get("description"):
                effect = strip_html(g["description"])
        armor.append(OrderedDict([
            ("id", a["slug"]), ("name", a["name"]), ("slot", slot), ("rarity", rarity),
            ("maxStars", MAX_STARS.get(rarity, 6)), ("set", set_name or None),
            ("hp", base[0]), ("psi", base[1]), ("pollution", base[2]),
            ("effect", effect), ("stats", parse_stats(effect)), ("conditional", is_conditional(effect)),
            ("maxStacks", parse_stacks(effect)),
            ("image", a.get("imageUrl")), ("url", a.get("url")),
        ]))
    armor.sort(key=lambda x: (x["set"] or "zzz", x["slot"], x["name"]))
    sets.pop("No set", None)
    sets.pop("Blackstone Set", None)

    # ---- Mods ----------------------------------------------------------------------
    mods = OrderedDict()
    for m in mods_src:
        key = (m["name"], m["category"], m["slot"])
        entry = mods.get(key)
        if not entry:
            eff = m.get("effect") or ""
            entry = OrderedDict([
                ("id", strip_variant(m["slug"], m.get("variant"))),
                ("name", m["name"]), ("category", m["category"]), ("slot", m["slot"]),
                ("rarity", m.get("rarity")), ("effect", eff), ("stats", parse_stats(eff)),
                ("conditional", is_conditional(eff)), ("maxStacks", parse_stacks(eff)), ("keyword", detect_keyword(eff)),
                ("variants", []), ("image", m.get("imageUrl")), ("url", m.get("url")),
            ])
            mods[key] = entry
        if m.get("variant") and m["variant"] not in entry["variants"]:
            entry["variants"].append(m["variant"])
    mods_list = list(mods.values())
    # IDs eindeutig machen
    seen = {}
    for m in mods_list:
        base_id = f"{m['id']}-{m['slot'].lower()}"
        n = seen.get(base_id, 0)
        seen[base_id] = n + 1
        m["id"] = base_id if n == 0 else f"{base_id}-{n+1}"
    mods_list.sort(key=lambda x: (x["category"], x["slot"], x["name"]))

    # ---- Deviants ------------------------------------------------------------------
    deviations = []
    for d in dev_src:
        if d.get("type") != "Combat":
            continue
        det = det_devs.get(d["name"]) or {}
        g = gear_by_name.get(norm_name(d["name"]))
        effect = det.get("effect") or ""
        if not effect:
            mbd = next((x for x in all_data["deviations"] if x["title"] == d["name"] and x.get("description")), None)
            effect = strip_html(mbd["description"]) if mbd else re.sub(r"^Once Human .*?Deviation\. ", "", d.get("effect") or "")
        buff = DEVIANT_BUFFS.get(d["slug"])
        deviations.append(OrderedDict([
            ("id", d["slug"]), ("name", d["name"]), ("rarity", d.get("rarity")),
            ("effect", effect), ("buff", buff), ("image", d.get("imageUrl")), ("url", d.get("url")),
        ]))
    deviations.sort(key=lambda x: (x["buff"] is None, x["name"]))

    # ---- Cradle Overrides -----------------------------------------------------------
    cradle = []
    seen_c = set()
    for c in cradle_src:
        if c["name"] in seen_c:
            continue
        seen_c.add(c["name"])
        eff = c.get("effect") or ""
        cradle.append(OrderedDict([
            ("id", c["slug"]), ("name", c["name"]), ("style", c.get("style")), ("effect", eff),
            ("stats", parse_stats(eff)), ("conditional", is_conditional(eff)), ("maxStacks", parse_stacks(eff)),
            ("keyword", detect_keyword(eff)),
        ]))
    cradle.sort(key=lambda x: (x["style"] or "", x["name"]))

    # ---- Kalibrierungen -------------------------------------------------------------
    calibrations = []
    for c in all_data["calibrations"]:
        eff = strip_html(c.get("description"))
        if c["title"] == "Default":
            continue
        calibrations.append(OrderedDict([
            ("id", c.get("catalog_key") or f"cal-{c['id']}"), ("name", c["title"]), ("style", c.get("style")),
            ("weaponGroup", c.get("weapon_group")), ("effect", eff), ("stats", parse_stats(eff)),
        ]))
    calibrations.sort(key=lambda x: (x["weaponGroup"] or "", x["name"]))

    # ---- Schreiben -------------------------------------------------------------------
    meta = {"snapshotDate": SNAPSHOT_DATE, "gameVersion": GAME_VERSION,
            "sources": ["oncehumandb.com (OHDB) via github.com/saitoh183/once-human-build-planner",
                        "meta-builds.net Snapshot via github.com/josephfmmarzin-ai/ONCE_HUMAN",
                        "once-human.fandom.com (Sternkurven, Essen)", "wikily.gg (Ultra Force Sterne)"]}

    def dump(name, payload):
        (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{name}: {len(payload) if isinstance(payload, list) else 'ok'}")

    dump("weapons.json", weapons)
    dump("armor.json", armor)
    dump("sets.json", sets)
    dump("mods.json", mods_list)
    dump("deviations.json", deviations)
    dump("cradle.json", cradle)
    dump("calibrations.json", calibrations)
    dump("food.json", FOOD)
    dump("stars.json", {"curves": STAR_CURVES, "status": STAR_CURVE_STATUS, "maxStars": MAX_STARS,
                        "tierCurve": TIER_CURVE, "tierStatus": TIER_STATUS, "weaponDataTier": WEAPON_DATA_TIER})
    dump("formulas.json", {"keywords": KEYWORD_FORMULAS, "modSuffixes": MOD_SUFFIXES,
                           "critWeakspotDefault": "additive",
                           "notes": [
                               "Attack = Tier-IV-Attack × Tierfaktor × Sternfaktor × (1 + Attack%)",
                               "Treffer = Attack × (1 + Weapon DMG%) × Crit/Weakspot-Faktor × (1 + Elemental%) × (1 + DMG vs Zieltyp%) × (1 + Keyword DMG% bei Keyword-Schaden)",
                               "Crit/Weakspot-Faktor additiv: 1 + CritDMG% (bei Crit) + WeakspotDMG% (bei Weakspot). Multiplikativ: (1 + CritDMG%) × (1 + WeakspotDMG%). Umschaltbar.",
                               "Status-DMG = Psi Intensity × Keyword-Faktor × (1 + Status DMG%) × (1 + Elemental%) × (1 + Keyword DMG%).",
                           ]})
    dump("meta.json", meta)


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--ohdb", default=OHDB_RAW, help="Verzeichnis oder URL mit OHDB-Export (weapons.json …)")
    p.add_argument("--mb", default=MB_RAW, help="Verzeichnis oder URL des ONCE_HUMAN-Datenordners (metabuilds/, details/)")
    args = p.parse_args(argv)
    ohdb = args.ohdb if args.ohdb.startswith("http") else str(Path(args.ohdb).resolve()) + "/"
    mb = args.mb if args.mb.startswith("http") else str(Path(args.mb).resolve()) + "/"
    build(ohdb, mb)


if __name__ == "__main__":
    sys.exit(main())
