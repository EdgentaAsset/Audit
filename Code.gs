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
var TRASH_SHEET_NAME = "Rekod Dipadam";
var FOLDER_NAME = "HoSZA Audit Foto";

/* Susunan lajur output Sheet */
var HEADERS = [
  "Timestamp", "Masa Peranti", "ASSET NO", "NO. UNIZA",
  "Telah Diperiksa", "Nama Pemeriksa", "Masa Diperiksa", "Kaedah Audit",
  "Lokasi (edit)", "Jenama (edit)", "Model (edit)", "No. Serial (edit)",
  "Pembetulan (JSON)", "Catatan",
  "Semakan UNIZA", "Semakan Lokasi", "Semakan Jenis Aset", "Semakan Spesifikasi", "Semakan Gambar",
  "Gambar No. Aset", "Gambar Nameplate", "Gambar Keseluruhan",
  "Gambar Tambahan 1", "Gambar Tambahan 2", "Gambar Jenis Aset (Isu)",
  "User", "Status Sync"
];

/* Indeks lajur gambar (0-based) ikut HEADERS di atas */
var PHOTO_COL = { aset: 19, nameplate: 20, keseluruhan: 21, tambahan1: 22, tambahan2: 23, jenisisu: 24 };

/* Nama lajur gambar (untuk cari lajur secara dinamik dalam mana-mana sheet) */
var PHOTO_HEADER = {
  aset: "Gambar No. Aset", nameplate: "Gambar Nameplate", keseluruhan: "Gambar Keseluruhan",
  tambahan1: "Gambar Tambahan 1", tambahan2: "Gambar Tambahan 2",
  jenisisu: "Gambar Jenis Aset (Isu)"
};

/* ===== Sheet ASET BAHARU (aset yang didaftar pengguna, tiada dalam master) ===== */
var NEW_SHEET_NAME = "Aset Baharu";
var NEW_HEADERS = [
  "Timestamp", "Masa Peranti", "ASSET NO", "NO. UNIZA",
  "Lokasi", "Jenama", "Model", "No. Serial", "Catatan",
  "Telah Diperiksa", "Nama Pemeriksa",
  "Gambar No. Aset", "Gambar Nameplate", "Gambar Keseluruhan",
  "Gambar Tambahan 1", "Gambar Tambahan 2",
  "User", "Status Sync"
];

/* ===== Sheet PENGGUNA (akaun + peranan) ===== */
var USERS_SHEET_NAME = "Users";
var USERS_HEADERS = ["Username", "Nama", "Role", "Status", "Salt", "Hash", "Token", "Dicipta", "Kemaskini"];
// Role: administrator | admin   ·   Status: pending | active | disabled
// End User TIADA baris di sini (masuk app tanpa akaun, baca-sahaja).

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

    // --- Tindakan auth (tiada gate) ---
    if (action === "register") return json_(handleRegister_(p));
    if (action === "login")    return json_(handleLogin_(p));
    if (action === "logout")   return json_(handleLogout_(p));
    if (action === "whoami")   return json_(handleWhoami_(p));

    // --- Tindakan pengurusan (administrator sahaja) — Fasa 2 ---
    if (action === "approve" || action === "reject" || action === "disable" ||
        action === "enable"  || action === "resetpw" || action === "forcelogout" ||
        action === "listusers") {
      if (!authAdmin_(p)) return json_({ ok: false, error: "auth" });
      return json_(handleManage_(action, p));
    }

    // --- Tindakan tulis — WAJIB token penulis aktif ---
    if (action === "photo" || action === "delete" || action === "newasset" || action === "upsert") {
      var u = authWriter_(p);
      if (!u) return json_({ ok: false, error: "auth" });
      p._user = u; // identiti disahkan server (elak spoof)
      if (action === "photo")    return json_(handlePhoto_(p));
      if (action === "delete")   return json_(handleDelete_(p));
      if (action === "newasset") return json_(handleNewAsset_(p));
      return json_(handleUpsert_(p));
    }
    return json_({ ok: false, error: "unknown-action" });
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
    } else if (action === "getnew") {
      var an = e.parameter.asset || "";
      var rn = findRowObjectNew_(an);
      out = { ok: true, found: !!rn, asset: an, row: rn || null };
    } else if (action === "allnew") {
      out = { ok: true, rows: getAllNew_() };
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

  var who = (p._user && p._user.Nama) || p.user || "";  // nama disahkan server
  var edits = p.edits || {};
  var sem = p.semakan || {};
  var rowVals = [
    new Date(),                          // Timestamp
    p.deviceTime || "",                  // Masa Peranti
    assetNo,                             // ASSET NO
    p.uniza || "",                       // NO. UNIZA
    p.checked ? "Ya" : "",               // Telah Diperiksa
    p.checked ? who : "",                // Nama Pemeriksa
    p.checked ? (p.checkedAt || "") : "",// Masa Diperiksa
    p.method || "",                      // Kaedah Audit
    edits.locno || "", edits.brand || "", edits.model || "", edits.serial || "",
    Object.keys(edits).length ? JSON.stringify(edits) : "", // Pembetulan JSON
    p.note || "",                        // Catatan
    sem.uniza || "", sem.lokasi || "", sem.jenis || "", sem.spec || "", sem.gambar || "", // Semakan x5
    "", "", "", "", "", "",              // 6 lajur gambar — dipelihara di bawah
    who,                                 // User
    "Disahkan"                           // Status Sync
  ];

  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex > 0) {
    // UPSERT: gambar dikendali HANYA oleh tindakan 'photo' — kekalkan nilai sedia ada.
    var existing = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    for (var c = 19; c <= 24; c++) rowVals[c] = existing[c];
    // Jika upsert ini tak bawa nilai semakan (cth tick/edit biasa), kekalkan yang sedia ada.
    for (var s = 14; s <= 18; s++) { if (!rowVals[s] && existing[s]) rowVals[s] = existing[s]; }
    if (!rowVals[7] && existing[7]) rowVals[7] = existing[7]; // Kaedah Audit
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
    rowIndex = sheet.getLastRow();
  }
  return { ok: true, asset: assetNo, row: rowToObject_(rowVals) };
}

