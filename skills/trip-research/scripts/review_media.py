"""Audit source pixels and editorial evidence before full-size portrait-card publication.

Requires Pillow. Run with --help. Review inputs describe the *selected* original
files, not arbitrary larger images from the same venue. The script measures native
pixels and reproduces the application's centered object-fit:cover composition;
human inspection still decides whether the actual experience survives that crop.
It never downloads, changes, enlarges or republishes the original media.
"""
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def crop_box(size, viewport):
    """Compute the native region remaining after a centered cover crop."""
    width, height = size
    ratio = viewport["width"] / viewport["height"]
    visible_width, visible_height = min(width, height * ratio), min(height, width / ratio)
    return ((width - visible_width) / 2, (height - visible_height) / 2,
            (width + visible_width) / 2, (height + visible_height) / 2)


def audit_image(record, policy):
    reasons = []
    result = {"cardId": record["cardId"], "url": record.get("selectedUrl"), "reasons": reasons}
    if record.get("url") != record.get("selectedUrl"):
        reasons.append("Reviewed URL differs from the selected card URL")
    try:
        with Image.open(record["path"]) as source:
            photo = ImageOps.exif_transpose(source)
            width, height = photo.size
        box = crop_box((width, height), policy["viewport"])
        visible = {"width": math.floor(box[2] - box[0]), "height": math.floor(box[3] - box[1])}
        result.update({"width": width, "height": height, "visiblePixels": visible})
        if max(width, height) < policy["minLongEdge"] or min(width, height) < policy["minShortEdge"]:
            reasons.append("Native source resolution is below the configured floor")
        if visible["width"] < policy["minVisibleWidth"] or visible["height"] < policy["minVisibleHeight"]:
            reasons.append("Too few native pixels remain in the visible card crop")
    except (OSError, KeyError, ValueError) as error:
        reasons.append(f"Cannot decode reviewed original: {error}")
    for field in ("representative", "cropRepresentative", "sharpnessReviewed", "notUpscaled"):
        if record.get(field) is not True:
            reasons.append(f"Missing or rejected editorial decision: {field}")
    for field in ("inspection", "sourceEvidence", "seasonEvidence"):
        if not isinstance(record.get(field), str) or not record[field].strip():
            reasons.append(f"Missing evidence: {field}")
    result["passed"] = not reasons
    return result


def audit_pack(pack, records, policy):
    """Bind every still review to the real draft, so a partial audit cannot pass."""
    by_id = {record["cardId"]: record for record in records}
    results = []
    for card in pack["cards"]:
        if not card.get("image"):
            continue
        record = by_id.get(card["id"])
        if record is None:
            results.append({"cardId": card["id"], "passed": False,
                            "reasons": ["Selected still has no original-and-crop review"]})
        else:
            results.append(audit_image({**record, "selectedUrl": card["image"]["url"]}, policy))
    return {"passed": all(result["passed"] for result in results), "results": results}


def make_contact_sheet(records, policy, output):
    """Temporary inspection derivative only; the live card keeps the original URL."""
    tile_width = policy["contactSheetThumbnailWidth"]
    tile_height = round(tile_width * policy["viewport"]["height"] / policy["viewport"]["width"])
    label_height = 40
    columns = policy["contactSheetColumns"]
    sheet = Image.new("RGB", (columns * tile_width,
                               math.ceil(len(records) / columns) * (tile_height + label_height)), "white")
    draw = ImageDraw.Draw(sheet)
    for index, record in enumerate(records):
        x, y = (index % columns) * tile_width, (index // columns) * (tile_height + label_height)
        try:
            with Image.open(record["path"]) as source:
                photo = ImageOps.exif_transpose(source).convert("RGB")
                crop = photo.crop(crop_box(photo.size, policy["viewport"]))
                crop.thumbnail((tile_width, tile_height))
                sheet.paste(crop, (x, y))
        except (OSError, KeyError):
            draw.text((x + 4, y + 4), "Unreadable source", fill="red")
        draw.text((x + 4, y + tile_height + 4), record["cardId"][:32], fill="black")
    sheet.save(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="JSON array of reviewed original files and decisions")
    parser.add_argument("--pack", type=Path, required=True, help="Canonical draft whose selected stills must all be reviewed")
    parser.add_argument("--policy", type=Path, default=Path(__file__).parents[1] / "references/media-policy.json")
    parser.add_argument("--output", type=Path, required=True, help="Measured per-card audit JSON")
    parser.add_argument("--contact-sheet", type=Path, help="Optional temporary portrait inspection sheet")
    args = parser.parse_args()
    records = json.loads(args.input.read_text())
    policy = json.loads(args.policy.read_text())
    pack = json.loads(args.pack.read_text())
    audit = audit_pack(pack, records, policy)
    results = audit["results"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"policy": policy, "results": results}, ensure_ascii=False, indent=2) + "\n")
    if args.contact_sheet and records:
        args.contact_sheet.parent.mkdir(parents=True, exist_ok=True)
        make_contact_sheet(records, policy, args.contact_sheet)
    failures = [result for result in results if not result["passed"]]
    print(json.dumps({"reviewed": len(results), "passed": len(results) - len(failures),
                      "failed": [result["cardId"] for result in failures]}, ensure_ascii=False))
    return not audit["passed"]


if __name__ == "__main__":
    raise SystemExit(main())
