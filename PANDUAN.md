# Audit Aset HoSZA — UEM Edgenta · Panduan Pasang & Deploy

App audit aset (web, mobile-first, PWA) untuk Hospital Sultan Zainal Abidin.
Pasukan site: **cari/imbas aset → Tick "Telah Diperiksa" atau Edit + gambar**.
Semua audit masuk **Google Sheet pusat**; admin tengok & muat turun dari PC.

---

## 📁 Fail dalam folder ini

| Fail | Fungsi |
|---|---|
| `index.html` | App penuh (UI + logik). Self-contained, tiada library luar wajib. |
| `app-data.js` | Data aset + PPM (dijana dari `Data.xlsx`). Dimuat oleh `index.html`. |
| `Code.gs` | Backend Google Apps Script (UPSERT, gambar, sahkan-baca-balik). |
| `manifest.json` | Manifest PWA (ikon, warna, "Add to Home Screen"). |
| `sw.js` | Service Worker — buka offline, auto-update. |
| `icon-192.png` / `icon-512.png` / `icon-maskable-512.png` | Ikon app. |
| `build_data.py` | Penjana `app-data.js` daripada `Data.xlsx`. |
| `build_icons.py` | Penjana ikon (jika perlu jana semula). |
| `Data.xlsx` | Sumber data (AssetDetails + PPM Schedule). |

> **Nota penting:** semua fail di atas mesti berada dalam **folder yang sama** semasa di-host.

---

## 1) Tukar `Data.xlsx` → data app

Setiap kali `Data.xlsx` dikemas kini, jana semula data:

```bash
pip install openpyxl          # sekali sahaja
python build_data.py          # hasilkan app-data.js
```

Output: `app-data.js` (~3.7 MB; ~1 MB selepas gzip). Mengandungi **6,321 aset** + **PPM**.
`build_data.py` **auto-naikkan VERSION dalam `sw.js`** (ikut versi data) — tak perlu ubah tangan.

---

## 2) Backend — Google Sheet + Apps Script

