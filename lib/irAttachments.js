// IR attachments: the KAM's files are zipped on the server, then uploaded to one Google Drive folder.
// The Drive Link (webViewLink) goes into the escalation and the IR sheet (column K).
// Needs DRIVE_IR_FOLDER_ID and the drive.file scope on GOOGLE_OAUTH_REFRESH_TOKEN.
import { Readable } from 'node:stream';
import { loadGoogle } from './googleLazy.js';
import { getGoogleAuth } from './sheets.js';
import { attachmentZipName } from './irEscalation.mjs';

// Keep only the file name (no folders), and make names unique inside the zip.
function safeEntryName(name, used) {
  const base = String(name || 'file').split(/[\\/]/).pop().replace(/[^\w .()-]+/g, '_').slice(0, 120) || 'file';
  let candidate = base, n = 1;
  while (used.has(candidate)) {
    const dot = base.lastIndexOf('.');
    candidate = dot > 0 ? `${base.slice(0, dot)} (${n})${base.slice(dot)}` : `${base} (${n})`;
    n++;
  }
  used.add(candidate);
  return candidate;
}

export async function zipAttachments(files) {
  const { default: JSZip } = await import('jszip'); // loaded only when a zip is built (cold-start cost)
  const zip = new JSZip();
  const used = new Set();
  for (const f of files) {
    zip.file(safeEntryName(f.name, used), Buffer.from(await f.arrayBuffer()));
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// Zips the files and uploads the zip. Returns { drive_link, attachment_name }.
export async function uploadIrAttachments(issueId, files) {
  const folder = process.env.DRIVE_IR_FOLDER_ID;
  if (!folder) throw new Error('DRIVE_IR_FOLDER_ID is not set. Attachments were not saved.');
  const name = attachmentZipName(issueId);
  const buffer = await zipAttachments(files);
  const drive = (await loadGoogle()).drive({ version: 'v3', auth: await getGoogleAuth() });
  const res = await drive.files.create({
    requestBody: { name, parents: [folder], mimeType: 'application/zip' },
    media: { mimeType: 'application/zip', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  const id = res.data.id;
  if (!id) throw new Error('Drive upload returned no file ID');
  return { drive_link: res.data.webViewLink || `https://drive.google.com/file/d/${id}/view`, attachment_name: name };
}

// One-time setup helper for the IR folder. Finds the "IR Attachments" folder this app created earlier,
// or creates it. The drive.file scope only sees files the app created, so this reuses only its own folder.
// Returns { id, name, link, created }. The caller shows the ID so an admin can put it in DRIVE_IR_FOLDER_ID.
const IR_FOLDER_NAME = 'IR Attachments';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function ensureIrFolder() {
  const drive = (await loadGoogle()).drive({ version: 'v3', auth: await getGoogleAuth() });
  const found = await drive.files.list({
    q: `name = '${IR_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    spaces: 'drive',
    fields: 'files(id,name,webViewLink)',
  });
  let folder = found.data.files?.[0];
  let created = false;
  if (!folder) {
    const res = await drive.files.create({
      requestBody: { name: IR_FOLDER_NAME, mimeType: FOLDER_MIME },
      fields: 'id,name,webViewLink',
    });
    folder = res.data;
    created = true;
  }
  return {
    id: folder.id,
    name: folder.name,
    link: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
    created,
  };
}
