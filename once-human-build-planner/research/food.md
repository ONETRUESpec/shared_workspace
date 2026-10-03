# Once Human — Food, Drink & Consumable Combat Buffs: Research Notes

Facet: cooked food, brewed drinks and other consumables that give combat-relevant buffs, plus stacking rules.
Generated: 2026-10-03. Data file: `data/food.json`. Summary: `research/food.summary.json`.

## 0. How this research was done (and its limits)

* The session's egress proxy blocked **every** wiki/guide domain tried (once-human.fandom.com, oncehuman.wiki.gg, steamcommunity.com, store.steampowered.com, oncehuman.game, game8.co, gamerant, thegamer, gameleap, sportskeeda, mobalytics, maxroll, oncehumandb.com, wikily.gg, games.gg, metaforge.app, primagames, charlieintel, playerauctions, hatenablog, wikipedia, reddit …). Only **github.com / raw.githubusercontent.com** were reachable.
* The shared WebSearch quota (200/session) was exhausted after ~20 of my queries; values quoted from English sites below come from the WebSearch result summaries (which quote the pages), not from the pages themselves.
* The decisive source was a **GitHub-hosted, locked "verified snapshot" of a Taiwanese community spreadsheet** (`七日世界.xlsx`, tab `料理` = Cooking/Food Buffs, 84 rows: 58 food + 26 drinks), imported 2026-05-17 by the OHMM calculator project. It stores the original Traditional-Chinese cells (effect text, effect power with Chefosaurus Rex, duration at Stardust Fusion Stove, ingredient-effect source, ingredients, base restore, spoil time, craft time, unlock location). I read all 84 rows in Chinese and translated them by hand; OHMM's own machine translation of the same rows is garbled and was NOT used for values.
* The same workbook's `異常物` (Deviations) tab gave the exact Chefosaurus Rex food-bonus table.
* A second GitHub dataset (saitoh183/once-human-build-planner → scraped from oncehumandb.com) supplied the **official English item names** (154 food entries) but only Energy/Hydration numbers, no buff text.

## 1. Sources used (URLs)

Primary (read in full):
1. https://raw.githubusercontent.com/TeeReckzi/OHMM/main/verified/food-buffs.verified.json — TW community sheet, 84 rows, imported 2026-05-17 (module `food_buffs`, status `verified_snapshot_locked`, confidence `B_owner_approved_names_pending_buff_review`).
2. https://raw.githubusercontent.com/TeeReckzi/OHMM/main/verified/deviations.verified.json — same workbook, Deviations tab (Chefosaurus Rex rows 55–57).
3. https://raw.githubusercontent.com/TeeReckzi/OHMM/main/src/ohai/src/resolvers/loadoutEffectResolver.ts — how a 2026 community calculator applies food/drink (1 food + 1 drink slot, Chef Rex multiplier).
4. https://raw.githubusercontent.com/TeeReckzi/OHMM/main/src/ohai/src/ui/registries/deviationRegistry.ts and …/registries/foodBuffRegistry.ts, …/ui/chefRex.ts, …/lib/ohmm/verification-backlog.md
5. https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/food.json (154 oncehumandb food items, official EN names, categories Food / Creative Cuisine / Creative Beverages)
6. https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/deviations.json (Chefosaurus Rex / Azure Melody / Berserkosaurus Rex descriptions)
7. https://raw.githubusercontent.com/ping-xiong/XingChuan-OnceHunamMap-Localization/main/en.js (zh→en recipe-name map: 碎裂面包 = Shattered Bread, 奇思妙想饮 = Whimsical Drink, 蜜酿炖肉 = "Honey Glaced Meat", 星尘炸肉 = Mixed Fried Hot Dog, 炙热炖肉火锅 = Hearty Meat Stew, etc.)
8. https://raw.githubusercontent.com/smus-rgb/once-human-guide/main/database_full.json (dated 2026-10-01; only 26 vague recipes — not usable for numbers)