1. **Google Sheet baharu** → dari URL, salin **ID** (bahagian antara `/d/` dan `/edit`).
2. Buka [script.google.com](https://script.google.com) → **New project**.
3. Padam kandungan `Code.gs` lalai → tampal **seluruh `Code.gs`** dari folder ini.
4. Di bahagian atas `Code.gs`, isi:
   ```js
   var SHEET_ID  = "ID_GOOGLE_SHEET_ANDA";
   var FOLDER_ID = "";   // biar kosong → folder "HoSZA Audit Foto" dicipta automatik
   ```
5. **Run → `testSetup`** sekali → benarkan kebenaran (authorize) Drive & Sheet.
   (Tab Audit + folder gambar akan dicipta.)
6. **Deploy → New deployment → ⚙️ → Web app**:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - **Deploy** → salin **Web app URL** (berakhir dengan `/exec`).

> Setiap kali `Code.gs` diubah: **Deploy → Manage deployments → Edit (pensel) → Version: New version → Deploy** (URL `/exec` kekal sama).

### Lajur output Sheet (tab "Audit")
`Timestamp · Masa Peranti · ASSET NO · NO. UNIZA · Telah Diperiksa · Nama Pemeriksa ·
Masa Diperiksa · Kaedah Audit · Lokasi(edit) · Jenama(edit) · Model(edit) · No.Serial(edit) ·
Pembetulan(JSON) · Catatan · Semakan UNIZA · Semakan Lokasi · Semakan Jenis Aset ·
Semakan Spesifikasi · Semakan Gambar · Gambar No. Aset · Gambar Nameplate · Gambar Keseluruhan ·
Gambar Tambahan 1 · Gambar Tambahan 2 · Gambar Jenis Aset (Isu) · User · Status Sync`

**Audit Berpandu:** lajur `Kaedah Audit`=Berpandu + 5 lajur `Semakan …` merekod hasil setiap bahagian
(Tiada Isu / Tiada Tagging / Dibetulkan / Bermasalah). Gambar bukti "Bermasalah Jenis Aset" → lajur
`Gambar Jenis Aset (Isu)`.

**UPSERT ikut ASSET NO** → 1 aset = 1 baris (tiada duplicate, retry selamat, guna `LockService`).
Gambar (5 slot berlabel) dikendali oleh tindakan *photo* sahaja — tick/edit tak menyentuh lajur gambar.

> ⚠️ **Bila kemas kini Code.gs:** jika tab `Audit` lama wujud dengan lajur lama, **padam tab itu dahulu**
> (skrip akan tulis semula header baharu), kemudian **Deploy → Manage deployments → Edit → New version**.

### Tab "Aset Baharu" (aset yang didaftar pengguna)
Aset yang **tiada dalam master** (didaftar melalui butang *➕ Daftar Aset Baharu*) masuk tab **berasingan
`Aset Baharu`** (dicipta automatik). Lajur: `Timestamp · Masa Peranti · ASSET NO · NO. UNIZA · Lokasi ·
Jenama · Model · No. Serial · Catatan · Telah Diperiksa · Nama Pemeriksa · Gambar No.Aset · Gambar Nameplate ·
Gambar Keseluruhan · Gambar Tambahan 1 · Gambar Tambahan 2 · User · Status Sync`.
Nameplate "TIADA" bermaksud aset itu memang tiada nameplate (disahkan pemeriksa).

---

## 3) Host di HTTPS (wajib untuk kamera & PWA)

Kamera & pemasangan PWA **mesti HTTPS**. Pilih salah satu (percuma):

**A. GitHub Pages**
1. Cipta repo → muat naik **semua fail** (kecuali `Data.xlsx`, `build_*.py`, `.claude/` — pilihan).
2. **Settings → Pages → Branch: `main` / root → Save**.
3. URL: `https://<user>.github.io/<repo>/`.

**B. Netlify (drag & drop)**
1. [app.netlify.com/drop](https://app.netlify.com/drop) → seret folder → siap.

---

## 4) Sambung app ↔ backend

Buka app di telefon → tekan **⚙️ Tetapan** → tampal **Web app URL `/exec`** pada
*URL Pengurusan* → **Simpan**. (Atau isi `CONFIG.ENDPOINT` dalam `index.html` sebelum host.)

Tanpa URL ini, audit **disimpan lokal sahaja** (IndexedDB) dan akan auto-sync sebaik URL ditetapkan.

---

## 5) PWA & Auto-update

- **Pasang:** buka di Chrome (Android) → menu → **Add to Home Screen** → app skrin penuh.
- **Auto-update:** `build_data.py` naikkan `VERSION` dalam `sw.js` automatik bila data dijana semula.
  SW baharu dipasang di latar → app papar **"Versi baharu tersedia — Muat Semula"**.
  (Untuk perubahan `index.html`/`Code.gs` sahaja tanpa jana data, jalankan `python build_data.py` sekali untuk bump, atau ubah `VERSION` tangan.)

---

## 6) Cara guna (pasukan site)

1. Buka app → masukkan **Nama** (sekali sahaja; tersimpan dalam peranti).
2. **Cari** No. Aset / No. UNIZA, atau tekan **ikon imbas** (QR = No.Aset, Barcode = No.UNIZA).
3. Tekan kad → **LIHAT BUTIRAN PENUH**.
4. **👍 (butang biru bulat / FAB)** = tanda *Telah Diperiksa*. Atau **✏️ Edit** untuk betulkan data.
5. **📸 Upload Gambar Aset / Plate** → kamera → hantar ke Drive (link masuk Sheet).
6. **🗓️ Lihat Jadual** = status PPM penuh aset.

**Status sync setiap rekod:** 💾 lokal → ⏳ menghantar → ✅ disahkan → ⚠️ gagal.
Cip **"Belum Sync"** + butang **⟳ Segerak** + auto-sync berkala (retry automatik).

---

## 7) Nota teknikal

- **Offline:** audit & gambar beratur dalam **IndexedDB**; auto-hantar bila ada talian.
- **Sahkan-baca-balik:** rekod ditanda ✅ hanya selepas disahkan wujud di Sheet (JSONP `doGet`) → elak duplicate.
- **CORS:** POST guna `text/plain` (elak preflight); pengesahan muktamad via JSONP `doGet`.
- **Gambar:** dikecilkan ke maks 2560px (kekal ~asal penuh) sebelum hantar; thumbnail disimpan lokal.
- **Imbas:** `BarcodeDetector` native (offline) → fallback **ZXing** (perlu internet kali pertama sahaja).
- **Pautan SharePoint** (Gambar sedia ada dalam master) dibuka dalam tab baharu (paparan).

### Tukar tetapan dalam `index.html` (objek `CONFIG`)
```js
const CONFIG = {
  ENDPOINT: "",        // URL /exec Apps Script (atau set via ⚙️)
  IMG_MAX: 2560,       // saiz maks gambar
  IMG_QUALITY: 0.9,
  AUTOSYNC_MS: 30000,  // selang auto-sync (ms)
  RENDER_LIMIT: 40     // bilangan kad per muka
};
```
