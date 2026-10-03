#!/usr/bin/env python3
"""
Generates every data-driven file of the Compressed Blocks mod from the BASES table below:
blockstates, block models, item model definitions, loot tables, recipes, recipe advancements,
mineable tags, translations and the tier overlay textures.

Run from the mod folder:   python3 tools/generate_resources.py
Keep BASES and TIERS in step with CompressedBlocks.java.
"""
import json, os, struct, sys, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "src", "main", "resources")
NS = "compressedblocks"
TIERS = 9

# id, display name, vanilla texture (under minecraft:block/), tool tag
BASES = [
    ("dirt",              "Dirt",              "dirt",              "shovel"),
    ("cobblestone",       "Cobblestone",       "cobblestone",       "pickaxe"),
    ("stone",             "Stone",             "stone",             "pickaxe"),
    ("cobbled_deepslate", "Cobbled Deepslate", "cobbled_deepslate", "pickaxe"),
    ("sand",              "Sand",              "sand",              "shovel"),
    ("gravel",            "Gravel",            "gravel",            "shovel"),
    ("netherrack",        "Netherrack",        "netherrack",        "pickaxe"),
    ("end_stone",         "End Stone",         "end_stone",         "pickaxe"),
    ("granite",           "Granite",           "granite",           "pickaxe"),
    ("diorite",           "Diorite",           "diorite",           "pickaxe"),
    ("andesite",          "Andesite",          "andesite",          "pickaxe"),
]
TIER_NAMES = ["Compressed", "Double Compressed", "Triple Compressed", "Quadruple Compressed", "Quintuple Compressed",
              "Sextuple Compressed", "Septuple Compressed", "Octuple Compressed", "Nonuple Compressed"]
assert len(TIER_NAMES) >= TIERS

written = 0

def write_json(rel, obj):
    global written
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=2)
        f.write("\n")
    written += 1

def write_bytes(rel, data):
    global written
    path = os.path.join(RES, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    written += 1

def name(base_id, tier):
    return f"compressed_{base_id}_{tier}"

def block_id(base_id, tier):
    """Registry id of a tier; tier 0 is the vanilla block itself."""
    return f"minecraft:{base_id}" if tier == 0 else f"{NS}:{name(base_id, tier)}"

def faces(texture):
    return {d: {"texture": texture, "cullface": d} for d in ("down", "up", "north", "south", "west", "east")}

# --- shared parent model: vanilla texture cube with a tier badge overlay on every face ----------------
write_json(f"assets/{NS}/models/block/compressed_block.json", {
    "parent": "minecraft:block/block",
    "render_type": "minecraft:cutout",
    "textures": {"particle": "#base"},
    "elements": [
        {"from": [0, 0, 0], "to": [16, 16, 16], "faces": faces("#base")},
        {"from": [0, 0, 0], "to": [16, 16, 16], "faces": faces("#overlay")},
    ],
})

lang = {f"itemGroup.{NS}": "Compressed Blocks"}
mineable = {"shovel": [], "pickaxe": []}

def inv_criterion(item):
    return {"conditions": {"items": [{"items": item}]}, "trigger": "minecraft:inventory_changed"}

def recipe_criterion(recipe_id):
    return {"conditions": {"recipes": recipe_id}, "trigger": "minecraft:recipe_unlocked"}

def advancement(recipe_id, ingredient):
    ingredient_key = "has_" + ingredient.split(":", 1)[1]
    return {
        "parent": "minecraft:recipes/root",
        "criteria": {
            ingredient_key: inv_criterion(ingredient),
            "has_the_recipe": recipe_criterion(recipe_id),
        },
        "requirements": [["has_the_recipe", ingredient_key]],
        "rewards": {"recipes": [recipe_id]},
    }

for base_id, display, texture, tool in BASES:
    for tier in range(1, TIERS + 1):
        n = name(base_id, tier)
        this_id = block_id(base_id, tier)
        prev_id = block_id(base_id, tier - 1)

        write_json(f"assets/{NS}/blockstates/{n}.json", {"variants": {"": {"model": f"{NS}:block/{n}"}}})
        write_json(f"assets/{NS}/models/block/{n}.json", {
            "parent": f"{NS}:block/compressed_block",
            "render_type": "minecraft:cutout",
            "textures": {"base": f"minecraft:block/{texture}", "overlay": f"{NS}:block/overlay_{tier}"},
        })
        write_json(f"assets/{NS}/items/{n}.json", {"model": {"type": "minecraft:model", "model": f"{NS}:block/{n}"}})

        write_json(f"data/{NS}/loot_table/blocks/{n}.json", {
            "type": "minecraft:block",
            "pools": [{
                "rolls": 1,
                "bonus_rolls": 0,
                "entries": [{"type": "minecraft:item", "name": this_id}],
                "conditions": [{"condition": "minecraft:survives_explosion"}],
            }],
            "random_sequence": f"{NS}:blocks/{n}",
        })

        compress_id = f"{NS}:{n}"
        write_json(f"data/{NS}/recipe/{n}.json", {
            "type": "minecraft:crafting_shaped",
            "category": "building",
            "group": f"{NS}:compress_{base_id}",
            "key": {"#": prev_id},
            "pattern": ["###", "###", "###"],
            "result": {"id": this_id},
        })
        write_json(f"data/{NS}/advancement/recipes/building_blocks/{n}.json", advancement(compress_id, prev_id))

        uncompress_id = f"{NS}:{n}_uncompress"
        write_json(f"data/{NS}/recipe/{n}_uncompress.json", {
            "type": "minecraft:crafting_shapeless",
            "category": "building",
            "group": f"{NS}:uncompress_{base_id}",
            "ingredients": [this_id],
            "result": {"count": 9, "id": prev_id},
        })
        write_json(f"data/{NS}/advancement/recipes/building_blocks/{n}_uncompress.json", advancement(uncompress_id, this_id))

        full_name = f"{TIER_NAMES[tier - 1]} {display}"
        lang[f"block.{NS}.{n}"] = full_name
        lang[f"item.{NS}.{n}"] = full_name
        mineable[tool].append(this_id)

write_json(f"assets/{NS}/lang/en_us.json", lang)
for tool, values in mineable.items():
    write_json(f"data/minecraft/tags/block/mineable/{tool}.json", {"values": values})

# --- overlay textures: a coloured 1px frame and the tier number ----------------------------------------
DIGITS = {  # 3x5 pixel font
    "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"],
    "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"],
    "7": ["111", "001", "001", "010", "010"],
    "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"],
}
FRAME_COLORS = {
    1: (235, 235, 235), 2: (130, 225, 90), 3: (90, 205, 225), 4: (90, 125, 235), 5: (165, 95, 235),
    6: (235, 95, 205), 7: (245, 160, 60), 8: (235, 70, 70), 9: (255, 205, 50),
}

