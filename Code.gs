/****************************************************************
 * App Audit Aset HoSZA — UEM Edgenta
 * Backend Google Apps Script (Web App)
 *
 * Fungsi:
 *   doPost  -> action: 'upsert' | 'photo' | 'delete'  (UPSERT ikut ASSET NO)
 *   doGet   -> action: 'get' | 'all'   (JSONP, untuk Sync & sahkan-baca-balik)
 *
 * 1 ASSET NO = 1 baris audit (tiada duplicate). Guna LockService.
 * Gambar -> folder Google Drive, link berlabel masuk Sheet.
 *
 * == PENYEDIAAN (baca PANDUAN.md langkah penuh) ==
 *  1) Buka Google Sheet baharu -> salin ID dari URL -> isi SHEET_ID.
 *  2) Buat folder Google Drive untuk gambar -> salin ID -> isi FOLDER_ID
 *     (atau biar kosong, skrip akan cipta folder "HoSZA Audit Foto").
 *  3) Deploy > New deployment > Web app:
 *        Execute as: Me
 *        Who has access: Anyone
 *     Salin URL /exec -> tampal dalam app (⚙️ Tetapan > URL Pengurusan).
 ****************************************************************/

var SHEET_ID  = "";   // <-- ISI: ID Google Sheet
var FOLDER_ID = "";   // <-- (pilihan) ID folder Drive untuk gambar
var SHEET_NAME = "Audit";
var FOLDER_NAME = "HoSZA Audit Foto";

/* Susunan lajur output Sheet */
var HEADERS = [
  "Timestamp", "Masa Peranti", "ASSET NO", "NO. UNIZA",
  "Telah Diperiksa", "Nama Pemeriksa", "Masa Diperiksa",
  "No. Lokasi (edit)", "Nama Lokasi (edit)", "Jenama (edit)", "Model (edit)",
  "No. Serial (edit)", "Buatan (edit)", "Pengilang (edit)",
  "Pembetulan (JSON)", "Catatan",
  "Link Gambar Aset", "Link Gambar Plate",
  "User", "Status Sync"
];

/* ================= POST ================= */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, error: "lock-timeout" });
  }
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter && e.parameter.action) {
      body = { action: e.parameter.action, payload: JSON.parse(e.parameter.payload || "{}") };
    }
    var action = body.action || "upsert";
    var p = body.payload || {};

    if (action === "photo")  return json_(handlePhoto_(p));
    if (action === "delete") return json_(handleDelete_(p));
    return json_(handleUpsert_(p));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ================= GET (JSONP) ================= */
