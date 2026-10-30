#!/bin/sh
# Generate a .webp next to every uploaded image so server.js can hand browsers
# the smaller file by content negotiation. Originals stay untouched, so the URLs
# in product data, sitemaps and social previews keep working. Safe to re-run.
#
# PNGs are always converted. JPEGs are skipped by default because cwebp drops
# EXIF metadata, which can rotate phone photos; set WEBP_JPEG=1 only for an
# upload library whose JPEGs carry no orientation tag.
set -eu
cd "${1:-$(dirname "$0")/../uploads}"
if [ "${WEBP_JPEG:-0}" = "1" ]; then
	set -- *.png *.jpg *.jpeg
else
	set -- *.png
fi
for f in "$@"; do
	[ -e "$f" ] || continue
	out="${f%.*}.webp"
	[ -e "$out" ] && continue
	size=$(wc -c < "$f")
	[ "$size" -lt 20480 ] && continue
	case "$f" in
	*.jpg|*.jpeg) q=78 ;;
	*) q=82 ;;
	esac
	cwebp -quiet -q "$q" -m 6 -metadata none "$f" -o "$out.tmp" || { rm -f "$out.tmp"; continue; }
	if [ "$(wc -c < "$out.tmp")" -lt "$size" ]; then mv "$out.tmp" "$out"; else rm -f "$out.tmp"; fi
done
