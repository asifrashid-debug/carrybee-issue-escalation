// Creates a new IR sheet with the app's own Google permission (drive.file). Used once by an admin.
// A sheet created this way is visible to the app, unlike a sheet made by hand in Google Drive.
// Returns { id, url, title }. The caller puts the ID into IR_SHEET_ID in Vercel and redeploys.
import { google } from 'googleapis';
import { getGoogleAuth } from './sheets.js';
import { IR_HEADERS } from './irEscalation.mjs';
import { IR_SHEET_TITLE, IR_TAB, irSheetSetupRequests, irHeaderRange } from './irSheetSetup.mjs';

export async function createIrSheet() {
  const auth = getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: IR_SHEET_TITLE, timeZone: 'Asia/Dhaka' },
      sheets: [{ properties: { title: IR_TAB, index: 0 } }],
    },
    fields: 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title))',
  });
  const id = created.data.spreadsheetId;
  if (!id) throw new Error('Sheets returned no spreadsheet ID');
  const tab = created.data.sheets?.find((s) => s.properties?.title === IR_TAB) || created.data.sheets?.[0];
  const sheetId = tab?.properties?.sheetId ?? 0;

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: irHeaderRange(),
    valueInputOption: 'RAW',
    requestBody: { values: [IR_HEADERS] },
  });
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: irSheetSetupRequests(sheetId) },
  });
  return {
    id,
    url: created.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${id}/edit`,
    title: IR_SHEET_TITLE,
  };
}