function handlePhoto_(p) {
  var assetNo = String(p.asset || "").trim();
  var kind = p.kind;
  var colName = PHOTO_HEADER[kind];
  if (!assetNo || !colName) return { ok: false, error: "bad-kind" };

  var isNew = p.sheet === "baharu";
  var sheet = isNew ? getNewSheet_() : getSheet_();
  var headers = isNew ? NEW_HEADERS : HEADERS;
  var col1 = headers.indexOf(colName) + 1;   // 1-based

  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex < 1) {
    var blank = headers.map(function () { return ""; });
    blank[0] = new Date(); blank[2] = assetNo;
    blank[headers.length - 2] = (p._user && p._user.Nama) || p.user || ""; blank[headers.length - 1] = "Disahkan";
    sheet.appendRow(blank);
    rowIndex = sheet.getLastRow();
  }

  // Nameplate "Tiada" — tulis label supaya admin tahu ia memang tiada
  if (p.tiada) {
    sheet.getRange(rowIndex, col1).setValue("TIADA");
    sheet.getRange(rowIndex, 1).setValue(new Date());
    return { ok: true, asset: assetNo, kind: kind, tiada: true };
  }
  // Buang gambar
  if (p.remove) {
    sheet.getRange(rowIndex, col1).setValue("");
    sheet.getRange(rowIndex, 1).setValue(new Date());
    return { ok: true, asset: assetNo, kind: kind, removed: true };
  }

  if (!p.dataB64) return { ok: false, error: "no-data" };
  var folder = getFolder_();
  var bytes = Utilities.base64Decode(p.dataB64);
  var blob = Utilities.newBlob(bytes, p.mimeType || "image/jpeg",
            p.filename || (assetNo + "_" + kind + ".jpg"));
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  var url = file.getUrl();

  sheet.getRange(rowIndex, col1).setValue(url);
  sheet.getRange(rowIndex, 1).setValue(new Date());
  return { ok: true, asset: assetNo, kind: kind, url: url };
}

/* ===== Aset Baharu (upsert ke tab "Aset Baharu") ===== */
function handleNewAsset_(p) {
  var assetNo = String(p.asset || "").trim();
  if (!assetNo) return { ok: false, error: "no-asset" };
  var who = (p._user && p._user.Nama) || p.user || "";  // nama disahkan server
  var sheet = getNewSheet_();
  var rowVals = [
    new Date(), p.deviceTime || "", assetNo, p.uniza || "",
    p.location || "", p.brand || "", p.model || "", p.serial || "", p.note || "",
    p.checked ? "Ya" : "", who,
    "", "", "", "", "",                 // 5 lajur gambar — dikendali oleh 'photo'
    who, "Disahkan"
  ];
  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex > 0) {
    var existing = sheet.getRange(rowIndex, 1, 1, NEW_HEADERS.length).getValues()[0];
    for (var c = 11; c <= 15; c++) rowVals[c] = existing[c];  // pelihara lajur gambar
    sheet.getRange(rowIndex, 1, 1, NEW_HEADERS.length).setValues([rowVals]);
  } else {
    sheet.appendRow(rowVals);
  }
  return { ok: true, asset: assetNo };
}

