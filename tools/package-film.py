"""Build a portable web edition of an approved film. No upload is performed."""
import argparse
from html import escape
import json
import os
from pathlib import Path
from shutil import copyfile
import subprocess
from tempfile import TemporaryDirectory


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]))


def encode(source, destination, width, height, rate, peak):
    subprocess.run([
        'ffmpeg', '-v', 'error', '-nostdin', '-i', source, '-map', '0:v:0', '-map', '0:a:0?',
        '-vf', f"scale=w='min(iw,{width})':h='min(ih,{height})':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        '-c:v', 'libx264', '-preset', 'fast', '-threads', '4', '-profile:v', 'high',
        '-pix_fmt', 'yuv420p', '-crf', '20', '-maxrate', peak, '-bufsize', rate,
        '-force_key_frames', 'expr:gte(t,n_forced*2)', '-c:a', 'aac', '-b:a', '128k',
        '-map_metadata', '-1', '-movflags', '+faststart', destination], check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('master', type=Path)
    parser.add_argument('out', type=Path)
    parser.add_argument('--title', required=True)
    parser.add_argument('--original-url', help='Existing original-quality stream or download URL')
    args = parser.parse_args()
    if args.out.exists():
        parser.error('Choose a new output directory')
    args.out.parent.mkdir(exist_ok=True, parents=True)
    with TemporaryDirectory(dir=args.out.parent) as temp:
        package = Path(temp) / 'film'
        package.mkdir()
        info = probe(args.master)
        duration = float(info['format']['duration'])
        for name, w, h, buf, peak in [('film',1920,1080,'8400k','4200k'),('mobile',1280,720,'4100k','2050k')]:
            dest = package / (name + '.mp4')
            encode(args.master, dest, w, h, buf, peak)
            result = probe(dest)
            stream = next(s for s in result['streams'] if s['codec_type']=='video')
            if stream['codec_name']!='h264' or abs(float(result['format']['duration'])-duration)>.2:
                raise ValueError(f'Unexpected web format or duration in {dest.name}')
            if name == 'film':
                label = f"{stream['width']} × {stream['height']}"
        title = escape(args.title)
        link = ''
        option = ''
        if args.original_url:
            from urllib.parse import urlsplit
            if urlsplit(args.original_url).scheme not in ('http', 'https'):
                parser.error('--original-url must be an HTTP(S) media URL')
            link = f'<a download href="{escape(args.original_url, quote=True)}">Ladda ner originalet</a>'
            option = '<option value="original">Originalkvalitet</option>'
        page = f'''<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title><style>html{{color-scheme:dark;background:#0a1721;font:1rem system-ui}}main{{width:min(1120px,94vw);margin:4vh auto}}video{{display:block;width:100%;max-height:80vh;background:#000}}footer{{display:flex;gap:1em;align-items:center;flex-wrap:wrap;margin:1em 0}}a{{color:#ace5e2}}select{{font:inherit}}</style>
<main><h1>{title}</h1><video controls playsinline preload="auto"><source data-rendition="hd" src="film.mp4" type="video/mp4"><source data-rendition="mobile" src="mobile.mp4" type="video/mp4"></video>
<footer>{link}<label hidden id="quality-control">Bildkvalitet <select id="quality"><option value="best">{label}</option><option value="auto">Automatisk</option>{option}</select></label></footer></main>
<script src="film.js"></script></html>'''
        (package/'index.html').write_text(page, encoding='utf8')
        copyfile(Path(__file__).resolve().parents[1]/'docs/public-player/film.js', package/'film.js')
        os.rename(package,args.out)


if __name__ == '__main__':
    main()
