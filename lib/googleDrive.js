import { google } from "googleapis";

function getAuth() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  return new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.activity.readonly",
    ],
  });
}

export function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
}

export function getActivityClient() {
  return google.driveactivity({ version: "v2", auth: getAuth() });
}

const FIELDS =
  "files(id,name,mimeType,parents,trashed,modifiedTime,md5Checksum,webViewLink,lastModifyingUser(displayName,emailAddress))";

// Trae TODOS los items (carpetas y archivos) debajo de rootId, recursivamente.
export async function scanDriveTree(rootId) {
  const drive = getDriveClient();
  const allItems = [];
  const foldersToScan = [rootId];
  const visited = new Set();

  while (foldersToScan.length) {
    const currentId = foldersToScan.pop();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    let pageToken = undefined;
    do {
      const res = await drive.files.list({
        q: `'${currentId}' in parents and trashed = false`,
        fields: `nextPageToken, ${FIELDS}`,
        pageSize: 1000,
        pageToken,
      });

      for (const file of res.data.files || []) {
        allItems.push(file);
        if (file.mimeType === "application/vnd.google-apps.folder") {
          foldersToScan.push(file.id);
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  return allItems;
}
