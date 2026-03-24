#!/usr/bin/env python3
"""
Batch card art generator using ComfyUI's API.

Usage:
  1. Start ComfyUI:  cd ~/Documents/ComfyUI && python3 main.py --listen
  2. Run this script: python3 scripts/generate_card_art.py --theme storybook

Options:
  --theme THEME   Art style theme (default: storybook)
  --start ID      Resume from this card ID (default: 0)
  --only-missing  Skip cards that already have output files
  --list-themes   Show available themes and exit

Output goes to scripts/card_art_output/<theme>/{sm,md}/<card_id>.webp
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
CARDS_JSON = PROJECT_DIR / "cards" / "cards.json"
OUTPUT_BASE = SCRIPT_DIR / "card_art_output"

# Image sizes — 2:3 ratio (standard trading card), each 2x the previous
SIZE_SM = (256, 384)
SIZE_MD = (512, 768)
SIZE_LG = (1024, 1536)

# Flux model paths (relative to ComfyUI models dir)
UNET_MODEL = "flux1-dev.safetensors"
CLIP1 = "clip_l.safetensors"
CLIP2 = "t5xxl_fp16.safetensors"
VAE_MODEL = "ae.safetensors"

STEPS = 20
CFG = 1.0  # Flux uses low CFG
SAMPLER = "euler"
SCHEDULER = "simple"
SEED_BASE = 42  # Deterministic seeds: seed = SEED_BASE + card_id

# ---------------------------------------------------------------------------
# Theme definitions
# ---------------------------------------------------------------------------

THEMES = {
    "storybook": {
        "name": "Victorian Storybook",
        "description": "Vintage 19th-century children's book illustration, pen and ink with watercolor",
        "prompt_template": (
            "A vintage 19th-century storybook illustration of {subject}. "
            "Pen and ink drawing with muted watercolor wash. "
            "Distinct black outlines, crosshatching shading, etched texture. "
            "Earthy, faded colors. Classic fairy tale aesthetic, Victorian lithograph style. "
            "Placed against a plain, aged parchment-colored background with minimal vignette environment."
        ),
        "seed_offset": 0,
    },
    # -- Add more themes below --
    # "dark_fantasy": {
    #     "name": "Dark Fantasy Oil Painting",
    #     "description": "Moody oil painting style with dramatic chiaroscuro lighting",
    #     "prompt_template": (
    #         "A dark fantasy oil painting of {subject}. "
    #         "Rich impasto brushwork, dramatic chiaroscuro lighting, deep shadows. "
    #         "Dark moody color palette with glowing highlights. "
    #         "Renaissance master painting technique, museum quality. "
    #         "Dark background with subtle atmospheric depth."
    #     ),
    #     "seed_offset": 1000,
    # },
    # "anime": {
    #     "name": "Stylized Anime Card Art",
    #     "description": "Clean anime-inspired card art with cel shading",
    #     "prompt_template": (
    #         "Anime-style trading card art of {subject}. "
    #         "Clean cel shading, bold outlines, vibrant saturated colors. "
    #         "Dynamic pose, detailed character design. "
    #         "Japanese illustration style, high contrast, polished. "
    #         "Simple gradient background with soft glow effects."
    #     ),
    #     "seed_offset": 2000,
    # },
}

# ---------------------------------------------------------------------------
# Card subject descriptions
# ---------------------------------------------------------------------------

def build_subject(card_name: str, card: dict) -> str:
    """Build a descriptive subject phrase for the card.

    Each card gets a hand-crafted or auto-generated subject description
    that works well inside the theme's prompt template.
    """
    # Hand-crafted subjects for every card give much better results.
    # The key is the card name (case-insensitive).
    SUBJECT_MAP = {
        # --- Original fantasy cards (0-43) ---
        "rat swarm": "a scurrying horde of mangy rats with glowing red eyes",
        "goblin scout": "a sneaky goblin scout crouching with a crude spyglass",
        "goblin grunt": "a stocky goblin grunt wielding a rusty cleaver",
        "scaredy cat": "a wide-eyed frightened cat with its fur standing on end",
        "brave commander": "a courageous armored commander raising a sword to rally troops",
        "militia": "a determined peasant militia soldier with a spear and wooden shield",
        "shield bearer": "a stout shield bearer bracing behind a massive tower shield",
        "nurse goblin": "a kindly goblin nurse carrying bandages and healing herbs",
        "wolf rider": "a fierce goblin mounted on a snarling wolf",
        "martyr knight": "a selfless knight in cracked armor, glowing with sacrificial light",
        "abyssal bomber": "a cackling imp clutching a sputtering bomb",
        "archer": "a keen-eyed archer drawing a longbow",
        "sniper": "a hooded marksman aiming a crossbow from the shadows",
        "skeleton archer": "a skeletal archer with tattered rags nocking a bone arrow",
        "battle hardened": "a scarred veteran warrior covered in old wounds and dented armor",
        "lone wolf": "a solitary wolf standing proud on a rocky outcrop",
        "pack leader": "an alpha wolf howling to summon its pack",
        "spined urchin": "a spiky sea urchin creature bristling with venomous spines",
        "vampire": "a pale vampire lord with crimson eyes and a flowing cape",
        "raging orc": "a furious orc berserker mid-charge with a massive axe",
        "zombie captain": "an undead captain in rusted armor, one eye glowing green",
        "necromancer": "a sinister necromancer raising skeletal hands from the ground",
        "headhunter": "a tribal headhunter carrying shrunken trophies on a belt",
        "giant slayer": "a small but fearless warrior wielding an oversized sword",
        "shield squire": "a young squire struggling to carry a shield twice their size",
        "warder": "a vigilant warden with glowing protective runes on their armor",
        "artillery mage": "a battle mage conjuring a massive fireball between their hands",
        "rear guard": "a stalwart soldier standing watch at the back of a formation",
        "troll brute": "a massive troll with mossy skin swinging a tree trunk as a club",
        "lich": "an ancient lich king with a crown of bone and swirling dark magic",
        "assassin": "a shadowy assassin emerging from darkness with twin daggers",
        "fire elemental": "a blazing fire elemental made of living flame",
        "ogre mauler": "a hulking ogre smashing the ground with a spiked club",
        "phoenix": "a magnificent phoenix reborn in a burst of golden flames",
        "shield master": "an elite guardian wielding twin shields in a defensive stance",
        "void walker": "a mysterious figure stepping through a rift in reality",
        "mana reaper": "a spectral reaper harvesting glowing blue mana orbs",
        "giant crusher": "an enormous giant raising a boulder overhead",
        "behemoth": "a colossal armored beast towering over the battlefield",
        "dragon tyrant": "a terrifying dragon wreathed in fire atop a mountain of gold",
        # --- Tokens (40-46) ---
        "rat token": "a single scrappy rat baring tiny teeth",
        "zombie soldier": "a shambling zombie soldier with a broken sword",
        "golem": "a small stone golem with glowing rune eyes",
        "phoenix egg": "a glowing ember egg crackling with inner fire",
        "zombie cricket": "a small undead cricket with tattered wings",
        "ram": "a stubborn ram lowering its curled horns to charge",
        "spiderling": "a tiny spider hatchling with eight gleaming eyes",
        # --- Animal cards (47-109) ---
        "ant": "a determined ant carrying a leaf many times its size",
        "beaver": "a industrious beaver gnawing through a log",
        "cricket": "a chirping cricket perched on a blade of grass",
        "duck": "a plucky duck with a confident waddle",
        "fish": "a shimmering fish leaping out of water",
        "horse": "a powerful warhorse rearing up on its hind legs",
        "mosquito": "an annoying mosquito with oversized proboscis",
        "mouse": "a clever little mouse holding a crumb of cheese",
        "otter": "a playful otter floating on its back",
        "pig": "a round cheerful pig rolling in mud",
        "crab": "a feisty crab snapping its oversized claws",
        "flamingo": "an elegant flamingo standing on one leg",
        "hedgehog": "a bristly hedgehog curled into a defensive ball",
        "kangaroo": "a boxing kangaroo in a fighting stance",
        "peacock": "a magnificent peacock displaying its full tail feathers",
        "rat": "a cunning rat with a long whip-like tail",
        "snail": "a slow but armored snail with a spiral shell",
        "spider": "a patient spider weaving an intricate web",
        "swan": "a graceful swan gliding across still water",
        "worm": "a wriggling earthworm emerging from rich soil",
        "badger": "a fierce badger baring its teeth from a burrow",
        "camel": "a stoic camel trudging through desert sands",
        "dodo": "a plump dodo bird with a bewildered expression",
        "dog": "a loyal hound standing guard with alert ears",
        "dolphin": "a sleek dolphin arcing through ocean waves",
        "elephant": "a mighty elephant trumpeting with raised trunk",
        "giraffe": "a tall giraffe reaching for leaves in a treetop",
        "ox": "a powerful ox pulling against a heavy yoke",
        "rabbit": "a quick rabbit mid-leap with ears back",
        "sheep": "a fluffy sheep with a gentle, calm expression",
        "bison": "a massive bison charging through tall grass",
        "blowfish": "a puffed-up blowfish covered in sharp spines",
        "deer": "a noble stag with a magnificent rack of antlers",
        "hippo": "a yawning hippopotamus showing enormous teeth",
        "parrot": "a colorful parrot perched on a branch, squawking",
        "penguin": "a waddling penguin clutching a small fish",
        "skunk": "a striped skunk with its tail raised in warning",
        "squirrel": "a nimble squirrel clutching an acorn",
        "turtle": "an ancient turtle with a moss-covered shell",
        "whale": "a breaching whale erupting from the ocean",
        "armadillo": "an armadillo curled into an armored ball",
        "cow": "a sturdy cow chewing cud in a meadow",
        "crocodile": "a lurking crocodile with eyes just above the waterline",
        "monkey": "a mischievous monkey swinging from a vine",
        "rhino": "a charging rhinoceros with a massive horn",
        "rooster": "a proud rooster crowing at dawn",
        "scorpion": "a menacing scorpion with its stinger raised to strike",
        "seal": "a sleek seal balancing a ball on its nose",
        "shark": "a great white shark surging through dark water",
        "turkey": "a plump turkey with its tail feathers fanned out",
        "boar": "a wild boar with tusks lowered for a charge",
        "cat": "a mysterious cat with glowing eyes in moonlight",
        "dragon": "a fearsome dragon breathing a torrent of fire",
        "fly": "an iridescent fly with shimmering compound eyes",
        "gorilla": "a mighty silverback gorilla beating its chest",
        "leopard": "a sleek leopard crouching on a tree branch",
        "mammoth": "an ancient woolly mammoth with enormous curved tusks",
        "snake": "a coiled serpent with fangs bared and hood flared",
        "tiger": "a prowling tiger with burning orange stripes",
        "wolverine": "a ferocious wolverine snarling with bared claws",
        "bus": "a peculiar enchanted bus with legs instead of wheels",
        "chick": "a tiny fluffy chick peeping with its beak open",
        "zombie fly": "a decaying undead fly buzzing with tattered wings",
    }

    key = card_name.lower()
    if key in SUBJECT_MAP:
        return SUBJECT_MAP[key]

    # Fallback: use the card name directly with a generic description
    return f"a fantasy creature called {card_name}"


def build_prompt(card_name: str, card: dict, theme: dict) -> str:
    """Build the full image generation prompt for a card + theme."""
    subject = build_subject(card_name, card)
    return theme["prompt_template"].format(subject=subject)


# ---------------------------------------------------------------------------
# ComfyUI API workflow
# ---------------------------------------------------------------------------

def build_workflow(prompt: str, width: int, height: int, seed: int) -> dict:
    """Build a ComfyUI API workflow JSON for Flux.1 Dev."""
    return {
        "prompt": {
            # KSampler
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": seed,
                    "steps": STEPS,
                    "cfg": CFG,
                    "sampler_name": SAMPLER,
                    "scheduler": SCHEDULER,
                    "denoise": 1.0,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0],
                },
            },
            # Load Diffusion Model (UNet)
            "4": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": UNET_MODEL,
                    "weight_dtype": "default",
                },
            },
            # Empty Latent Image
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": 1,
                },
            },
            # CLIP Text Encode (positive)
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": prompt,
                    "clip": ["10", 0],
                },
            },
            # CLIP Text Encode (negative - empty for Flux)
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": "",
                    "clip": ["10", 0],
                },
            },
            # VAE Decode
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["9", 0],
                },
            },
            # VAE Loader
            "9": {
                "class_type": "VAELoader",
                "inputs": {
                    "vae_name": VAE_MODEL,
                },
            },
            # Dual CLIP Loader (for Flux)
            "10": {
                "class_type": "DualCLIPLoader",
                "inputs": {
                    "clip_name1": CLIP1,
                    "clip_name2": CLIP2,
                    "type": "flux",
                },
            },
            # Save Image
            "11": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "card_art",
                    "images": ["8", 0],
                },
            },
        }
    }


# ---------------------------------------------------------------------------
# ComfyUI API helpers
# ---------------------------------------------------------------------------

def queue_prompt(workflow: dict) -> str:
    """Submit a workflow to ComfyUI and return the prompt_id."""
    data = json.dumps(workflow).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    return result["prompt_id"]


def wait_for_completion(prompt_id: str, timeout: int = 300) -> dict:
    """Poll ComfyUI until the prompt completes. Returns the history entry."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(f"{COMFYUI_URL}/history/{prompt_id}")
            with urllib.request.urlopen(req) as resp:
                history = json.loads(resp.read())
            if prompt_id in history:
                return history[prompt_id]
        except urllib.error.URLError:
            pass
        time.sleep(2)
    raise TimeoutError(f"Prompt {prompt_id} did not complete within {timeout}s")