Secondary (quoted via WebSearch summaries):
9. https://once-human.fandom.com/wiki/Buffs_and_Effects
10. https://once-human.fandom.com/wiki/Food_and_Water/Cooked_Food_List
11. https://steamcommunity.com/sharedfiles/filedetails/?id=3339574420 (Steam guide "All about Food + Food & Bonus Effects")
12. https://steamcommunity.com/app/2139460/discussions/0/4514379914253028765/ ("How do food or drinks stack?")
13. https://gameplay.tips/guides/once-human-food-list.html
14. https://www.thegamer.com/once-human-top-best-dishes-cook/
15. https://www.gameleap.com/articles/once-human-top-10-best-food-drink-recipes and https://www.gameleap.com/articles/once-human-all-special-recipes
16. https://gamerant.com/once-human-all-brewing-barrel-recipes/
17. https://allthings.how/once-human-food-recipe-locations-for-50-free-damage-buffs/
18. https://www.sportskeeda.com/mmo/best-special-recipes-once-human
19. https://www.charlieintel.com/games/all-special-recipes-in-once-human-where-to-find-them-332856/
20. https://game8.co/games/Once-Human/archives/544741 (Chef class guide), https://game8.co/games/Once-Human/archives/551548, https://theriagames.com/guide/once-human-chef/, https://www.bisecthosting.com/blog/once-human-chef-class-guide-best-cooking-recipes-ingredients-dishes-meals
21. https://once-human.fandom.com/wiki/Whimsical_Drink, …/Canned_Lunch_Meat, …/Stardust_Malt_Ale, …/Stargazy_Pie, …/Sparkling_Pumpkin_Soup
22. https://game8.co/games/Once-Human/archives/464371 (recipe locations, Way of Winter), https://game8.co/games/Once-Human/archives/494449 (Lunar Revelry)

## 2. Stacking rules — exact quotes

* Steam thread (12): "If food buffs take the same buff slot they will overwrite." / "Each of those little circles at the bottom can hold 1 buff basically."
* Chef class (20): "The Chef class can stack four buffs at once: two food buffs and two drink buffs … through the Chef's 'Glutton' talent, which allows you to consume additional food and drink, gaining up to 2 food effects and 2 drink effects at the same time."  → baseline without Chef = 1 food + 1 drink.
* OHMM resolver (3): `build.food = { food: id, drink: id, chefRex }`; both food and drink modifiers are pushed to the modifier list and each is multiplied by `1 + chefRexBonus/100`.
* Steam guide (11) and fandom (9) label buffs by type: Combat (1800 s), Survival (3600 s, e.g., Cooling Touch / Pleasant Warmth), Gathering (1800 s); "Stardust Tea's Energy and Hydration top-up holds for two hours."
* NOT found: whether a Combat-type food and a Survival-type food can coexist (I treat it as one food slot), and whether Whim effects (Skybound, Full Stomach) occupy a slot.

## 3. Chefosaurus Rex (青龍) food-power multiplier — verbatim from the TW Deviations tab

Row 57 青龍 (Chefosaurus Rex, Territory): 「提升玩家烹飪食物的效果，異能評級越高，效果提升越明顯。」
Notes: 「異能評級5（活躍度>=90：料理效果+38％；活躍度20~89：料理效果+31％；活躍度0~19：料理效果+25％）／異能評級4（>=90：+32％；20~89：+26％；0~19：+20％）／異能評級3（>=90：+26％；20~89：+21％；0~19：+15％）」
Row 55 藍色音浪·青龍 = "Chefosaurus Rex – Azure Melody" (event 2025/07/03–07/31), row 56 狂野·青龍 = "Berserkosaurus Rex": 「能力與青龍相同」 (same ability).
The food sheet's 「料理效果威力」 column is literally this +38% case: 25%→34.5%, 20%→27.6%, 15%→20.7%, 10%→13.8%, 30%→41.4%, 100 pts→138 pts (all = ×1.38).
OHMM (4) hardcodes `CHEF_REX_MAX_BONUS_PERCENT = 42` and "common bonus 38%, max observed 42%; baseline 20% + skill + activity" — the 42% does not appear in the sheet; unverified.
oncehumandb (6): "Chefosaurus Rex — Epic Territory Deviation. Abilities: culinary genius. Works in the Territory to help produce food."

## 4. Duration

