# H1 Report Exporter

HackerOne's built in PDF export is broken. This fixes it.

Screenshot based Chrome extension that captures reports as proper PDFs. Retina quality, full content, no layout chaos.

## Features

- Redact sensitive areas by drawing boxes before export
- Optional watermark tiled across every page
- Auto-expands collapsed sections so nothing gets cut off
- Outputs a single continuous page instead of awkward print fragments

## Install

1. Clone this repo
2. Go to `chrome://extensions`, enable **Developer mode**
3. Click **Load unpacked**, select the folder

## Usage

Open any HackerOne report and click **Export as PDF that actually works** next to H1's native export button (or use the toolbar icon). Add a watermark, draw redactions, hit export.

## License

MIT