def download_image(filename: str, subfolder: str = "") -> bytes:
    """Download a generated image from ComfyUI."""
    params = f"filename={filename}"
    if subfolder:
        params += f"&subfolder={subfolder}"
    req = urllib.request.Request(f"{COMFYUI_URL}/view?{params}")
    with urllib.request.urlopen(req) as resp:
        return resp.read()


def save_webp(image_data: bytes, output_path: Path, target_size: tuple[int, int]):
    """Save image data as .webp at the target size. Requires Pillow."""
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(image_data))
    img = img.resize(target_size, Image.LANCZOS)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(str(output_path), "WEBP", quality=85)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Batch card art generator via ComfyUI")
    parser.add_argument("--theme", default="storybook", help="Art style theme (default: storybook)")
    parser.add_argument("--start", type=int, default=0, help="Resume from this card ID")
    parser.add_argument("--only-missing", action="store_true", help="Skip cards with existing output")
    parser.add_argument("--list-themes", action="store_true", help="Show available themes and exit")
    parser.add_argument("--dry-run", action="store_true", help="Print prompts without generating")
    args = parser.parse_args()

    if args.list_themes:
        print("Available themes:\n")
        for key, theme in THEMES.items():
            print(f"  {key:20s} {theme['name']}")
            print(f"  {'':20s} {theme['description']}")
            print()
        sys.exit(0)

    if args.theme not in THEMES:
        print(f"ERROR: Unknown theme '{args.theme}'")
        print(f"Available: {', '.join(THEMES.keys())}")
        sys.exit(1)

    theme = THEMES[args.theme]
    output_dir = OUTPUT_BASE / args.theme
    output_sm = output_dir / "sm"
    output_md = output_dir / "md"
    output_lg = output_dir / "lg"

    # Load cards
    with open(CARDS_JSON) as f:
        cards = json.load(f)

    print(f"Theme:  {theme['name']}")
    print(f"Cards:  {len(cards)}")
    print(f"Output: {output_dir}")
    print(f"ComfyUI: {COMFYUI_URL}")
    print()

    if args.dry_run:
        for card in cards:
            if card["id"] < args.start:
                continue
            prompt = build_prompt(card["name"], card, theme)
            print(f"[{card['id']:3d}] {card['name']}")
            print(f"      {prompt}")
            print()
        sys.exit(0)

    # Check ComfyUI is running
    try:
        urllib.request.urlopen(f"{COMFYUI_URL}/system_stats")
    except urllib.error.URLError:
        print(f"ERROR: Cannot reach ComfyUI at {COMFYUI_URL}")
        print("Start it with: cd ~/Documents/ComfyUI && python3 main.py --listen")
        sys.exit(1)

    # Create output dirs
    output_sm.mkdir(parents=True, exist_ok=True)
    output_md.mkdir(parents=True, exist_ok=True)
    output_lg.mkdir(parents=True, exist_ok=True)

    # Generate at MD size, then downscale to SM
    gen_width, gen_height = SIZE_MD

    total = len(cards)
    generated = 0
    skipped = 0
    failed = 0

    for card in cards:
        card_id = card["id"]
        card_name = card["name"]

        if card_id < args.start:
            continue

        sm_path = output_sm / f"{card_id}.webp"
        md_path = output_md / f"{card_id}.webp"
        lg_path = output_lg / f"{card_id}.webp"

        if args.only_missing and sm_path.exists() and md_path.exists() and lg_path.exists():
            skipped += 1
            continue

        prompt = build_prompt(card_name, card, theme)
        seed = SEED_BASE + theme.get("seed_offset", 0) + card_id

        print(f"[{card_id:3d}/{total}] {card_name}")
        print(f"  Prompt: {prompt[:120]}...")

        try:
            workflow = build_workflow(prompt, gen_width, gen_height, seed)
            prompt_id = queue_prompt(workflow)
            print(f"  Queued: {prompt_id[:8]}... waiting...")

            history = wait_for_completion(prompt_id, timeout=300)

            # Extract the output image filename from history
            outputs = history.get("outputs", {})
            image_info = None
            for node_id, node_output in outputs.items():
                if "images" in node_output:
                    image_info = node_output["images"][0]
                    break

            if not image_info:
                print(f"  ERROR: No image output found")
                failed += 1
                continue

            # Download the generated image
            image_data = download_image(
                image_info["filename"],
                image_info.get("subfolder", ""),
            )

            # Save as webp at all three sizes (lg is the raw gen size)
            save_webp(image_data, lg_path, SIZE_LG)
            save_webp(image_data, md_path, SIZE_MD)
            save_webp(image_data, sm_path, SIZE_SM)
            generated += 1

            print(f"  Saved: lg + md + sm for card {card_id}")

        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1
            continue

    print()
    print(f"Done! Generated: {generated}, Skipped: {skipped}, Failed: {failed}")
    print(f"Output: {output_dir}")


if __name__ == "__main__":
    main()