* English sources (9, 11): most Combat and Gathering buffs = 30 min (1800 s); Survival buffs (temperature) = 60 min; Stardust Tea Full Stomach = 2 h.
* TW sheet column 「料理效果持續時間(分鐘)」 gives 「星塵融合灶台：52.5」 for every 30-min buff, 105 for 60-min buffs, 26.25 for Spectral Canned Mushroom (15 min base), 17.5 for Bacon Burger (10 min base), 52.5 **秒** for Lunar Gummy's 30-s shield, 105秒 for the 60-s sanity-restore tick → the Stardust Fusion Stove multiplies buff duration by **1.75**. One oddity: Sparkling Pumpkin Soup 57.75 (would be 33 min base).

## 5. Full item table from the TW sheet (my translation; power = with Chef Rex +38%)

| # | ZH name | EN name (official where known) | Type | Effect (translated) | Power w/ Chef Rex | Duration @Stardust stove (min) | Base restore | Unlock |
|---|---|---|---|---|---|---|---|---|
| 3 | 炸魚薯條 | Fish & Chips | food | character becomes fat | – | – | Energy+100 | East (3036,-4901) vendor |
| 4 | 油浸魚貝罐頭 | Canned Seafood in Oil | food | mining/logging final hit: chance of 66% / 666% / 6666% yield | – | 52.5 | Energy+100 | Memetics |
| 5 | 南瓜星空派 | Stargazy Pie | food | **Crit DMG +25% while satiated (Energy full)** | 34.5% | 52.5 | Energy+100 | East (4931,-4493) vendor |
| 6 | 肉排罐頭 | Canned Meat / "Canned Steak" | food | **Shrapnel DMG +20%** | 27.6% | 52.5 | Energy+80 | East (935,-5902) vendor |
| 7 | 星塵南瓜泥沙拉 | Stardust Pumpkin Salad | food | **Crit DMG +15%** | 20.7% | 52.5 | Energy+80 | vendor |
| 8 | 轉盤餃子 | Roulette Dumplings | food | random one of: Sanity −150 on eating / **+15% vs elites** / **+15% vs bosses** / **+15% vs Deviants**; all at once under Moon Omen | 20.7% | 52.5 | Energy+100 | discontinued |
| 9 | 怪味紅燒肉 | Unusual Braised Meat | food | 15% DMG reduction while Sanity <40% | – | 52.5 | Energy+100 | discontinued |
| 10 | 異變帶骨香腸 | Bone-In Deviated Sausage | food | **DMG vs BOSS +15%** | 20.7% | 52.5 | Energy+100 | East (4171,-1326) |
| 11 | 星塵炸肉 | Mixed Fried Hot Dog | food | **DMG +20% vs enemies under Hunter's Mark / The Bull's Eye** | 27.6% | 52.5 | Energy+100 | East (3649,-4384) vendor |
| 12 | 星間布丁 | Starry Pudding | food | 20% DMG reduction while airborne | 27.6% | 52.5 | Energy+100 | discontinued |
| 13 | 幽光蘑菇罐頭 | Spectral Canned Mushroom | food | every 5 s emit blinding light, 3-s stun to nearby monsters (not elites/large animals) | – | 26.25 | Hydration+100 | East (3815,-3885) / Memetics |
| 14 | 星塵水果罐頭 | Assorted Canned Fruit | food | **Weakspot DMG +25% while Sanity >80%** | 34.5% | 52.5 | Energy+80, Hydration+40 | East (6084,-2596) vendor |
| 15 | 碎裂麵包 | Shattered Bread / "Crumbly Bread" | food | **all gun (Weapon) DMG +25%** | 34.5% | 52.5 | Energy+100 | East (6963,-4260) vendor |
| 16 | 銀河千層 | Layered Galaxy | food | **Elemental DMG +30% while airborne** | 41.4% | 52.5 | Energy+100 | discontinued |
| 17 | 驚喜春捲 | Surprise Spring Roll | food | **Elemental DMG +5–15%, doubled while HP <40%** | – | 52.5 | Energy+100 | discontinued |
| 18 | 炸薯條 | French Fries | food | **Weapon DMG +20% inside Fortress Warfare** | 27.6% | 52.5 | Energy+100 | East (353,-7200) |
| 19 | 星塵蔬菜雜燴 | Stardust Ratatouille | food | Movement Speed +20%; sprint stamina cost −50% | 27.6% / 69% | 52.5 | Energy+80 | East (4300,-2392) vendor |
| 20 | 奈克特彩蛋 | Nalcott Easter Egg | food | none | – | – | Energy+100, Hydration+100, Sanity −500 | – |
| 21 | 豪華海陸煎燒 | Seafood and Meat Platter | food | **Max HP +15%**, restore 100% HP within 30 s | 20.7% | 52.5 | Energy+100 | East (5533,-5704) vendor |
| 22 | 炙熱燉肉火鍋 | Hearty Meat Stew | food | **Blaze DMG +15%** | 20.7% | 52.5 | Energy+100, Hydration+100 | North (-6458,4855) vendor |
| 23 | 蜜釀燉肉 | Honey Glazed Meat | food | **Crit Rate +15% when hitting enemies in Frost Vortex** | 20.7% | 52.5 | Energy+100, Hydration+100 | East (6884,-1518) vendor |
| 24 | 清涼薄荷肉罐頭 | Canned Minty Meat | food | **Frost DMG +15%** | 20.7% | 52.5 | Energy+100 | North (-5180,4229) vendor |
| 25 | 麻辣兔肉罐頭 | Canned Spicy Rabbit Dices | food | **Blaze DMG +15% while ambient temp >30 °C** | 20.7% | 52.5 | Energy+80 | North (-6780,4302) vendor (Temperature scenarios) |
| 26 | 奶油松茸 | Butter Matsutake Mushrooms | food | Status DMG **taken** −8% (−12% while Energy & Hydration full) | 11% / 15% | 52.5 | Energy+100 | North (-1190,5141) vendor |
| 27 | 砰砰爆米花 | Popcorn | food | **Unstable Bomber DMG +10%** | 13.8% | 52.5 | Energy+100 | North (2493,5927) vendor |
| 28 | 炙熱烈焰蛋撻 | Flaming Eggtart | food | **Burn DMG +10%** | 13.8% | 52.5 | Energy+100 | North (830,6761) vendor |
| 29 | 蜜蛋彈彈樂 | Ginger Poppers | food | **Shrapnel DMG +10%** | 13.8% | 52.5 | Energy+100 | North (2266,6004) vendor |
| 30 | 午餐肉罐頭 | Canned Lunch Meat | food | **Max HP +10%** (+ meat sub-buff) | 13.8% | 52.5 | Energy+80 | no unlock |
| 31 | 飄飄棉花糖 | Fluffy Sweet | food | glide speed +10%, glide stamina cost +15% | 13.8% / 20.7% | 52.5 | Energy+100 | discontinued |
| 32 | 安全三明治 | Safety Sandwich | food | **DMG taken from players −20%** | 27.6% | 52.5 | Energy+100 | East (5526,-2981) |
| 33 | 深海魚片披薩 | Stargazy Pizza | food | unlimited time underwater | – | 52.5 | Energy+100 | East (1587,-7332) vendor |
| 34 | 香噴噴的異變肉排 | Preserved Deviated Chops | food | acid from defeated Deviants +50% | – | 52.5 | Energy+100 | East (6097,-6844) vendor |
| 35 | 水果餅 | Fruity Pancake | food | XP from kills +25% | – | 52.5 | Energy+50, Hydration+80 | no unlock |
| 36 | 培根肉排漢堡 | Bacon Burger | food | one-hit mining & logging | – | 17.5 | Energy+100 | Memetics |
| 37 | 香辣煎肉 | Spicy Sizzling Meat | food | Cold Resist +20 (clears Hypothermia) | 27.6 pts | 105 | Energy+80 | WoW/Endless Memetics |
| 38 | 異味軟糖 | Lunar Gummy | food | shield = lost-Sanity% × 60% Max HP for 30 s; 60-s re-eat lockout | – | 52.5 s | Energy+50, Sanity −300 | discontinued |
| 39 | 硬邦邦薑糖 | Gingerdrop | food | Fortress Warfare duration +5 s | – | 52.5 | Energy+100 | North (-3467,3898) vendor |
| 40 | 柔軟貝肉 | Shellfish Meat | food | **on hit: 5% Vulnerability on target for 10 s (no stacking)** | – | 52.5 | Energy+80 | East (797,-4460) vendor |
| 41 | 星塵通心粉罐頭 | Stardust Italian Soup Can | food | Securement level +1 | – | 52.5 | Energy+100, Hydration+30 | East (6078,-3091) vendor |
| 42–60 | 一碗美味 … 烤蘑菇 | Hug-in-a-Bowl, Pickled Cucumber, Cheese, Stardust Cheese, Butter, Caviar, Sanity Corrosion Capsule (Sanity −100), Sanity Gummy (Sanity +60), Bread with Jam, Salty Roasted Spikemato (Cold Resist +10, 52.5), Large Jerky, Large Fish Jerky, Sugar, Salt, Roasted Berries, Grilled Vegetables, Roasted Meat, Grilled Fish, Grilled Mushrooms | | no combat buff | | | | |
| 61 | 奇思妙想飲 | Whimsical Drink | drink | **Status DMG +25%** | 34.5% | 52.5 | Hydration+100, Sanity+125 | East (1926,-2991) vendor |
| 62 | 異想天開飲 | "Signature Beverage" (EN name unverified) | drink | **Weapon DMG +10%** | 13.8% | 52.5 | Hydration+100, Sanity+125 | East (4117,-1463) vendor |
| 63 | 星塵蘑菇濃湯 | Stardust Mushroom Soup | drink | Max Stamina +20%, stamina regen +30% | 27.6% | 52.5 | Hydration+80, Sanity+100 | East (6063,-3670) vendor |
| 64 | 消脂果汁 | Fat-Burning Juice | drink | character becomes thin | – | – | Hydration+100 | East (5365,-3243) vendor |
| 65 | 星塵樹莓刨冰 | Stardust Raspberry Shaved Ice | drink | **duration of debuffs you inflict +20%** | – | 52.5 | Hydration+100, Sanity+125 | WoW (-5770,7400) vendor |
| 66 | 特調冰釀 | Signature Ice Brew | drink | Sprint Speed +20% | 27.6% | 52.5 | Hydration+100, Sanity+125 | East (1470,-3299) vendor |
| 67 | 暖暖涼涼燉湯 | All-Weather Stew | drink | Max Stamina +30%; Heat & Cold Resist +30 | 41.4% / 41.4 pts | 105 | Energy+100, Hydration+100 | WoW/Endless Memetics |
| 68 | 星塵麥芽蜜釀 | Stardust Malt Ale | drink | Pollution Resist +100 (sheet: "100/105") | – | 52.5 | Hydration+100, Sanity+125 | Memetics |
| 69 | 麥芽蜜釀 | Malt Ale | drink | Sanity +100 over 1 min; Pollution Resist +70 | 138 pts | 105 s / 52.5 | Hydration+100 | Memetics |
| 70 | 星塵茶 | Stardust Tea | drink | Sanity +100 over 1 min; keeps Energy & Hydration states full for 2 h | 138 pts | 105 s | Hydration+100 | East (6135,-1146) vendor |
| 71 | 星塵能量飲料 | Stardust Energy Drink | drink | double jump | – | 52.5 | Hydration+100 | Memetics |
| 72 | 星空泡泡奶茶 | Starry Bubble Tea | drink | gliding out of combat: +5% Max-HP shield per s, cap 50% | – | 52.5 | Hydration+100 | discontinued |
| 73 | 燻肉羅宋湯 | Borscht Deluxe | drink | Energy Links from weapon/gear crates ×2 | – | 52.5 | Energy+100, Hydration+50 | East (7329,-5344) vendor |
| 74 | 反重力奶昔 | Anti-gravity Milkshake | drink | carry weight raised to max cap | – | 52.5 | Energy+100, Hydration+100 | Memetics |
| 75 | 劈哩啪啦南瓜糊 | Sparkling Pumpkin Soup | drink | **Power Surge DMG +10%** | 13.8% | 57.75 (!) | Hydration+100 | North (-2460,5087) vendor |
| 76 | 奇蹟茶 | Miracle Tea | drink | **all healing effects +10%** | 13.8% | 52.5 | Hydration+100 | no unlock |
| 77 | 冰茶 | Ice Tea | drink | Sanity +100 over 1 min; roll speed +25%; Move Speed +20% for 2 s after rolling | 138 pts / 34.5% / 27.6% | 105 s / 52.5 | Hydration+80 | East (4860,-6913) vendor |
| 78 | 薄荷冰茶 | Iced Mint Tea | drink | Heat Resist +20 (clears Heatstroke); sprint speed +10% in heat | 27.6 pts / 13.8% | 105 | Hydration+80 | Memetics |
| 79–86 | 南瓜粥 … 果汁 | Pumpkin Porridge, Corn Soup, Fruit Soda, Fruit Tea (Sanity +60/min, Pollution Resist +30, 105 s/52.5), Chilled Icemelon Soup (Heat Resist +10), Boiled Water, Corn Oil, Juice | | no combat buff | | | | |

