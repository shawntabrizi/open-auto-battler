#!/usr/bin/env bash
# Copies and renames Midjourney card art from source dir to web/public/images/cards/
# Usage: ./prepare-card-art.sh [source_dir]
#   source_dir defaults to ~/Downloads/gameimgs/

set -euo pipefail

SRC="${1:-$HOME/Downloads/gameimgs}"
DST="$(cd "$(dirname "$0")/.." && pwd)/public/images/cards"

mkdir -p "$DST"

# Map: "id:image_short_name" — one per line
# The image short name is the part between jet_tf_ and _magic_the_g in the filename
MAPPINGS="
0:rat_swarm
1:goblin_scout
2:goblin_grunt
3:scaredy_cat
4:brave_commander
5:militia
6:shield_bearer
7:nurse_goblin
8:wolf_rider
9:martyr_knight
10:abyssal_bomber
11:archer
12:sniper
13:skeleton_archer
14:battle_hardened
15:lone_wolf
16:pack_leader
17:spined_urchin
18:vampire
19:raging_orc
20:zombie_captain
21:necromancer
22:headhunter
23:giant_slayer
24:shield_squire
25:warder
26:magical_mage_with_a_staff_wielding_artillery
27:Rear_Guard
28:Troll_Brute
29:Lich
30:Assassin
31:Fire_Elemental
32:Ogre_Mauler
33:phoenix
34:shield_master
35:void_walker
36:mana_reaper
37:crusher_of_giants
38:behemoth
39:dragon_tyrant
40:rat_token
41:zombie_soldier
42:golem
43:phoenix_egg
44:zombie_cricket
45:ram
46:spiderling
47:ant
48:beaver
49:cricket_insect_going_to_battle
50:duck
51:fish
52:horse
53:mosquito_going_in_for_the_sting
54:mouse
55:otter
56:pig
57:crab
58:flamingo
59:hedgehog
60:kangaroo
61:peacock
62:rat
63:snail
64:spider
65:swan
66:earthworm
67:badger
68:camel
69:dodo
70:dog
71:dolphin
72:elephant
73:giraffe
74:ox
75:rabbit
76:sheep
77:bison
78:blowfish
79:deer
80:hippo
81:parrot
82:penguin
83:skunk
84:squirrel
85:turtle
86:whale
87:armadillo
88:cow
89:crocodile
90:monkey
91:rhino
92:rooster
93:scorpion
94:seal
95:shark
96:turkey
97:boar
98:cat
99:dragon
100:fly
101:gorilla
102:leopard
103:mammoth
104:snake
105:tiger
106:anthro_wolverine_animal
107:bus
108:chick
109:zombie_fly
"

copied=0
missing=0

for line in $MAPPINGS; do
  id="${line%%:*}"
  name="${line#*:}"

  # Find matching file (case-insensitive)
  src_file=$(find "$SRC" -maxdepth 1 -iname "jet_tf_${name}_magic_the_g*" -print -quit 2>/dev/null || true)
  if [[ -n "$src_file" ]]; then
    cp "$src_file" "$DST/${id}.png"
    copied=$((copied + 1))
  else
    echo "WARNING: No image found for ID $id (${name})"
    missing=$((missing + 1))
  fi
done

echo ""
echo "=== Summary ==="
echo "Copied: $copied images to $DST"
echo "Missing: $missing"