function doGet(e) {
  var cb = (e && e.parameter && e.parameter.callback) || "";
  var action = (e && e.parameter && e.parameter.action) || "all";
  var out;
  try {
    if (action === "get") {
      var asset = e.parameter.asset || "";
      var row = findRowObject_(asset);
      out = { ok: true, found: !!row, asset: asset, row: row || null };
    } else {
      out = { ok: true, rows: getAllObjects_() };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return jsonp_(out, cb);
}

/* ================= Handlers ================= */
function handleUpsert_(p) {
  var sheet = getSheet_();
  var assetNo = String(p.asset || "").trim();
  if (!assetNo) return { ok: false, error: "no-asset" };

  var edits = p.edits || {};
  var rowVals = [
    new Date(),                          // Timestamp
    p.deviceTime || "",                  // Masa Peranti
    assetNo,                             // ASSET NO
    p.uniza || "",                       // NO. UNIZA
    p.checked ? "Ya" : "",               // Telah Diperiksa
    p.checked ? (p.checkedBy || p.user || "") : "", // Nama Pemeriksa
    p.checked ? (p.checkedAt || "") : "",// Masa Diperiksa
    edits.locno || "", edits.locname || "", edits.brand || "", edits.model || "",
    edits.serial || "", edits.make || "", edits.manuf || "",
    Object.keys(edits).length ? JSON.stringify(edits) : "", // Pembetulan JSON
    p.note || "",                        // Catatan
    p.photoAssetUrl || "",               // Link Gambar Aset
    p.photoPlateUrl || "",               // Link Gambar Plate
    p.user || "",                        // User
    "Disahkan"                           // Status Sync
  ];

  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex > 0) {
    // UPSERT: kekalkan link gambar sedia ada jika upsert ini tidak bawa link baharu
    var existing = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    if (!rowVals[16] && existing[16]) rowVals[16] = existing[16]; // Link Gambar Aset
    if (!rowVals[17] && existing[17]) rowVals[17] = existing[17]; // Link Gambar Plate
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
    rowIndex = sheet.getLastRow();
  }
  return { ok: true, asset: assetNo, row: rowToObject_(rowVals) };
}

function handlePhoto_(p) {
  var assetNo = String(p.asset || "").trim();
  var kind = p.kind === "plate" ? "plate" : "asset";
  if (!assetNo || !p.dataB64) return { ok: false, error: "bad-photo" };

  var folder = getFolder_();
  var bytes = Utilities.base64Decode(p.dataB64);
  var blob = Utilities.newBlob(bytes, p.mimeType || "image/jpeg",
            p.filename || (assetNo + "_" + kind + ".jpg"));
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  var url = file.getUrl();

  // upsert link ke baris aset
  var sheet = getSheet_();
  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex < 1) {
    var blank = HEADERS.map(function () { return ""; });
    blank[0] = new Date(); blank[2] = assetNo; blank[18] = p.user || ""; blank[19] = "Disahkan";
    sheet.appendRow(blank);
    rowIndex = sheet.getLastRow();
  }
  var col = kind === "asset" ? 17 : 18; // 1-based: Link Gambar Aset=17, Plate=18
  sheet.getRange(rowIndex, col).setValue(url);
  sheet.getRange(rowIndex, 1).setValue(new Date());
  return { ok: true, asset: assetNo, kind: kind, url: url };
}

function handleDelete_(p) {
  var assetNo = String(p.asset || "").trim();
  var sheet = getSheet_();
  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex > 0) { sheet.deleteRow(rowIndex); return { ok: true, asset: assetNo, deleted: true }; }
  return { ok: true, asset: assetNo, deleted: false };
}

/* ================= Helpers ================= */
function getSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getFolder_() {
  if (FOLDER_ID) {
    try { return DriveApp.getFolderById(FOLDER_ID); } catch (e) {}
  }
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function findRow_(sheet, assetNo) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var col = sheet.getRange(2, 3, last - 1, 1).getValues(); // lajur C = ASSET NO
  var target = assetNo.toUpperCase();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim().toUpperCase() === target) return i + 2;
  }
  return -1;
}

function rowToObject_(vals) {
  var o = {};
  for (var i = 0; i < HEADERS.length; i++) o[HEADERS[i]] = vals[i];
  // alias mesra-klien
  o.asset = vals[2]; o.uniza = vals[3];
  o.checked = vals[4] === "Ya";
  o.photoAssetUrl = vals[16]; o.photoPlateUrl = vals[17];
  o.user = vals[18];
  return o;
}

function findRowObject_(assetNo) {
  var sheet = getSheet_();
  var r = findRow_(sheet, assetNo);
  if (r < 1) return null;
  var vals = sheet.getRange(r, 1, 1, HEADERS.length).getValues()[0];
  return rowToObject_(vals);
}

function getAllObjects_() {
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  return vals.map(rowToObject_);
}

/* ================= Output ================= */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function jsonp_(obj, cb) {
  if (cb) {
    return ContentService.createTextOutput(cb + "(" + JSON.stringify(obj) + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}

/* Uji pantas dari editor (Run > testSetup) */
function testSetup() {
  var s = getSheet_();
  var f = getFolder_();
  Logger.log("Sheet OK: " + s.getName() + " | Folder OK: " + f.getName());
}
