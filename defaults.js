// Shared storage helpers for the export panel.
window.H1ExporterDefaults = {
  DEFAULT_OPTIONS: {
    watermark_text: "",
    expand_collapsed: true,
    filename_pattern: "h1-report-{id}-{title}"
  },
  async getOptions() {
    const stored = await chrome.storage.sync.get(this.DEFAULT_OPTIONS);
    return { ...this.DEFAULT_OPTIONS, ...stored };
  },
  async setOptions(patch) {
    await chrome.storage.sync.set(patch);
  }
};