Ingredient-effect source column (食材效果): 肉A (any meat, not raw) for rows 6,7,8,9,10,11,21,22,23,24,30,34,36,63,69,73; 魚 (fish) for 3,4,33(fish or bear/crocodile/turtle meat); 奶 (milk) for 5,10,11,29,31,72; 蛋 (egg) for 12,28,29,32; 水果A for 14,31,35,72; 草藥 (herb) for 13,61,62,70,71,76,77,78.

## 6. English-source values used for cross-checking (quotes from WebSearch summaries)

* fandom Buffs and Effects: "Shattered Bread: Weapon DMG +25% for all weapons"; "French Fries: Weapon DMG +20% during Fortress Warfare"; "Stardust Pumpkin Salad: Crit DMG +15%"; "Stargazy Pie: Crit DMG +25% while Energy is full"; "Honey Glazed Meat: Crit Rate +15% against enemies caught in a Frost Vortex"; "Bone-In Deviated Sausage: DMG against bosses +15%"; "Mixed Fried Hot Dog: +20% damage to targets marked by The Bull's Eye"; "Ginger Poppers / Canned Meat: Shrapnel DMG +10%"; "Sparkling Pumpkin Soup: Power Surge DMG +10%"; "Roulette Dumplings: random +15% DMG vs elites, bosses or Deviants"; "Most combat and gathering buffs last 30 minutes, survival buffs … a full hour, Stardust Tea … two hours"; "Safety Sandwich: Reduce DMG from other players by 20% (1800 s, Combat)"; "Stargazy Pizza: Breathe underwater (1800 s, Survival)".
* fandom Canned Lunch Meat: "+80 Energy, +10% Max HP for 30 minutes, and an additional bonus … Bear Meat: Shrapnel DMG +2%; Beast Meat: Melee DMG +2%; Beef: Frost Vortex DMG +2%; Crocodile Meat: Power Surge DMG +2%; Deer Meat: DMG +2% against targets affected by The Bull's Eye; Goat Meat: Burn DMG +2%; Pork: Unstable Bomber DMG +2%; Poultry Meat: Bounce DMG +2%. Does not spoil."
* fandom Whimsical Drink / gamerant: "+100 Hydration, Sanity +1000, and +25% status damage for 30 minutes"; recipe location "1941, -2983 in Brewery Estate, Chalk Peak"; spoils after 24 h. One other source: "increases Psi Intensity by 30% for 30 minutes" (outlier).
* fandom Stardust Malt Ale: "Quick Reflexes … lasts 1800 seconds and increases all character action speeds by 20%." gamerant: "Malt Ale grants Clearminded … completely protected from Stardust pollution for 30 minutes"; "Corn Ale restores 100 Hydration and 1000 Sanity"; "Deviated versions provide the Quick Reflexes buff."
* fandom Stargazy Pie: "+100 Energy and +25% Crit DMG when the player has full energy for 30 minutes … 1 Deviated Pumpkin, 1 Deviated Saffron, 3 Deviated Wheat … spoiled after 24 hours."
* gameplay.tips / sportskeeda: Assorted Canned Fruit "Weakspot DMG +25% when Sanity is above 80%", "80 Energy, 40 Hydration", recipe "1 Deviated Beet, 1 Coconut, 1 Aluminum" (Alkirk sandwich shop).
* charlieintel (2024): Borscht Deluxe "Energy 100, Hydration 50, doubles Energy Links from Gear and Weapon Crates"; Bacon Burger "+30% chance to obtain ammo from crates" (conflicts with sheet); Herbal Tea "Hydration 100, Sanity 800, keeps Hydration and Energy full for 2 hours" (= Stardust Tea); Creamy Spaghetti Soup "+20% Deviation Securement" (= Stardust Italian Soup Can); Miracle Tea "Hydration 100, Healing Effect +10"; Potato Salad "Energy 80, +15% chance of doubling items in wilderness".
* Game8 recipe locations (Way of Winter): new recipes Popcorn, Fruit Cake, Mixed Fruit Pie, Snow Mushroom Fried Rice, Sparkling Pumpkin Soup, Ginger Poppers. Patch 1.4 (2025-01-15) "added … new item formulas and food recipes".
* Chef class (Game8 / theriagames / bisecthosting): Glutton talent → up to 2 food + 2 drink effects.

