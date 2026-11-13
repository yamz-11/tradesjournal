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

function InteractiveChart({
  trades,
  values,
}: {
  trades: Trade[];
  values: number[];
}) {
  const [tab, setTab] = useState<"equity" | "drawdown">("equity");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Hitung nilai drawdown nominal dari titik puncak (peak)
  const drawdowns = useMemo(() => {
    let peak = 0;
    return values.map((v) => {
      peak = Math.max(peak, v);
      return peak - v;
    });
  }, [values]);

  const activeValues = tab === "equity" ? values : drawdowns.map((d) => -d);

  if (activeValues.length < 2) {
    return (
      <svg viewBox="0 0 600 150" preserveAspectRatio="none">
        <line x1="0" y1="75" x2="600" y2="75" stroke="currentColor" strokeOpacity=".25" strokeDasharray="4 5" />
      </svg>
    );
  }

  const n = activeValues.length;
  let mn = Math.min(...activeValues), mx = Math.max(...activeValues);
  if (mx === mn) { mx += 1; mn -= 1; }
  const X = (i: number) => (i / (n - 1)) * 600;
  const Y = (v: number) => 135 - ((v - mn) / (mx - mn)) * 115;
  const line = activeValues.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  const lastVal = activeValues[activeValues.length - 1];
  const col = tab === "drawdown" ? "#ff7a8a" : lastVal >= 0 ? "#4ade9a" : "#ff7a8a";

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const idx = Math.round(ratio * (n - 1));
    setHoverIndex(idx);
  };

  const hoveredTrade = hoverIndex != null && hoverIndex > 0 ? trades[hoverIndex - 1] : null;
  const hoveredVal = hoverIndex != null ? values[hoverIndex] : null;
  const hoveredDd = hoverIndex != null ? drawdowns[hoverIndex] : null;

  return (
    <div>
      <div className="chart-header">
        <div className="chart-tabs">
          <button
            type="button"
            className={`chart-tab-btn ${tab === "equity" ? "active" : ""}`}
            onClick={() => setTab("equity")}
          >
            Kurva Ekuitas
          </button>
          <button
            type="button"
            className={`chart-tab-btn ${tab === "drawdown" ? "active" : ""}`}
            onClick={() => setTab("drawdown")}
          >
            Drawdown
          </button>
        </div>
      </div>

      <div className="interactive-chart-wrap">
        <svg
          viewBox="0 0 600 150"
          preserveAspectRatio="none"
          className="chart-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={col} stopOpacity=".38" />
              <stop offset="1" stopColor={col} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Garis nol baseline */}
          <line
            x1="0"
            x2="600"
            y1={Y(0)}
            y2={Y(0)}
            stroke="currentColor"
            strokeOpacity=".28"
            strokeDasharray="4 5"
          />

          {/* Area polygon fill */}
          <polygon points={`0,150 ${line} 600,150`} fill="url(#chartGradient)" />

          {/* Polyline garis grafik */}
          <polyline
            points={line}
            fill="none"
            stroke={col}
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />

          {/* Crosshair & titik hover */}
          {hoverIndex != null && (
            <>
              <line
                x1={X(hoverIndex)}
                x2={X(hoverIndex)}
                y1="0"
                y2="150"
                stroke="#ffffff"
                strokeOpacity=".45"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={X(hoverIndex)}
                cy={Y(activeValues[hoverIndex])}
                r="5"
                fill={col}
                stroke="#ffffff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Tooltip mengambang interaktif */}
        {hoverIndex != null && (
          <div className="chart-tooltip-floating">
            {hoverIndex === 0 ? (
              <div className="row-item">
                <span className="lbl">Awal Modal</span>
                <span className="val">0.00</span>
              </div>
            ) : (
              <>
                <div className="row-item">
                  <span className="lbl">Trade #{hoverIndex}</span>
                  <span className="val">{hoveredTrade?.traded_at}</span>
                </div>
                {hoveredTrade && (
                  <div className="row-item">
                    <span className="lbl">{hoveredTrade.symbol} {hoveredTrade.setup ? `(${hoveredTrade.setup})` : ""}</span>
                    <span className={`val ${cls(pnl(hoveredTrade))}`}>{sg(pnl(hoveredTrade))}</span>
                  </div>
                )}
                {hoveredVal != null && (
                  <div className="row-item">
                    <span className="lbl">Total Ekuitas</span>
                    <span className={`val ${cls(hoveredVal)}`}>{sg(hoveredVal)}</span>
                  </div>
                )}
                {hoveredDd != null && hoveredDd > 0 && (
                  <div className="row-item">
                    <span className="lbl">Drawdown</span>
                    <span className="val neg">−{num(hoveredDd)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
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

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "light" | "dark" | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.setAttribute("data-theme", initial);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}

function ThemeToggle({ theme, toggleTheme }: { theme: "light" | "dark"; toggleTheme: () => void }) {
  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title={theme === "dark" ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      aria-label="Ubah tema"
    >
      <span className="theme-toggle-icon">
        {theme === "dark" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </span>
      <span>{theme === "dark" ? "Terang" : "Gelap"}</span>
    </button>
  );
}

function Auth({ theme, toggleTheme }: { theme: "light" | "dark"; toggleTheme: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);

  function fillDemo() {
    setEmail("admin@yamz.com");
    setPassword("admin@yamz.com");
  }

  async function submit(targetMode: "in" | "up" = mode) {
    if (!email || !password) return;
    setBusy(true);
    setMsg("");
    const { error } =
      targetMode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      setMsgType("error");
      setMsg(error.message);
    } else if (targetMode === "up") {
      setMsgType("success");
      setMsg("Akun berhasil dibuat! Silakan cek email Anda untuk konfirmasi, lalu masuk.");
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-theme-switch">
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
      </div>
      <div className="auth-glow auth-glow-1" />
      <div className="auth-glow auth-glow-2" />
      <div className="auth-grid-bg" />

      <div className="auth-container">
        {/* Branding Header */}
        <div className="auth-header">
          {/* <div className="auth-logo-badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
              <circle cx="19" cy="9" r="2" fill="white" />
            </svg>
          </div> */}
          {/* <div className="auth-badge-pill">
            <span className="auth-badge-dot" />
            Platform Jurnal Trading Pro
          </div> */}
          <h1 className="auth-title">Jurnal Trading</h1>
          <p className="auth-subtitle">
            {mode === "in"
              ? "Masuk untuk melihat, mengevaluasi, dan mencatat trade Anda."
              : "Buat akun baru untuk mulai membangun konsistensi trading Anda."}
          </p>
        </div>

        {/* Card */}
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={`auth-tab ${mode === "in" ? "active" : ""}`}
              onClick={() => { setMode("in"); setMsg(""); }}
            >
              Masuk
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "up" ? "active" : ""}`}
              onClick={() => { setMode("up"); setMsg(""); }}
            >
              Daftar Akun
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(mode);
            }}
            className="auth-form"
          >
            {/* Email */}
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  id="auth-email"
                  type="email"
                  className="auth-input"
                  placeholder="admin@yamz.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="auth-field">
              <div className="auth-field-header">
                <label htmlFor="auth-pass">Kata Sandi</label>
                {mode === "up" && <span className="auth-hint">Min. 6 karakter</span>}
              </div>
              <div className="auth-input-wrap">
                <span className="auth-input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="auth-pass"
                  type={showPassword ? "text" : "password"}
                  className="auth-input has-action"
                  placeholder="Masukkan kata sandi"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  required
                />
                <button
                  type="button"
                  className="auth-action-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Demo Credentials Badge */}
            <div className="auth-demo-badge" onClick={fillDemo} title="Klik untuk isi otomatis akun demo">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>Akun Demo: <b>admin@yamz.com</b> (Klik untuk isi cepat)</span>
            </div>

            {/* Message alert */}
            {msg && (
              <div className={`auth-alert ${msgType}`} role="alert">
                <span className="auth-alert-icon">
                  {msgType === "error" ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span>{msg}</span>
              </div>
            )}

            {/* Submit button */}
            <button className="auth-submit-btn" type="submit" disabled={busy}>
              {busy ? (
                <>
                  <svg className="auth-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  <span>Memproses...</span>
                </>
              ) : mode === "in" ? (
                <>
                  <span>Masuk</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              ) : (
                <>
                  <span>Daftar Akun</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" x2="19" y1="8" y2="14" />
                    <line x1="22" x2="16" y1="11" y2="11" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Footer switch */}
          <div className="auth-switch-footer">
            {mode === "in" ? (
              <p>
                Belum punya akun?{" "}
                <button
                  type="button"
                  className="auth-link-inline"
                  onClick={() => { setMode("up"); setMsg(""); }}
                >
                  Daftar akun baru
                </button>
              </p>
            ) : (
              <p>
                Sudah punya akun?{" "}
                <button
                  type="button"
                  className="auth-link-inline"
                  onClick={() => { setMode("in"); setMsg(""); }}
                >
                  Masuk di sini
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Features badges */}
        <div className="auth-features">
          <div className="auth-feature-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <span>Kurva Ekuitas</span>
          </div>
          <div className="auth-feature-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Kalender Hasil P&amp;L</span>
          </div>
          <div className="auth-feature-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>R:R &amp; R-Multiple</span>
          </div>
        </div>
      </div>
    </div >
  );
}

type SortField =
  | "traded_at"
  | "symbol"
  | "side"
  | "entry_price"
  | "exit_price"
  | "quantity"
  | "pips"
  | "plan"
  | "r"
  | "pnl";

type SortOrder = "asc" | "desc";

type ToastItem = {
  id: string;
  text: string;
  type: "success" | "error" | "info";
};

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [1];
  if (current > 3) pages.push("...");
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}

function Journal({
  session,
  theme,
  toggleTheme,
}: {
  session: Session;
  theme: "light" | "dark";
  toggleTheme: () => void;
}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Trade | null>(null);
  const [fSym, setFSym] = useState("");
  const [fSetup, setFSetup] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fPreset, setFPreset] = useState<"all" | "today" | "7d" | "30d" | "thisMonth">("all");
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const [shot, setShot] = useState<string | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const addToast = useCallback((text: string, type: "success" | "error" | "info" = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<SortField>("traded_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const applyPreset = (preset: "all" | "today" | "7d" | "30d" | "thisMonth") => {
    setFPreset(preset);
    setPage(1);
    const now = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (preset === "all") {
      setFStart("");
      setFEnd("");
    } else if (preset === "today") {
      const s = fmt(now);
      setFStart(s);
      setFEnd(s);
    } else if (preset === "7d") {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      setFStart(fmt(past));
      setFEnd(fmt(now));
    } else if (preset === "30d") {
      const past = new Date(now);
      past.setDate(past.getDate() - 29);
      setFStart(fmt(past));
      setFEnd(fmt(now));
    } else if (preset === "thisMonth") {
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      setFStart(start);
      setFEnd(end);
    }
  };

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
    () =>
      trades.filter((t) => {
        if (fSym && t.symbol !== fSym) return false;
        if (fSetup && t.setup !== fSetup) return false;
        if (fStart && t.traded_at < fStart) return false;
        if (fEnd && t.traded_at > fEnd) return false;
        return true;
      }),
    [trades, fSym, fSetup, fStart, fEnd]
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

    // Equity curve & Max Drawdown
    let c = 0;
    const curve = [0, ...ps.map((p) => (c += p))];
    let peak = 0;
    let maxDd = 0;
    curve.forEach((v) => {
      peak = Math.max(peak, v);
      const dd = peak - v;
      if (dd > maxDd) maxDd = dd;
    });

    // Sharpe ratio
    let sharpe: number | null = null;
    if (ps.length >= 2) {
      const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
      const variance = ps.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (ps.length - 1);
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        sharpe = (mean / stdDev) * Math.sqrt(Math.min(ps.length, 252));
      }
    }

    // Streak tracker
    let curStreakType: "win" | "loss" | "none" = "none";
    let curStreakCount = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempWin = 0;
    let tempLoss = 0;

    const chronoTrades = [...shown].sort((a, b) => a.traded_at.localeCompare(b.traded_at));
    for (const t of chronoTrades) {
      const p = pnl(t);
      if (p > 0) {
        tempWin += 1;
        tempLoss = 0;
        if (tempWin > maxWinStreak) maxWinStreak = tempWin;
        curStreakType = "win";
        curStreakCount = tempWin;
      } else if (p < 0) {
        tempLoss += 1;
        tempWin = 0;
        if (tempLoss > maxLossStreak) maxLossStreak = tempLoss;
        curStreakType = "loss";
        curStreakCount = tempLoss;
      }
    }

    // Performa per Setup
    const setupMap: Record<
      string,
      {
        name: string;
        count: number;
        wins: number;
        losses: number;
        gw: number;
        gl: number;
        totalPnl: number;
        rVals: number[];
      }
    > = {};

    shown.forEach((t) => {
      const name = t.setup?.trim() || "Tanpa Setup";
      if (!setupMap[name]) {
        setupMap[name] = { name, count: 0, wins: 0, losses: 0, gw: 0, gl: 0, totalPnl: 0, rVals: [] };
      }
      const item = setupMap[name];
      const p = pnl(t);
      const r = rMult(t);
      item.count += 1;
      item.totalPnl += p;
      if (p > 0) {
        item.wins += 1;
        item.gw += p;
      } else if (p < 0) {
        item.losses += 1;
        item.gl += -p;
      }
      if (r != null) item.rVals.push(r);
    });

    const setupList = Object.values(setupMap)
      .map((item) => {
        const winRate = item.count ? (item.wins / item.count) * 100 : 0;
        const pf = item.gl > 0 ? item.gw / item.gl : item.gw > 0 ? 999 : 0;
        const avgR = item.rVals.length ? item.rVals.reduce((a, b) => a + b, 0) / item.rVals.length : null;
        const avgPnl = item.count ? item.totalPnl / item.count : 0;
        return { ...item, winRate, pf, avgR, avgPnl };
      })
      .sort((a, b) => b.totalPnl - a.totalPnl);

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
      curve,
      maxDrawdown: maxDd,
      sharpeRatio: sharpe,
      maxWinStreak,
      maxLossStreak,
      curStreakType,
      curStreakCount,
      setupList,
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
      const m = "Harga entry, harga exit, dan ukuran harus diisi (ukuran lebih dari 0).";
      setErr(m);
      addToast(m, "error");
      return;
    }
    const long = row.side === "long";
    if (row.stop_loss != null && (long ? row.stop_loss >= row.entry_price : row.stop_loss <= row.entry_price)) {
      const m = `Untuk posisi ${long ? "long" : "short"}, stop loss harus ${long ? "di bawah" : "di atas"} harga entry.`;
      setErr(m);
      addToast(m, "error");
      return;
    }
    if (row.take_profit != null && (long ? row.take_profit <= row.entry_price : row.take_profit >= row.entry_price)) {
      const m = `Untuk posisi ${long ? "long" : "short"}, take profit harus ${long ? "di atas" : "di bawah"} harga entry.`;
      setErr(m);
      addToast(m, "error");
      return;
    }

    if (row.pip_size != null && !(row.pip_size > 0)) {
      const m = "Ukuran pip harus lebih dari 0.";
      setErr(m);
      addToast(m, "error");
      return;
    }
    if (row.pip_value != null) {
      if (!(row.pip_value >= 0)) {
        const m = "Nilai per pip tidak boleh negatif.";
        setErr(m);
        addToast(m, "error");
        return;
      }
      if (!(row.pip_size ?? autoPipSize(row.symbol))) {
        const m = "Simbol ini tidak dikenali otomatis. Isi juga Ukuran pip untuk memakai nilai per pip.";
        setErr(m);
        addToast(m, "error");
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
        const m = "Screenshot harus berupa gambar dengan ukuran maksimal 5 MB.";
        setErr(m);
        addToast(m, "error");
        return;
      }
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) {
        setSaving(false);
        setErr(up.error.message);
        addToast(up.error.message, "error");
        return;
      }
      if (row.screenshot_path) await supabase.storage.from(BUCKET).remove([row.screenshot_path]);
      row.screenshot_path = path;
    }

    const { error } = editing
      ? await supabase.from("trades").update(row).eq("id", editing.id)
      : await supabase.from("trades").insert(row);
    setSaving(false);
    if (error) {
      setErr(error.message);
      addToast(error.message, "error");
      return;
    }
    if (editing) {
      setEditing(null);
      addToast(`Trade ${row.symbol} berhasil diperbarui!`, "success");
    } else {
      form.reset();
      addToast(`Trade ${row.symbol} berhasil dicatat!`, "success");
    }
    await load();
  }

  async function remove(t: Trade) {
    if (armed !== t.id) { setArmed(t.id); return; }
    const { error } = await supabase.from("trades").delete().eq("id", t.id);
    setArmed(null);
    if (error) {
      setErr(error.message);
      addToast(error.message, "error");
      return;
    }
    if (t.screenshot_path) await supabase.storage.from(BUCKET).remove([t.screenshot_path]);
    if (editing?.id === t.id) setEditing(null);
    addToast(`Trade ${t.symbol} berhasil dihapus.`, "success");
    await load();
  }

  async function openShot(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) {
      setErr(error?.message ?? "Gagal membuka screenshot.");
      addToast(error?.message ?? "Gagal membuka screenshot.", "error");
    } else {
      setShot(data.signedUrl);
    }
  }

  function startEdit(t: Trade) {
    setEditing(t);
    setErr("");
    document.getElementById("form-panel")?.scrollIntoView({ behavior: "smooth" });
  }

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(
        field === "traded_at" || field === "pnl" || field === "pips" || field === "r" ? "desc" : "asc"
      );
    }
    setPage(1);
  };

  const sortedRows = useMemo(() => {
    const list = [...shown];
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      switch (sortField) {
        case "traded_at":
          valA = a.traded_at;
          valB = b.traded_at;
          break;
        case "symbol":
          valA = a.symbol;
          valB = b.symbol;
          break;
        case "side":
          valA = a.side;
          valB = b.side;
          break;
        case "entry_price":
          valA = a.entry_price;
          valB = b.entry_price;
          break;
        case "exit_price":
          valA = a.exit_price;
          valB = b.exit_price;
          break;
        case "quantity":
          valA = a.quantity;
          valB = b.quantity;
          break;
        case "pips":
          valA = pipsOf(a) ?? -99999999;
          valB = pipsOf(b) ?? -99999999;
          break;
        case "plan":
          valA = rr(a) ?? -99999999;
          valB = rr(b) ?? -99999999;
          break;
        case "r":
          valA = rMult(a) ?? -99999999;
          valB = rMult(b) ?? -99999999;
          break;
        case "pnl":
          valA = pnl(a);
          valB = pnl(b);
          break;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [shown, sortField, sortOrder]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const pagedRows = sortedRows.slice(startIndex, endIndex);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function SortTh({
    field,
    label,
    align = "left",
  }: {
    field: SortField;
    label: string;
    align?: "left" | "right";
  }) {
    const active = sortField === field;
    return (
      <th
        className={`sortable ${align === "right" ? "r" : ""} ${active ? "sort-active" : ""}`}
        onClick={() => toggleSort(field)}
        title={`Klik untuk mengurutkan berdasarkan ${label}`}
      >
        {label}
        <span className="sort-indicator">
          {active ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </th>
    );
  }

  const e = editing;
  const isFiltered = Boolean(fSym || fSetup || fStart || fEnd);

  return (
    <div className="wrap">
      <header>
        <h1>Jurnal trading</h1>
        <div className="row">
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
          <span>{session.user.email}</span>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Keluar</button>
        </div>
      </header>

      <div className="filters">
        <label>Simbol
          <select value={fSym} onChange={(ev) => { setFSym(ev.target.value); setPage(1); }}>
            <option value="">Semua simbol</option>
            {symbols.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label>Setup
          <select value={fSetup} onChange={(ev) => { setFSetup(ev.target.value); setPage(1); }}>
            <option value="">Semua setup</option>
            {setups.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-date">Dari Tanggal
          <input
            type="date"
            value={fStart}
            onChange={(ev) => {
              setFStart(ev.target.value);
              setFPreset("all");
              setPage(1);
            }}
          />
        </label>
        <label className="filter-date">Sampai Tanggal
          <input
            type="date"
            value={fEnd}
            onChange={(ev) => {
              setFEnd(ev.target.value);
              setFPreset("all");
              setPage(1);
            }}
          />
        </label>
        {isFiltered && (
          <button
            className="btn ghost"
            onClick={() => {
              setFSym("");
              setFSetup("");
              setFStart("");
              setFEnd("");
              setFPreset("all");
              setPage(1);
            }}
          >
            Reset filter
          </button>
        )}

        <div className="filter-presets">
          <span className="filter-presets-title">Rentang:</span>
          <button
            type="button"
            className={`filter-preset-btn ${!fStart && !fEnd ? "active" : ""}`}
            onClick={() => applyPreset("all")}
          >
            Semua
          </button>
          <button
            type="button"
            className={`filter-preset-btn ${fPreset === "today" ? "active" : ""}`}
            onClick={() => applyPreset("today")}
          >
            Hari Ini
          </button>
          <button
            type="button"
            className={`filter-preset-btn ${fPreset === "7d" ? "active" : ""}`}
            onClick={() => applyPreset("7d")}
          >
            7 Hari
          </button>
          <button
            type="button"
            className={`filter-preset-btn ${fPreset === "30d" ? "active" : ""}`}
            onClick={() => applyPreset("30d")}
          >
            30 Hari
          </button>
          <button
            type="button"
            className={`filter-preset-btn ${fPreset === "thisMonth" ? "active" : ""}`}
            onClick={() => applyPreset("thisMonth")}
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {loading ? (
        <div className="skeleton skel-hero" />
      ) : (
        <section className="hero" aria-label="Ringkasan ekuitas">
          <div className="lbl">Total profit &amp; loss{isFiltered ? " (terfilter)" : ""}</div>
          <div className={`big ${cls(s.total)}`}>{sg(s.total)}</div>
          <InteractiveChart trades={shown} values={s.curve} />
        </section>
      )}

      {loading ? (
        <div className="skel-stats">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton skel-stat" />
          ))}
        </div>
      ) : (
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
      )}

      {/* Kartu Analitik Lanjutan */}
      {!loading && s.count > 0 && (
        <div className="analytics-cards" aria-label="Analitik lanjutan">
          <div className="analytics-card">
            <div className="card-head">
              <span className="card-title">Max Drawdown</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--loss)" }}>
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                <polyline points="17 18 23 18 23 12" />
              </svg>
            </div>
            <div className="card-val neg">
              {s.maxDrawdown > 0 ? `−${num(s.maxDrawdown)}` : "0.00"}
            </div>
            <div className="card-sub">Penurunan terbesar dari puncak</div>
          </div>

          <div className="analytics-card">
            <div className="card-head">
              <span className="card-title">Sharpe Ratio</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--accent)" }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className={`card-val ${s.sharpeRatio != null ? (s.sharpeRatio >= 1 ? "pos" : s.sharpeRatio < 0 ? "neg" : "") : ""}`}>
              {s.sharpeRatio != null ? num(s.sharpeRatio, 2) : "–"}
            </div>
            <div className="card-sub">
              {s.sharpeRatio != null
                ? s.sharpeRatio >= 2
                  ? "Sangat Baik (≥ 2.0)"
                  : s.sharpeRatio >= 1
                  ? "Baik (≥ 1.0)"
                  : "Risiko Tinggi (< 1.0)"
                : "Risk-adjusted return"}
            </div>
          </div>

          <div className="analytics-card">
            <div className="card-head">
              <span className="card-title">Streak Menang</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--win)" }}>
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
            </div>
            <div className="card-val pos">
              {s.maxWinStreak} <small style={{ fontSize: 13, fontWeight: 600 }}>trade</small>
            </div>
            <div className="card-sub">
              Saat ini:{" "}
              {s.curStreakType === "win" ? (
                <b className="pos">+{s.curStreakCount} Win beruntun</b>
              ) : s.curStreakType === "loss" ? (
                <b className="neg">−{s.curStreakCount} Loss beruntun</b>
              ) : (
                "–"
              )}
            </div>
          </div>

          <div className="analytics-card">
            <div className="card-head">
              <span className="card-title">Streak Kalah</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--loss)" }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="card-val neg">
              {s.maxLossStreak} <small style={{ fontSize: 13, fontWeight: 600 }}>trade</small>
            </div>
            <div className="card-sub">Kekalahan beruntun terpanjang</div>
          </div>
        </div>
      )}

      {/* Performa per Setup */}
      {!loading && s.setupList && s.setupList.length > 0 && (
        <section className="panel setup-panel">
          <div className="table-toolbar">
            <h2>Performa per Setup</h2>
            <span className="table-count-badge">
              <b>{s.setupList.length}</b> setup
            </span>
          </div>

          <div className="setup-table-wrap">
            <table className="setup-table">
              <thead>
                <tr>
                  <th>Nama Setup</th>
                  <th className="r">Trade</th>
                  <th className="r">Win Rate</th>
                  <th className="r">Profit Factor</th>
                  <th className="r">Rata-rata R</th>
                  <th className="r">Total P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {s.setupList.map((st) => (
                  <tr key={st.name}>
                    <td>
                      <b>{st.name}</b>
                    </td>
                    <td className="r">{st.count}</td>
                    <td className="r">
                      <div className="setup-progress">
                        <span>{num(st.winRate, 1)}%</span>
                        <div className="setup-bar-track">
                          <div
                            className="setup-bar-fill"
                            style={{
                              width: `${Math.min(100, Math.max(0, st.winRate))}%`,
                              backgroundColor: st.winRate >= 50 ? "var(--win)" : "var(--loss)",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="r">{st.pf >= 999 ? "∞" : num(st.pf, 2)}</td>
                    <td className={`r ${st.avgR != null ? cls(st.avgR) : ""}`}>
                      {st.avgR != null ? `${sg(st.avgR, 2)}R` : "–"}
                    </td>
                    <td className={`r ${cls(st.totalPnl)}`}>
                      <b>{sg(st.totalPnl)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Calendar
        trades={shown}
        month={month}
        setMonth={setMonth}
        note={[
          fSym && `Simbol ${fSym}`,
          fSetup && `Setup ${fSetup}`,
          (fStart || fEnd) && `Periode ${fStart || "..."} s/d ${fEnd || "kini"}`,
        ]
          .filter(Boolean)
          .join(" \u00b7 ")}
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
        <div className="table-toolbar">
          <h2>Riwayat trade</h2>
          <div className="row" style={{ gap: 8 }}>
            <span className="table-count-badge">
              <b>{sortedRows.length}</b> trade{isFiltered ? " (terfilter)" : ""}
            </span>
          </div>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <SortTh field="traded_at" label="Tanggal" />
                <SortTh field="symbol" label="Simbol" />
                <SortTh field="side" label="Posisi" />
                <SortTh field="entry_price" label="Entry" align="right" />
                <SortTh field="exit_price" label="Exit" align="right" />
                <SortTh field="quantity" label="Ukuran" align="right" />
                <SortTh field="pips" label="Pips" align="right" />
                <SortTh field="plan" label="R:R rencana" align="right" />
                <SortTh field="r" label="R hasil" align="right" />
                <SortTh field="pnl" label="P&L" align="right" />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td colSpan={11} style={{ padding: "10px 12px" }}>
                      <div className="skeleton skel-table-row" style={{ height: 38, margin: 0 }} />
                    </td>
                  </tr>
                ))
              ) : (
                pagedRows.map((t) => {
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
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && pagedRows.length === 0 && (
          <div className="empty">
            {trades.length ? "Tidak ada trade yang cocok dengan filter." : "Belum ada trade. Isi form di atas untuk mencatat trade pertama Anda."}
          </div>
        )}

        {/* Pagination controls */}
        {!loading && totalRows > 0 && (
          <div className="pagination">
            <div className="pagination-info">
              Menampilkan <b>{startIndex + 1}–{endIndex}</b> dari <b>{totalRows}</b> trade
            </div>

            <div className="pagination-controls">
              <button
                type="button"
                className="pagination-btn"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman sebelumnya"
              >
                &lsaquo;
              </button>

              {getPageNumbers(currentPage, totalPages).map((p, idx) =>
                typeof p === "number" ? (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn ${currentPage === p ? "active" : ""}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`ellipsis-${idx}`} style={{ padding: "0 4px", color: "var(--mute)" }}>
                    ...
                  </span>
                )
              )}

              <button
                type="button"
                className="pagination-btn"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman berikutnya"
              >
                &rsaquo;
              </button>
            </div>

            <div className="pagination-size">
              <label>
                Tampilkan:
                <select
                  value={pageSize}
                  onChange={(ev) => {
                    setPageSize(Number(ev.target.value));
                    setPage(1);
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                baris
              </label>
            </div>
          </div>
        )}
      </section>

      {shot && (
        <div className="modal" onClick={() => setShot(null)} role="dialog" aria-label="Screenshot chart">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="Screenshot chart" />
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
            <span className="toast-icon">
              {t.type === "success" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {t.type === "error" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {t.type === "info" && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </span>
            <span className="toast-text">{t.text}</span>
            <button className="toast-close" onClick={(ev) => { ev.stopPropagation(); removeToast(t.id); }} aria-label="Tutup notifikasi">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  return session ? (
    <Journal session={session} theme={theme} toggleTheme={toggleTheme} />
  ) : (
    <Auth theme={theme} toggleTheme={toggleTheme} />
  );
}