def png(width, height, rows):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in rows)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def overlay_pixels(tier):
    px = [[(0, 0, 0, 0)] * 16 for _ in range(16)]
    r, g, b = FRAME_COLORS[tier]
    for i in range(16):  # 1px frame
        for (x, y) in ((i, 0), (i, 15), (0, i), (15, i)):
            px[y][x] = (r, g, b, 150)
    glyph = DIGITS[str(tier)]
    scale, ox, oy = 2, 5, 3  # 6x10 digit centred in the 16x16 face
    digit = set()
    for gy, row in enumerate(glyph):
        for gx, bit in enumerate(row):
            if bit == "1":
                for dy in range(scale):
                    for dx in range(scale):
                        digit.add((ox + gx * scale + dx, oy + gy * scale + dy))
    outline = set()
    for (x, y) in digit:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if (x + dx, y + dy) not in digit and 0 <= x + dx < 16 and 0 <= y + dy < 16:
                    outline.add((x + dx, y + dy))
    for (x, y) in outline:
        px[y][x] = (20, 20, 20, 190)
    for (x, y) in digit:
        px[y][x] = (255, 255, 255, 235)
    return px

overlays = {}
for tier in range(1, TIERS + 1):
    rows = overlay_pixels(tier)
    overlays[tier] = rows
    write_bytes(f"assets/{NS}/textures/block/overlay_{tier}.png", png(16, 16, rows))

if len(sys.argv) > 1:  # optional preview sheet over a dirt-ish background, for eyeballing the overlays
    scale, gap = 8, 4
    w = TIERS * (16 * scale + gap) + gap
    h = 16 * scale + 2 * gap
    canvas = [[(43, 43, 43, 255)] * w for _ in range(h)]
    for i, tier in enumerate(range(1, TIERS + 1)):
        ox = gap + i * (16 * scale + gap)
        for y in range(16):
            for x in range(16):
                base = (134, 96, 67, 255) if (x * 7 + y * 13) % 5 else (112, 80, 56, 255)
                o = overlays[tier][y][x]
                a = o[3] / 255.0
                col = tuple(int(o[c] * a + base[c] * (1 - a)) for c in range(3)) + (255,)
                for dy in range(scale):
                    for dx in range(scale):
                        canvas[gap + y * scale + dy][ox + x * scale + dx] = col
    with open(sys.argv[1], "wb") as f:
        f.write(png(w, h, canvas))

print(f"wrote {written} files under {RES}")
