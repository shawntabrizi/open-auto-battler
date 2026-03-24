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
            "Placed against a plain, aged parchment-colored background with minimal vignette environment.{faction_palette}"
        ),
        "seed_offset": 0,
        "use_faction_palette": False,
    },
    "silhouette": {
        "name": "High-Contrast Silhouette",
        "description": "Dramatic vector-art silhouettes with distressed textures, per-faction color palettes",
        "prompt_template": (
            "A dramatic, high-contrast, modern graphic illustration for a vertical card design "
            "featuring {subject}. The style is vector-art based with heavy, distressed, rough "
            "texture overlays, reminiscent of screen-printing. {faction_palette} "
            "The subject is rendered largely in silhouette or very dark tones, sharply defined "
            "against a bright, back-lit background (like a moon shape, a wall of fire, or a stark sky). "
            "Include a dense field of suspended, jagged particles, sparks, and dust debris in the air. "
            "The composition is iconic and centered, with a clean or less busy top border area "
            "reserved for future card text."
        ),
        "seed_offset": 1000,
    },
    "kawaii": {
        "name": "Pastel Anime",
        "description": "Cute, light-hearted anime style with soft pastel colors, per-faction palette",
        "prompt_template": (
            "A cute anime-style character portrait of {subject}. "
            "Soft cel-shaded illustration with clean lines, round friendly features, and expressive eyes. "
            "Light-hearted and approachable, like a beloved gacha game or cozy RPG. "
            "{faction_palette} "
            "Soft diffused lighting with gentle highlights and minimal shadows. "
            "Simple clean background with soft pastel gradient and small sparkles or floating particles. "
            "Centered composition, character clearly visible, warm and inviting. "
            "No text, no border, no card frame."
        ),
        "seed_offset": 2000,
    },
}

# ---------------------------------------------------------------------------
# Faction color palettes for the silhouette theme
# ---------------------------------------------------------------------------

FACTION_PALETTES = {
    "silhouette": {
        "hive":        "The color palette must be strictly limited and highly saturated, utilizing deep amber gold, warm honey yellow, and dark, almost black, shadows.",
        "grove":       "The color palette must be strictly limited and highly saturated, utilizing deep forest greens, saturated lime greens, and pale yellowish-greens.",
        "academy":     "The color palette must be strictly limited and highly saturated, utilizing deep royal purple, vivid electric blue, and dark, almost black, shadows.",
        "order":       "The color palette must be strictly limited and highly saturated, utilizing radiant gold, bright white, and warm bronze shadows.",
        "undead":      "The color palette must be strictly limited and highly saturated, utilizing deep purple, vivid lime green, and dark, almost black, shadows.",
        "wilds":       "The color palette must be strictly limited and highly saturated, utilizing warm oranges, deep amber yellows, and rich reddish-browns.",
        "guild":       "The color palette must be strictly limited and highly saturated, utilizing deep crimson red, fiery gold, and dark, almost black, shadows.",
        "horde":       "The color palette must be strictly limited and highly saturated, utilizing blood red, searing orange, and dark charcoal shadows.",
        "fallen":      "The color palette must be strictly limited and highly saturated, utilizing icy silver-blue, ghostly pale white, and deep midnight blue shadows.",
        "mercenaries": "The color palette must be strictly limited and highly saturated, utilizing steel gray, warm brown leather tones, and dark, almost black, shadows.",
    },
    "kawaii": {
        "hive":        "Warm pastel palette: soft honey yellow, creamy amber, gentle peach, with white highlights.",
        "grove":       "Fresh pastel palette: soft mint green, light sage, pale lime, with cream highlights.",
        "academy":     "Magical pastel palette: soft lavender, periwinkle blue, pale violet, with pink sparkle highlights.",
        "order":       "Holy pastel palette: warm champagne gold, soft cream, pearl white, with gentle rose highlights.",
        "undead":      "Spooky-cute pastel palette: soft lilac purple, pale mint, dusty rose, with ghostly white highlights.",
        "wilds":       "Nature pastel palette: soft coral, warm peach, pale terracotta, with cream highlights.",
        "guild":       "Luxe pastel palette: soft rose gold, warm blush pink, pale champagne, with gold shimmer highlights.",
        "horde":       "Fierce pastel palette: soft cherry pink, warm salmon, pale coral, with cream highlights.",
        "fallen":      "Dreamy pastel palette: soft sky blue, pale periwinkle, light silver, with white glow highlights.",
        "mercenaries": "Neutral pastel palette: soft taupe, warm beige, pale mushroom, with cream highlights.",
    },
}

# Map card ID ranges to faction keys
def get_faction(card_id: int) -> str:
    if card_id <= 9: return "hive"
    if card_id <= 20: return "grove"
    if card_id <= 31: return "academy"
    if card_id <= 42: return "order"
    if card_id <= 53: return "undead"
    if card_id <= 65: return "wilds"
    if card_id <= 76: return "guild"
    if card_id <= 87: return "horde"
    if card_id <= 97: return "fallen"
    if card_id <= 102: return "mercenaries"
    # Tokens — match parent faction
    if card_id <= 107: return "hive"      # Grub, Hatchling, Nymph, Moth, Drone
    if card_id == 108: return "undead"     # Phylactery
    if card_id == 109: return "hive"       # Stinger
    return "mercenaries"

# ---------------------------------------------------------------------------
# Card art descriptions (parsed from CARD_ART_DESCRIPTIONS.md)
# ---------------------------------------------------------------------------

DESCRIPTIONS_MD = SCRIPT_DIR.parent / "docs" / "CARD_ART_DESCRIPTIONS.md"

def load_descriptions() -> dict[str, str]:
    """Parse CARD_ART_DESCRIPTIONS.md and return {card_name_lower: description}."""
    import re
    descriptions = {}
    text = DESCRIPTIONS_MD.read_text()
    # Match table rows: | Name | Cost | Description | or | Name | Description |
    for match in re.finditer(r'^\|\s*([^|]+?)\s*\|(?:\s*\d*\s*\|)?\s*([^|]+?)\s*\|', text, re.MULTILINE):
        name = match.group(1).strip()
        desc = match.group(2).strip()
        # Skip header rows
        if name.startswith('--') or name == 'Name' or desc.startswith('--') or desc == 'Description' or desc == 'Cost':
            continue
        descriptions[name.lower()] = desc
    return descriptions

_DESCRIPTIONS = None

def get_descriptions() -> dict[str, str]:
    global _DESCRIPTIONS
    if _DESCRIPTIONS is None:
        _DESCRIPTIONS = load_descriptions()
    return _DESCRIPTIONS


def build_prompt(card_name: str, card: dict, card_id: int, theme: dict, theme_key: str) -> str:
    """Build the full image generation prompt for a card + theme."""
    descs = get_descriptions()
    subject = descs.get(card_name.lower(), f"a fantasy creature called {card_name}")
    faction = get_faction(card_id)
    faction_palette = ""
    if theme.get("use_faction_palette", True):
        # Look up per-theme palette, fall back to silhouette palettes
        theme_palettes = FACTION_PALETTES.get(theme_key, FACTION_PALETTES.get("silhouette", {}))
        faction_palette = theme_palettes.get(faction, theme_palettes.get("mercenaries", ""))
    return theme["prompt_template"].format(subject=subject, faction_palette=faction_palette)


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
            prompt = build_prompt(card["name"], card, card["id"], theme, args.theme)
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

        prompt = build_prompt(card_name, card, card_id, theme, args.theme)
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
