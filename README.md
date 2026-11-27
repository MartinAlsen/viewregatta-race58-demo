# ViewRegatta · Race 58

[Watch the complete race](https://martinalsen.github.io/viewregatta-race58-demo/) or [download the corrected 1080p film](https://apps-viewregatta-public-race58.storage.googleapis.com/stream-v3/Race58-1080p.mp4).

The 17:40 master opens with the helicopter approach to Stockholm and includes the complete Race 58 programme. The player offers streaming qualities for different connections. The current director uses an opaque score strip and preserves all programme audio and chapters. See its [media manifest](docs/race58-director.json). The earlier helicopter master is retained in the original release.

[Watch the full interactive Race 58](https://martinalsen.github.io/viewregatta-race58-demo/race58/) with a spectator camera and the programme soundtrack.

Existing GitHub Pages links to the film and interactive replay forward to the corresponding Google Cloud player and preserve chapter times. The [interactive player](https://apps-viewregatta-public-race58.storage.googleapis.com/race58/index.html) can automatically select the approved original video and audio when bandwidth allows. Select **Original** to lock that rendition. The Stockholm viewer uses the established GitHub Pages map origin inside the Cloud player.

On a large desktop display, Auto starts with a bandwidth-efficient 1080p stream and then adjusts using measured media transfers. The Google Cloud stream uses individually cacheable five-second segments. In landscape on a phone, tap the fullscreen button in the player controls. Where the browser provides fullscreen only for video, exit the system video player to resume the interactive camera.

### Publishing a directed film on the web

Use `python3 tools/package-film.py MASTER.mp4 NEW_OUTPUT_DIRECTORY --title "Event · Race number"` to build a portable edition for GitHub Pages, GSYS or a static media host. Add `--original-url https://…/master.mp4` when the master has an approved download address. Serve the resulting directory from a host with HTTP byte ranges and the video/mp4 MIME type. Open `?visning=hd` to request the compact, fast-start version at up to 1080p. The page preloads this version on a desktop and offers a lighter mobile version. A separate original is always an explicit choice. Keep private review material on its authorized host.

For interactive editions use the ViewRegatta interactive publisher's existing single media clock. Supply the economical 1080p source in the adaptive ladder and fixed-HD option, plus the mobile fallback and separate original. The director, commentary and spectator camera all depend on that shared clock. YouTube accepts the approved master and creates its own streaming versions.