## 7. Disagreements (both values recorded in food.json)

| Item | Source A | Source B | Pick |
|---|---|---|---|
| Canned Meat / Canned Steak | fandom 2024-25: Shrapnel DMG +10% | TW sheet 2026-05: +20% | 20% (newer) — medium confidence |
| Stardust Malt Ale | fandom: Quick Reflexes, all action speeds +20%, 1800 s | TW sheet: Pollution Resist +100 (100/105) | TW sheet (newer), flagged; effect may have been reworked |
| Whimsical Drink sanity | fandom: Sanity +1000 | TW sheet: Sanity +125 | sheet; buff value (+25% Status DMG) agrees everywhere; one outlier says Psi Intensity +30% |
| Shattered Bread | gameleap: "+10 Weapon DMG" | fandom/TheGamer/allthings/sheet: +25% | 25% |
| French Fries | gameleap: "−20% DMG from Deviants" | fandom/sheet: Weapon DMG +20% in Fortress Warfare | +20% in Fortress Warfare |
| Bacon Burger | charlieintel: +30% ammo from crates | sheet: one-hit mining/logging | sheet |
| Stardust Tea sanity | fandom: 800 | sheet: 100 over 1 min | sheet |
| Chef Rex cap | OHMM: max 42% | sheet: max 38% (rating 5, activity ≥90) | 38% verified, 42% unverified |
| Stargazy Pie recipe | fandom: Deviated Pumpkin/Saffron/Wheat | sheet: 1 Deviated Corn, 1 Milk, 1 Cabbage, 2 Pumpkin | recipes changed over patches; irrelevant to buff value |
| Butter Matsutake | OHMM machine translation: "Status DMG Increase 8%/12%" | Chinese original: Status DMG **reduction** (taken) | reduction |

