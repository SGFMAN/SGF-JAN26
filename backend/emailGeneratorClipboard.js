const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function pad10(n) {
  return String(n).padStart(10, "0");
}

function wrapCfHtml(fragment) {
  const header =
    "Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n";
  const prefix = "<html><body><!--StartFragment-->";
  const suffix = "<!--EndFragment--></body></html>";
  const startHTML = header.length;
  const startFragment = startHTML + prefix.length;
  const endFragment = startFragment + fragment.length;
  const endHTML = endFragment + suffix.length;
  return (
    `Version:0.9\r\nStartHTML:${pad10(startHTML)}\r\nEndHTML:${pad10(endHTML)}\r\nStartFragment:${pad10(
      startFragment
    )}\r\nEndFragment:${pad10(endFragment)}\r\n` +
    prefix +
    fragment +
    suffix
  );
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function setWindowsOutlookClipboard({ html, rtf }) {
  const fragment = String(html || "").trim();
  const rtfText = String(rtf || "").trim();
  if (!fragment) {
    throw new Error("Nothing to copy");
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgf-clip-"));
  const htmlPath = path.join(dir, "body.html");
  const rtfPath = path.join(dir, "body.rtf");
  fs.writeFileSync(htmlPath, wrapCfHtml(fragment), "utf8");
  fs.writeFileSync(rtfPath, rtfText, "utf8");
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$html = [System.IO.File]::ReadAllText(${psQuote(htmlPath)})
$rtf = [System.IO.File]::ReadAllText(${psQuote(rtfPath)})
$data = New-Object System.Windows.Forms.DataObject
$data.SetData([System.Windows.Forms.DataFormats]::Html, $html)
if ($rtf -and $rtf.Length -gt 0) {
  $data.SetData([System.Windows.Forms.DataFormats]::Rtf, $rtf)
}
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
`;
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-STA", "-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true, timeout: 20000 }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const detail = String(result.stderr || result.stdout || "").trim();
      throw new Error(detail || "Failed to set Windows clipboard");
    }
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  setWindowsOutlookClipboard,
};
