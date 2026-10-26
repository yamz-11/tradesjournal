"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Trade = {
  id: string;
  traded_at: string;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  exit_price: number;
  quantity: number;
  fees: number;
  stop_loss: number | null;
  take_profit: number | null;
  pip_size: number | null;
  pip_value: number | null;
  setup: string | null;
  notes: string | null;
  screenshot_path: string | null;
};

const BUCKET = "screenshots";
const CCY = new Set(["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "SGD", "HKD", "NOK", "SEK", "DKK", "MXN", "ZAR", "TRY", "PLN"]);
// Ukuran pip otomatis: pasangan mata uang 0.0001 (0.01 jika quote JPY), emas 0.1, perak 0.01.
// Simbol lain (kripto, indeks, saham) tidak dikenali; isi "Ukuran pip" manual jika perlu.
const autoPipSize = (symbol: string): number | null => {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.startsWith("XAU")) return 0.1;
  if (s.startsWith("XAG")) return 0.01;
  if (s.length === 6 && CCY.has(s.slice(0, 3)) && CCY.has(s.slice(3))) return s.slice(3) === "JPY" ? 0.01 : 0.0001;
  return null;
};
const pipSize = (t: Trade) => t.pip_size ?? autoPipSize(t.symbol);
const dir = (t: Trade) => (t.side === "long" ? 1 : -1);
// Hasil dalam pips (positif = untung)
const pipsOf = (t: Trade): number | null => {
  const ps = pipSize(t);
  return ps ? (dir(t) * (t.exit_price - t.entry_price)) / ps : null;
};
const slPips = (t: Trade): number | null => {
  const ps = pipSize(t);
  return ps && t.stop_loss != null ? Math.abs(t.entry_price - t.stop_loss) / ps : null;
};
const tpPips = (t: Trade): number | null => {
  const ps = pipSize(t);
  return ps && t.take_profit != null ? Math.abs(t.take_profit - t.entry_price) / ps : null;
};
// P&L: jika "nilai per pip" diisi, P&L = pips x nilai per pip x lot - biaya.
// Jika tidak, P&L = selisih harga x ukuran - biaya.
const pnl = (t: Trade) => {
  const p = pipsOf(t);
  const gross =
    t.pip_value != null && p != null ? p * t.pip_value * t.quantity : dir(t) * (t.exit_price - t.entry_price) * t.quantity;
  return gross - t.fees;
};
// Risiko awal dalam satuan P&L (dasar perhitungan R)
const riskAmt = (t: Trade): number | null => {
  if (t.stop_loss == null) return null;
  const sp = slPips(t);
  if (t.pip_value != null && sp != null) return sp * t.pip_value * t.quantity;
  return Math.abs(t.entry_price - t.stop_loss) * t.quantity;
};
// R-multiple: hasil bersih dibagi risiko awal
const rMult = (t: Trade): number | null => {
  const risk = riskAmt(t);
  return risk != null && risk > 0 ? pnl(t) / risk : null;
};
// Risk/reward rencana: jarak entry ke take profit dibagi jarak entry ke stop loss
const rr = (t: Trade): number | null => {
  if (t.stop_loss == null || t.take_profit == null) return null;
  const risk = Math.abs(t.entry_price - t.stop_loss);
  return risk > 0 ? Math.abs(t.take_profit - t.entry_price) / risk : null;
};
const num = (n: number, d = 2) => n.toLocaleString("id-ID", { maximumFractionDigits: d });
const sg = (n: number, d = 2) => (n > 0 ? "+" : n < 0 ? "\u2212" : "") + num(Math.abs(n), d);
const cls = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const todayStr = () => {
  const d = new Date(); // tanggal lokal, bukan UTC
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Equity({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <svg viewBox="0 0 600 150" preserveAspectRatio="none">
        <line x1="0" y1="75" x2="600" y2="75" stroke="currentColor" strokeOpacity=".25" strokeDasharray="4 5" />
      </svg>
    );
  }
  let mn = Math.min(...values), mx = Math.max(...values);
  if (mx === mn) { mx += 1; mn -= 1; }
  const X = (i: number) => (i / (values.length - 1)) * 600;
  const Y = (v: number) => 130 - ((v - mn) / (mx - mn)) * 110;
  const line = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const col = values[values.length - 1] >= 0 ? "#4ade9a" : "#ff7a8a";
  return (
    <svg viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Kurva ekuitas">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity=".35" />
          <stop offset="1" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2="600" y1={Y(0)} y2={Y(0)} stroke="currentColor" strokeOpacity=".25" strokeDasharray="4 5" />
      <polygon points={`0,150 ${line} 600,150`} fill="url(#g)" />
      <polyline points={line} fill="none" stroke={col} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Calendar({ trades, month, setMonth, note }: { trades: Trade[]; month: string; setMonth: (m: string) => void; note?: string }) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // minggu dimulai Senin
  const map: Record<string, number> = {};
  const cnt: Record<string, number> = {};
  trades.forEach((t) => {
    if (t.traded_at.startsWith(month)) {
      map[t.traded_at] = (map[t.traded_at] ?? 0) + pnl(t);
      cnt[t.traded_at] = (cnt[t.traded_at] ?? 0) + 1;
    }
  });
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  const shift = (d: number) => {
    const n = new Date(y, m - 1 + d, 1);
    setMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
  };
  const label = new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

  // Unduh kalender sebagai gambar PNG (latar putih agar rapi saat dibagikan)
  function downloadPng() {
    const INK = "#0b1b3a", MUTE = "#5b6b8c", WIN = "#0a8f5a", LOSS = "#d92d48";
    const W = 1120, pad = 40, gap = 8, scale = 2;
    const rowsN = Math.ceil((offset + days) / 7);
    const cw = (W - pad * 2 - gap * 6) / 7, ch = 92, gridTop = 178;
    const H = gridTop + rowsN * (ch + gap) + 78;
    const c = document.createElement("canvas");
    c.width = W * scale;
    c.height = H * scale;
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(scale, scale);
    const font = '"Plus Jakarta Sans", Figtree, system-ui, sans-serif';
    const box = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const col = (v: number) => (v > 0 ? WIN : v < 0 ? LOSS : INK);

    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    g.textBaseline = "alphabetic";

    g.textAlign = "left";
    g.fillStyle = INK;
    g.font = `800 32px ${font}`;
    g.fillText(label.charAt(0).toUpperCase() + label.slice(1), pad, 66);
    g.font = `800 46px ${font}`;
    g.fillStyle = col(total);
    g.fillText(sg(total), pad, 122);

    g.textAlign = "right";
    g.font = `500 15px ${font}`;
    g.fillStyle = MUTE;
    g.fillText("Kalender P&L harian", W - pad, 66);
    if (note) g.fillText(note, W - pad, 90);

    g.textAlign = "center";
    g.font = `600 13px ${font}`;
    ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].forEach((d, i) => {
      g.fillText(d, pad + i * (cw + gap) + cw / 2, gridTop - 12);
    });

    for (let i = 0; i < days; i++) {
      const idx = offset + i;
      const x = pad + (idx % 7) * (cw + gap);
      const y = gridTop + Math.floor(idx / 7) * (ch + gap);
      const key = `${month}-${String(i + 1).padStart(2, "0")}`;
      const v = map[key];
      box(x, y, cw, ch, 10);
      g.fillStyle = v == null ? "#f3f6fb" : v >= 0 ? "rgba(10,143,90,0.14)" : "rgba(217,45,72,0.14)";
      g.fill();
      g.strokeStyle = v == null ? "#dbe3f0" : v >= 0 ? "rgba(10,143,90,0.45)" : "rgba(217,45,72,0.45)";
      g.lineWidth = 1;
      g.stroke();
      g.textAlign = "left";
      g.fillStyle = MUTE;
      g.font = `600 14px ${font}`;
      g.fillText(String(i + 1), x + 10, y + 22);
      if (v != null) {
        g.textAlign = "center";
        g.fillStyle = col(v);
        g.font = `700 17px ${font}`;
        g.fillText(sg(v), x + cw / 2, y + ch / 2 + 10);
        g.fillStyle = MUTE;
        g.font = `500 12px ${font}`;
        g.fillText(`${cnt[key]} trade`, x + cw / 2, y + ch - 12);
      }
    }

    const vals = Object.values(map);
    const nTrades = Object.values(cnt).reduce((a, b) => a + b, 0);
    g.textAlign = "left";
    g.fillStyle = INK;
    g.font = `600 15px ${font}`;
    g.fillText(
      `Hari profit ${vals.filter((v) => v > 0).length}  \u00b7  Hari rugi ${vals.filter((v) => v < 0).length}  \u00b7  ${nTrades} trade`,
      pad,
      H - 32
    );
    g.textAlign = "right";
    g.fillStyle = MUTE;
    g.font = `500 13px ${font}`;
    g.fillText("Jurnal trading", W - pad, H - 32);

    c.toBlob((b) => { if (b) saveBlob(b, `pnl-kalender-${month}.png`); }, "image/png");
  }

  // Unduh data harian sebagai CSV (bisa dibuka di Excel/Google Sheets)
  function downloadCsv() {
    const keys = Object.keys(map).sort();
    const lines = [
      "tanggal,pnl,jumlah_trade",
      ...keys.map((k) => `${k},${Number(map[k].toFixed(2))},${cnt[k]}`),
      `TOTAL,${Number(total.toFixed(2))},${Object.values(cnt).reduce((a, b) => a + b, 0)}`,
    ];
    saveBlob(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `pnl-kalender-${month}.csv`);
  }

  return (
    <section className="panel">
      <div className="cal-head">
        <button className="btn ghost" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">&lsaquo;</button>
        <div style={{ textAlign: "center" }}>
          <h2>{label}</h2>
          <span className={cls(total)}><b>{sg(total)}</b></span>
        </div>
        <button className="btn ghost" onClick={() => shift(1)} aria-label="Bulan berikutnya">&rsaquo;</button>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn ghost" type="button" onClick={downloadPng}>Unduh gambar (PNG)</button>
        <button className="btn ghost" type="button" onClick={downloadCsv}>Unduh CSV</button>
      </div>
      <div className="cal">
        {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d} className="dow">{d}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`b${i}`} className="d blank" />)}
        {Array.from({ length: days }, (_, i) => {
          const key = `${month}-${String(i + 1).padStart(2, "0")}`;
          const v = map[key];
          return (
            <div key={key} className={`d ${v == null ? "" : v >= 0 ? "win" : "loss"}`}>
              <small>{i + 1}</small>
              {v != null && <b className={cls(v)}>{sg(v)}</b>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(mode: "in" | "up") {
    setBusy(true);
    setMsg("");
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Akun dibuat. Jika diminta, cek email Anda untuk konfirmasi, lalu masuk.");
  }

  return (
    <div className="wrap auth">
      <h1 style={{ marginBottom: 6 }}>Jurnal trading</h1>
      <p style={{ color: "var(--mute)", marginTop: 0 }}>Masuk untuk melihat dan mencatat trade Anda.</p>
      <div className="panel">
        <form onSubmit={(e) => { e.preventDefault(); submit("in"); }}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Kata sandi<input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <div className="row">
            <button className="btn" type="submit" disabled={busy}>Masuk</button>
            {/* <button className="btn ghost" type="button" disabled={busy} onClick={() => submit("up")}>Daftar akun</button> */}
          </div>
          Email & Pass: admin@yamz.com
          {msg && <div className="err" role="alert">{msg}</div>}
        </form>
      </div>
    </div>
  );
}

function Journal({ session }: { session: Session }) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [fSym, setFSym] = useState("");
  const [fSetup, setFSetup] = useState("");
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const [shot, setShot] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("traded_at", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) setErr(error.message);
    else setTrades((data ?? []) as Trade[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const symbols = useMemo(() => Array.from(new Set(trades.map((t) => t.symbol))).sort(), [trades]);
  const setups = useMemo(
    () => Array.from(new Set(trades.map((t) => t.setup).filter(Boolean) as string[])).sort(),
    [trades]
  );
  const shown = useMemo(
    () => trades.filter((t) => (!fSym || t.symbol === fSym) && (!fSetup || t.setup === fSetup)),
    [trades, fSym, fSetup]
  );

  const s = useMemo(() => {
    const ps = shown.map(pnl);
    const wins = ps.filter((p) => p > 0);
    const losses = ps.filter((p) => p < 0);
    const gw = wins.reduce((a, b) => a + b, 0);
    const gl = -losses.reduce((a, b) => a + b, 0);
    const rs = shown.map(rMult).filter((r): r is number => r != null);
    const rSum = rs.reduce((a, b) => a + b, 0);
    const pp = shown.map(pipsOf).filter((x): x is number => x != null);
    const pipSum = pp.reduce((a, b) => a + b, 0);
    let c = 0;
    return {
      total: ps.reduce((a, b) => a + b, 0),
      count: ps.length,
      winRate: ps.length ? (wins.length / ps.length) * 100 : 0,
      pf: gl > 0 ? num(gw / gl) : gw > 0 ? "\u221e" : "\u2013",
      avgWin: wins.length ? sg(gw / wins.length) : "\u2013",
      avgLoss: losses.length ? sg(-gl / losses.length) : "\u2013",
      rCount: rs.length,
      rTotal: rSum,
      rAvg: rs.length ? rSum / rs.length : 0,
      pipCount: pp.length,
      pipTotal: pipSum,
      pipAvg: pp.length ? pipSum / pp.length : 0,
      curve: [0, ...ps.map((p) => (c += p))],
    };
  }, [shown]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const g = (k: string) => String(f.get(k) ?? "").trim();
    const opt = (k: string) => (g(k) === "" ? null : parseFloat(g(k)));

    const row = {
      traded_at: g("date"),
      symbol: g("symbol").toUpperCase(),
      side: g("side") as "long" | "short",
      entry_price: parseFloat(g("entry")),
      exit_price: parseFloat(g("exit")),
      quantity: parseFloat(g("qty")),
      fees: parseFloat(g("fees")) || 0,
      stop_loss: opt("sl"),
      take_profit: opt("tp"),
      pip_size: opt("pipsize"),
      pip_value: opt("pipval"),
      setup: g("setup") || null,
      notes: g("notes") || null,
      screenshot_path: editing?.screenshot_path ?? null,
    };

    if (![row.entry_price, row.exit_price, row.quantity].every(Number.isFinite) || row.quantity <= 0) {
      setErr("Harga entry, harga exit, dan ukuran harus diisi (ukuran lebih dari 0).");
      return;
    }
    const long = row.side === "long";
    if (row.stop_loss != null && (long ? row.stop_loss >= row.entry_price : row.stop_loss <= row.entry_price)) {
      setErr(`Untuk posisi ${long ? "long" : "short"}, stop loss harus ${long ? "di bawah" : "di atas"} harga entry.`);
      return;
    }
    if (row.take_profit != null && (long ? row.take_profit <= row.entry_price : row.take_profit >= row.entry_price)) {
      setErr(`Untuk posisi ${long ? "long" : "short"}, take profit harus ${long ? "di atas" : "di bawah"} harga entry.`);
      return;
    }

    if (row.pip_size != null && !(row.pip_size > 0)) {
      setErr("Ukuran pip harus lebih dari 0.");
      return;
    }
    if (row.pip_value != null) {
      if (!(row.pip_value >= 0)) { setErr("Nilai per pip tidak boleh negatif."); return; }
      if (!(row.pip_size ?? autoPipSize(row.symbol))) {
        setErr("Simbol ini tidak dikenali otomatis. Isi juga Ukuran pip untuk memakai nilai per pip.");
        return;
      }
    }

    setSaving(true);
    setErr("");

    // Screenshot: hapus lama jika diminta, unggah baru jika ada
    if (g("rmshot") === "on" && row.screenshot_path) {
      await supabase.storage.from(BUCKET).remove([row.screenshot_path]);
      row.screenshot_path = null;
    }
    const file = f.get("shot") as File | null;
    if (file && file.size > 0) {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
        setSaving(false);
        setErr("Screenshot harus berupa gambar dengan ukuran maksimal 5 MB.");
        return;
      }
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) { setSaving(false); setErr(up.error.message); return; }
      if (row.screenshot_path) await supabase.storage.from(BUCKET).remove([row.screenshot_path]);
      row.screenshot_path = path;
    }

    const { error } = editing
      ? await supabase.from("trades").update(row).eq("id", editing.id)
      : await supabase.from("trades").insert(row);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    if (editing) setEditing(null); else form.reset();
    await load();
  }

  async function remove(t: Trade) {
    if (armed !== t.id) { setArmed(t.id); return; }
    const { error } = await supabase.from("trades").delete().eq("id", t.id);
    setArmed(null);
    if (error) { setErr(error.message); return; }
    if (t.screenshot_path) await supabase.storage.from(BUCKET).remove([t.screenshot_path]);
    if (editing?.id === t.id) setEditing(null);
    await load();
  }

  async function openShot(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) setErr(error?.message ?? "Gagal membuka screenshot.");
    else setShot(data.signedUrl);
  }

  function startEdit(t: Trade) {
    setEditing(t);
    setErr("");
    document.getElementById("form-panel")?.scrollIntoView({ behavior: "smooth" });
  }

  const e = editing;
  const rows = [...shown].reverse();

  return (
    <div className="wrap">
      <header>
        <h1>Jurnal trading</h1>
        <div className="row">
          <span>{session.user.email}</span>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Keluar</button>
        </div>
      </header>

      <div className="filters">
        <label>Simbol
          <select value={fSym} onChange={(ev) => setFSym(ev.target.value)}>
            <option value="">Semua simbol</option>
            {symbols.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>Setup
          <select value={fSetup} onChange={(ev) => setFSetup(ev.target.value)}>
            <option value="">Semua setup</option>
            {setups.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        {(fSym || fSetup) && (
          <button className="btn ghost" onClick={() => { setFSym(""); setFSetup(""); }}>Reset filter</button>
        )}
      </div>

      <section className="hero" aria-label="Ringkasan ekuitas">
        <div className="lbl">Total profit &amp; loss{(fSym || fSetup) ? " (terfilter)" : ""}</div>
        <div className={`big ${cls(s.total)}`}>{sg(s.total)}</div>
        <Equity values={s.curve} />
      </section>

      <section className="stats" aria-label="Statistik">
        <div><b>{s.count}</b><small>Jumlah trade</small></div>
        <div><b>{s.count ? `${num(s.winRate, 1)}%` : "\u2013"}</b><small>Win rate</small></div>
        <div><b>{s.count ? s.pf : "\u2013"}</b><small>Profit factor</small></div>
        <div><b>{s.avgWin}</b><small>Rata-rata menang</small></div>
        <div><b>{s.avgLoss}</b><small>Rata-rata kalah</small></div>
        <div><b className={cls(s.rTotal)}>{s.rCount ? `${sg(s.rTotal)}R` : "\u2013"}</b><small>Total R</small></div>
        <div><b className={cls(s.rAvg)}>{s.rCount ? `${sg(s.rAvg)}R` : "\u2013"}</b><small>Rata-rata R per trade</small></div>
        <div><b className={cls(s.pipTotal)}>{s.pipCount ? `${sg(s.pipTotal, 1)}` : "\u2013"}</b><small>Total pips</small></div>
        <div><b className={cls(s.pipAvg)}>{s.pipCount ? `${sg(s.pipAvg, 1)}` : "\u2013"}</b><small>Rata-rata pips per trade</small></div>
      </section>

      <Calendar
        trades={shown}
        month={month}
        setMonth={setMonth}
        note={[fSym && `Simbol ${fSym}`, fSetup && `Setup ${fSetup}`].filter(Boolean).join(" \u00b7 ")}
      />

      <section className="panel" id="form-panel">
        <h2>{e ? "Edit trade" : "Catat trade"}</h2>
        {e && (
          <div className="banner row" style={{ marginBottom: 12 }}>
            Mengedit trade {e.symbol} tanggal {e.traded_at}.
            <button className="link" type="button" onClick={() => { setEditing(null); setErr(""); }}>Batal edit</button>
          </div>
        )}
        <form className="grid" key={e?.id ?? "new"} onSubmit={save}>
          <label>Tanggal<input type="date" name="date" defaultValue={e?.traded_at ?? todayStr()} required /></label>
          <label>Simbol<input name="symbol" placeholder="EURUSD" defaultValue={e?.symbol} required /></label>
          <label>Posisi
            <select name="side" defaultValue={e?.side ?? "long"}>
              <option value="long">Long (beli)</option><option value="short">Short (jual)</option>
            </select>
          </label>
          <label>Harga entry<input type="number" step="any" name="entry" defaultValue={e?.entry_price} required /></label>
          <label>Harga exit<input type="number" step="any" name="exit" defaultValue={e?.exit_price} required /></label>
          <label>Ukuran (lot/unit)<input type="number" step="any" min="0" name="qty" defaultValue={e?.quantity} required /></label>
          <label>Stop loss<input type="number" step="any" name="sl" defaultValue={e?.stop_loss ?? ""} placeholder="Untuk hitung R" /></label>
          <label>Take profit<input type="number" step="any" name="tp" defaultValue={e?.take_profit ?? ""} placeholder="Untuk hitung R:R" /></label>
          <label>Biaya (fee/swap)<input type="number" step="any" min="0" name="fees" defaultValue={e?.fees || ""} placeholder="0" /></label>
          <label>Ukuran pip<input type="number" step="any" min="0" name="pipsize" defaultValue={e?.pip_size ?? ""} placeholder="Otomatis" /></label>
          <label>Nilai per pip (1 lot)<input type="number" step="any" min="0" name="pipval" defaultValue={e?.pip_value ?? ""} placeholder="Opsional" /></label>
          <small className="hint wide">
            Pips dihitung otomatis untuk pasangan mata uang (0.0001, atau 0.01 untuk JPY), XAU (0.1), dan XAG (0.01). Isi &quot;Ukuran pip&quot; untuk simbol lain atau jika broker Anda berbeda.
            Isi &quot;Nilai per pip&quot; (dalam mata uang akun, per 1 lot, lihat di broker) agar P&amp;L dihitung dari pips x nilai per pip x lot; kosongkan untuk P&amp;L dari selisih harga x ukuran.
          </small>
          <label>Setup<input name="setup" list="setup-list" placeholder="Breakout, pullback…" defaultValue={e?.setup ?? ""} /></label>
          <datalist id="setup-list">{setups.map((x) => <option key={x} value={x} />)}</datalist>
          <label className="wide">Catatan<input name="notes" placeholder="Alasan masuk, emosi, pelajaran" defaultValue={e?.notes ?? ""} /></label>
          <label className="wide">Screenshot chart (gambar, maks. 5 MB)<input type="file" name="shot" accept="image/*" /></label>
          {e?.screenshot_path && (
            <label className="wide chk"><input type="checkbox" name="rmshot" /> Hapus screenshot yang tersimpan</label>
          )}
          <div className="row wide">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : e ? "Simpan perubahan" : "Simpan trade"}
            </button>
            {err && <span className="err" role="alert">{err}</span>}
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Riwayat trade</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th><th>Simbol</th><th>Posisi</th>
                <th className="r">Entry</th><th className="r">Exit</th><th className="r">Ukuran</th>
                <th className="r">Pips</th><th className="r">R:R rencana</th><th className="r">R hasil</th><th className="r">P&amp;L</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const p = pnl(t), r = rMult(t), plan = rr(t), pp = pipsOf(t), sl = slPips(t), tp = tpPips(t);
                return (
                  <tr key={t.id}>
                    <td data-label="Tanggal">{t.traded_at}</td>
                    <td data-label="Simbol" className="c-sym">
                      <div className="sym">{t.symbol}</div>
                      {t.setup && <div className="note">{t.setup}</div>}
                      {t.notes && <div className="note">{t.notes}</div>}
                    </td>
                    <td data-label="Posisi"><span className={`tag ${t.side}`}>{t.side === "long" ? "Long" : "Short"}</span></td>
                    <td className="r" data-label="Entry">{num(t.entry_price, 5)}</td>
                    <td className="r" data-label="Exit">{num(t.exit_price, 5)}</td>
                    <td className="r" data-label="Ukuran">{num(t.quantity, 4)}</td>
                    <td className="r" data-label="Pips"><div>
                      {pp == null ? "\u2013" : <span className={cls(pp)}>{sg(pp, 1)}</span>}
                      {(sl != null || tp != null) && (
                        <div className="note" style={{ maxWidth: "none" }}>
                          {sl != null ? `SL ${num(sl, 1)}` : ""}{sl != null && tp != null ? " \u00b7 " : ""}{tp != null ? `TP ${num(tp, 1)}` : ""}
                        </div>
                      )}
                    </div></td>
                    <td className="r" data-label="R:R rencana">{plan == null ? "\u2013" : `1:${num(plan)}`}</td>
                    <td className={`r ${r == null ? "" : cls(r)}`} data-label="R hasil">{r == null ? "\u2013" : `${sg(r)}R`}</td>
                    <td className={`r ${cls(p)}`} data-label="P&amp;L"><b>{sg(p)}</b></td>
                    <td className="r act" style={{ whiteSpace: "nowrap" }}>
                      {t.screenshot_path && <button className="link" onClick={() => openShot(t.screenshot_path!)}>Chart</button>}
                      <button className="link" onClick={() => startEdit(t)}>Edit</button>
                      <button className="x" aria-label="Hapus trade" onClick={() => remove(t)}>
                        {armed === t.id ? "Yakin?" : "Hapus"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && rows.length === 0 && (
          <div className="empty">
            {trades.length ? "Tidak ada trade yang cocok dengan filter." : "Belum ada trade. Isi form di atas untuk mencatat trade pertama Anda."}
          </div>
        )}
      </section>

      {shot && (
        <div className="modal" onClick={() => setShot(null)} role="dialog" aria-label="Screenshot chart">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="Screenshot chart" />
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  return session ? <Journal session={session} /> : <Auth />;
}