## 8. Not found / open

* Current (Oct 2026) season/patch name and any 2026 balance changes to food values.
* Full ingredient sub-buff table (per meat/fish/fruit/egg/milk, and Pristine vs common ingredient values) — only Canned Lunch Meat's +2% table found.
* Effects of: Fruit Cake, Mixed Fruit Pie, Snow Mushroom Fried Rice, Croquette, Curry and Rice, Yuanbao Dumplings, Ghoul Cookies, Securement Soup, Taco, Minty Meat Salad, Minty Tartare, Fiery Meat Skewer, Spicy Grilled Fish, Spicy Roasted Meat, Stardust Pumpkin Soup, Nut Jam, Stardust Corn Ale, all Chef "Creative Cuisine"/"Creative Beverages" items (Aromatic/Exquisite/Luxury/Supreme skewers & platters, Source of Deviation, Ultraman, Miracle Recovery Milk).
* Medicines/"activators": no combat-buff medicines were found (Adrenaline Shot, Antibiotics, Sanity Gummies only restore; no numbers retrieved). No item called "Activator" found.
* Whether differently-typed food buffs (Combat vs Survival vs Gathering) share the single food slot; whether Whim effects occupy a slot.
* Whether food % bonuses are additive with gear/mod bonuses of the same stat (assumed yes, standard bucketing).
* Official English name of 異想天開飲 (OHMM: "Signature Beverage").
* Why Sparkling Pumpkin Soup shows 57.75 min at the Stardust Fusion Stove (others 52.5).