function handleDelete_(p) {
  var assetNo = String(p.asset || "").trim();
  var sheet = getSheet_();
  var rowIndex = findRow_(sheet, assetNo);
  if (rowIndex > 0) {
    var rowVals = sheet.getRange(rowIndex, 1, 1, HEADERS.length).getValues()[0];
    getTrashSheet_().appendRow(rowVals.concat([p.user || "", new Date()]));
    sheet.deleteRow(rowIndex);
    return { ok: true, asset: assetNo, deleted: true };
  }
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

function getNewSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(NEW_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(NEW_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(NEW_HEADERS);
    sheet.getRange(1, 1, 1, NEW_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getTrashSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TRASH_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(TRASH_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    var h = HEADERS.concat(["Dipadam Oleh", "Masa Dipadam"]);
    sheet.appendRow(h);
    sheet.getRange(1, 1, 1, h.length).setFontWeight("bold");
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
  o.method = vals[7];
  o.semakan = {
    uniza: vals[14], lokasi: vals[15], jenis: vals[16], spec: vals[17], gambar: vals[18]
  };
  o.photos = {
    aset: vals[19], nameplate: vals[20], keseluruhan: vals[21],
    tambahan1: vals[22], tambahan2: vals[23], jenisisu: vals[24]
  };
  o.user = vals[25];
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

/* ===== Aset Baharu: objek baris ===== */
function rowToObjectNew_(vals) {
  var o = {};
  for (var i = 0; i < NEW_HEADERS.length; i++) o[NEW_HEADERS[i]] = vals[i];
  o.asset = vals[2]; o.uniza = vals[3];
  o.checked = vals[9] === "Ya";
  o.photos = {
    aset: vals[11], nameplate: vals[12], keseluruhan: vals[13],
    tambahan1: vals[14], tambahan2: vals[15]
  };
  o.user = vals[16];
  return o;
}
function findRowObjectNew_(assetNo) {
  var sheet = getNewSheet_();
  var r = findRow_(sheet, assetNo);
  if (r < 1) return null;
  var vals = sheet.getRange(r, 1, 1, NEW_HEADERS.length).getValues()[0];
  return rowToObjectNew_(vals);
}
function getAllNew_() {
  var sheet = getNewSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var vals = sheet.getRange(2, 1, last - 1, NEW_HEADERS.length).getValues();
  return vals.map(rowToObjectNew_);
}

/* ================= PENGGUNA / AUTH ================= */
function getUsersSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(USERS_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(USERS_HEADERS);
    sheet.getRange(1, 1, 1, USERS_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function userRowToObj_(vals) {
  return {
    Username: vals[0], Nama: vals[1], Role: vals[2], Status: vals[3],
    Salt: vals[4], Hash: vals[5], Token: vals[6]
  };
}

function findUserRow_(sheet, username) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var col = sheet.getRange(2, 1, last - 1, 1).getValues();
  var t = String(username).trim().toLowerCase();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim().toLowerCase() === t) return i + 2;
  }
  return -1;
}

function userByToken_(token) {
  if (!token) return null;
  var sheet = getUsersSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var vals = sheet.getRange(2, 1, last - 1, USERS_HEADERS.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][6] !== "" && String(vals[i][6]) === String(token)) {
      return { row: i + 2, obj: userRowToObj_(vals[i]) };
    }
  }
  return null;
}

function sha256Hex_(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < raw.length; i++) {
    var b = (raw[i] + 256) % 256;
    hex += (b < 16 ? "0" : "") + b.toString(16);
  }
  return hex;
}
function randSalt_()  { return Utilities.getUuid().replace(/-/g, ""); }
function randToken_() { return Utilities.getUuid() + Utilities.getUuid().slice(0, 8); }
function hashPw_(salt, pw) { return sha256Hex_(String(salt) + String(pw)); }

/* Token penulis aktif (admin/administrator). Pulang objek user atau null. */
function authWriter_(p) {
  var f = userByToken_(p && p.token);
  if (!f) return null;
  var o = f.obj;
  if (o.Status !== "active") return null;
  if (o.Role !== "admin" && o.Role !== "administrator") return null;
  return o;
}
function authAdmin_(p) {
  var u = authWriter_(p);
  return (u && u.Role === "administrator") ? u : null;
}

/* ----- Tindakan auth ----- */
function handleRegister_(p) {
  var username = String(p.username || "").trim();
  var name = String(p.name || "").trim();
  var pw = String(p.password || "");
  if (!username || !name || !pw) return { ok: false, error: "lengkap" };
  var sheet = getUsersSheet_();
  if (findUserRow_(sheet, username) > 0) return { ok: false, error: "username-wujud" };
  var salt = randSalt_(), now = new Date();
  sheet.appendRow([username, name, "admin", "pending", salt, hashPw_(salt, pw), "", now, now]);
  return { ok: true };
}

function handleLogin_(p) {
  var username = String(p.username || "").trim();
  var pw = String(p.password || "");
  if (!username || !pw) return { ok: false, error: "lengkap" };
  var sheet = getUsersSheet_();
  var r = findUserRow_(sheet, username);
  if (r < 1) return { ok: false, error: "no-user" };
  var o = userRowToObj_(sheet.getRange(r, 1, 1, USERS_HEADERS.length).getValues()[0]);
  if (o.Status === "disabled") return { ok: false, error: "disabled" };
  if (hashPw_(o.Salt, pw) !== o.Hash) return { ok: false, error: "salah" };
  var token = randToken_();
  sheet.getRange(r, 7).setValue(token);       // Token (G)
  sheet.getRange(r, 9).setValue(new Date());  // Kemaskini (I)
  return { ok: true, token: token, role: o.Role, name: o.Nama, status: o.Status, username: o.Username };
}

function handleLogout_(p) {
  var f = userByToken_(p && p.token);
  if (f) getUsersSheet_().getRange(f.row, 7).setValue("");
  return { ok: true };
}

function handleWhoami_(p) {
  var f = userByToken_(p && p.token);
  if (!f) return { ok: false, error: "auth" };
  var o = f.obj;
  if (o.Status === "disabled") return { ok: false, error: "auth" };
  return { ok: true, role: o.Role, status: o.Status, name: o.Nama, username: o.Username };
}

/* ----- Pengurusan (administrator sahaja; sudah ber-gate di doPost) ----- */
function handleManage_(action, p) {
  var sheet = getUsersSheet_();
  if (action === "listusers") {
    var last = sheet.getLastRow();
    if (last < 2) return { ok: true, users: [] };
    var vals = sheet.getRange(2, 1, last - 1, USERS_HEADERS.length).getValues();
    var users = vals.map(function (v) {
      return { username: v[0], name: v[1], role: v[2], status: v[3], hasToken: v[6] !== "" };
    });
    return { ok: true, users: users };
  }
  var username = String(p.username || "").trim();
  if (!username) return { ok: false, error: "no-user" };
  var r = findUserRow_(sheet, username);
  if (r < 1) return { ok: false, error: "no-user" };

  if (action === "approve")     { sheet.getRange(r, 4).setValue("active"); }
  else if (action === "reject" || action === "disable") { sheet.getRange(r, 4).setValue("disabled"); sheet.getRange(r, 7).setValue(""); }
  else if (action === "enable") { sheet.getRange(r, 4).setValue("active"); }
  else if (action === "forcelogout") { sheet.getRange(r, 7).setValue(""); }
  else if (action === "resetpw") {
    var np = String(p.newPassword || "");
    if (!np) return { ok: false, error: "no-pw" };
    var salt = randSalt_();
    sheet.getRange(r, 5).setValue(salt);                 // Salt
    sheet.getRange(r, 6).setValue(hashPw_(salt, np));    // Hash
    sheet.getRange(r, 7).setValue("");                   // batal token (paksa log masuk semula)
  } else return { ok: false, error: "unknown-manage" };

  sheet.getRange(r, 9).setValue(new Date());
  return { ok: true, username: username };
}

/* Run-once dari editor: cipta Administrator pertama. TUKAR nilai di bawah dahulu. */
function seedAdmin() {
  var SEED_USER = "admin";
  var SEED_PASS = "ubah-saya-segera";
  var SEED_NAME = "Administrator";
  var sheet = getUsersSheet_();
  if (findUserRow_(sheet, SEED_USER) > 0) { Logger.log("Sudah wujud: " + SEED_USER); return; }
  var salt = randSalt_(), now = new Date();
  sheet.appendRow([SEED_USER, SEED_NAME, "administrator", "active", salt, hashPw_(salt, SEED_PASS), "", now, now]);
  Logger.log("Administrator dicipta: " + SEED_USER + " — tukar password selepas log masuk.");
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
  var n = getNewSheet_();
  var u = getUsersSheet_();
  var f = getFolder_();
  Logger.log("Sheet OK: " + s.getName() + " | Aset Baharu OK: " + n.getName() +
             " | Users OK: " + u.getName() + " | Folder OK: " + f.getName());
}
