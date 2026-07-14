/**
 * ResetPassword.jsx — Unorthodox Athletes
 *
 * Design system applied:
 *  • Luxury skill   (Oswald font, monochromatic black, 8pt grid, uppercase labels)
 *  • Glassmorphism  (frosted-glass inputs, luminous focus borders, ambient glow)
 *  • GSAP patterns  (staggered CSS entry, spring-feel transitions via cubic-bezier)
 *
 * Functionality: unchanged (requestRecovery + setNewPassword via Supabase REST).
 */

import { useState, useEffect } from "react";

// ─── Google Font (Oswald — Luxury skill) ────────────────────────────────────
const FONT_LINK = document.createElement("link");
FONT_LINK.href = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap";
FONT_LINK.rel  = "stylesheet";
if (!document.head.querySelector('[href*="Oswald"]')) document.head.appendChild(FONT_LINK);

// ─── Keyframe injection ───────────────────────────────────────────────────────
const STYLE = document.createElement("style");
STYLE.textContent = `
  @keyframes ua-fadeUp   { from { opacity:0; transform:translateY(28px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ua-scaleIn  { from { opacity:0; transform:scale(0.8);       } to { opacity:1; transform:scale(1);   } }
  @keyframes ua-spin     { to   { transform:rotate(360deg); } }
  @keyframes ua-pulse    { 0%,100%{ opacity:1 } 50%{ opacity:.5 } }
  @keyframes ua-glow     { 0%,100%{ box-shadow:0 0 16px rgba(0,201,225,.25) } 50%{ box-shadow:0 0 32px rgba(0,201,225,.55) } }
  @keyframes ua-success  { 0%{ transform:scale(0) rotate(-20deg); opacity:0; } 70%{ transform:scale(1.15) rotate(4deg); } 100%{ transform:scale(1) rotate(0); opacity:1; } }

  .ua-stagger > *  { opacity:0; animation: ua-fadeUp .55s cubic-bezier(.22,1,.36,1) forwards; }
  .ua-stagger > *:nth-child(1)  { animation-delay:.05s }
  .ua-stagger > *:nth-child(2)  { animation-delay:.13s }
  .ua-stagger > *:nth-child(3)  { animation-delay:.21s }
  .ua-stagger > *:nth-child(4)  { animation-delay:.29s }
  .ua-stagger > *:nth-child(5)  { animation-delay:.37s }
  .ua-stagger > *:nth-child(6)  { animation-delay:.45s }
  .ua-stagger > *:nth-child(7)  { animation-delay:.53s }

  .ua-input { transition: border-color .25s ease, box-shadow .25s ease, background .25s ease; }
  .ua-input:focus { outline:none; border-color: rgba(0,201,225,.7) !important; box-shadow:0 0 0 3px rgba(0,201,225,.12) !important; background:rgba(0,201,225,.04) !important; }

  .ua-btn { transition: transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease, opacity .18s; }
  .ua-btn:not(:disabled):hover  { transform:translateY(-2px); box-shadow:0 8px 32px rgba(0,201,225,.35); }
  .ua-btn:not(:disabled):active { transform:translateY(0) scale(.97); }

  .ua-back { transition: color .18s ease, transform .18s ease; }
  .ua-back:hover { color: #00C9E1 !important; transform: translateX(-3px); }

  .ua-strength-bar { transition: width .45s cubic-bezier(.22,1,.36,1), background .35s ease; }
`;
if (!document.head.querySelector('#ua-reset-styles')) { STYLE.id = 'ua-reset-styles'; document.head.appendChild(STYLE); }

// ─── Config ───────────────────────────────────────────────────────────────────
const LOGO_SRC = '/logo.png';
const SB_URL   = "https://hxyqvryuniqmvpjljrry.supabase.co";
const SB_KEY   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4eXF2cnl1bmlxbXZwamxqcnJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTQ0NTAsImV4cCI6MjA5Nzg3MDQ1MH0.eSoak4YVf7vqFwYlYebayMS3CCiEjLhZ5olEAnkDJlU";

// ─── Design tokens (Luxury + Glassmorphism blend) ─────────────────────────────
const C = {
  bg:      "#050505",
  surface: "rgba(255,255,255,0.03)",
  border:  "rgba(255,255,255,0.08)",
  cyan:    "#00C9E1",
  pink:    "#E8197A",
  white:   "#ffffff",
  muted:   "#666666",
  green:   "#16a34a",
  amber:   "#d97706",
  red:     "#e63946",
};

// ─── Supabase calls (unchanged) ───────────────────────────────────────────────
const sb = async (path, method = "GET", body = null, token = null) => {
  const res = await fetch(`${SB_URL}${path}`, {
    method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${token || SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text(); return t ? JSON.parse(t) : null;
};
const requestRecovery = (email) =>
  sb(`/auth/v1/recover?redirect_to=${encodeURIComponent(window.location.origin + "/reset-password")}`, "POST", { email });
const setNewPassword  = (accessToken, password) =>
  sb("/auth/v1/user", "PUT", { password }, accessToken);

const friendlyError = (raw) => {
  let p = null;
  try { p = JSON.parse(raw); } catch { return "Something went wrong. Please try again."; }
  const msg = (p.msg || p.error_description || p.message || "").toLowerCase();
  if (msg.includes("rate limit") || msg.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  if (msg.includes("expired") || msg.includes("invalid"))    return "This reset link has expired or is invalid. Request a new one below.";
  if (msg.includes("password") && msg.includes("least"))     return "Password is too short.";
  return p.msg || p.error_description || p.error || "Something went wrong. Please try again.";
};

// ─── Password Strength (new) ──────────────────────────────────────────────────
function getStrength(pw) {
  if (!pw) return { score: 0, label: "", color: "transparent" };
  let s = 0;
  if (pw.length >= 8)          s++;
  if (pw.length >= 12)         s++;
  if (/[A-Z]/.test(pw))        s++;
  if (/[0-9]/.test(pw))        s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 20,  label: "Αδύναμος",    color: C.red   };
  if (s === 2) return { score: 40,  label: "Μέτριος",     color: C.amber };
  if (s === 3) return { score: 65,  label: "Δυνατός",     color: "#16a34a" };
  if (s === 4) return { score: 85,  label: "Πολύ δυνατός",color: "#16a34a" };
  return              { score: 100, label: "Εξαιρετικός", color: C.cyan  };
}

// ─── Shared primitives ────────────────────────────────────────────────────────
const Logo = ({ size = 48 }) => (
  <img src={LOGO_SRC} alt="UA"
    style={{ width: size, height: size, borderRadius: "50%", objectFit: "contain",
             background: "#000", flexShrink: 0 }} />
);

const Label = ({ children }) => (
  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 2.5,
                color: C.muted, textTransform: "uppercase", marginBottom: 8 }}>
    {children}
  </div>
);

const GlassInput = ({ type = "text", placeholder, value, onChange, onKeyDown, suffix }) => (
  <div style={{ position: "relative" }}>
    <input
      className="ua-input"
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      style={{ width: "100%", boxSizing: "border-box", height: 52, paddingLeft: 18,
               paddingRight: suffix ? 52 : 18, background: C.surface,
               border: `1px solid ${C.border}`, borderRadius: 12, color: C.white,
               fontSize: 15, fontFamily: "inherit" }}
    />
    {suffix && (
      <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
        {suffix}
      </div>
    )}
  </div>
);

const PrimaryBtn = ({ label, onClick, disabled, loading, style = {} }) => (
  <button
    className="ua-btn"
    onClick={onClick}
    disabled={disabled || loading}
    style={{ width: "100%", height: 52, borderRadius: 12, border: "none", cursor: (disabled || loading) ? "not-allowed" : "pointer",
             background: (disabled || loading) ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg,${C.cyan},${C.pink})`,
             color: C.white, fontFamily: "'Oswald', sans-serif", fontSize: 15, letterSpacing: 2,
             fontWeight: 600, opacity: (disabled || loading) ? 0.55 : 1,
             boxShadow: (disabled || loading) ? "none" : `0 4px 24px rgba(0,201,225,.2)`, ...style }}>
    {loading
      ? <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid rgba(255,255,255,.3)",
                       borderTopColor: "#fff", borderRadius: "50%", animation: "ua-spin .7s linear infinite" }} />
      : label}
  </button>
);

const ErrorMsg = ({ msg }) => msg ? (
  <div style={{ marginTop: 8, fontSize: 13, color: C.pink, display: "flex", alignItems: "center", gap: 6 }}>
    <span>⚠</span> {msg}
  </div>
) : null;

// ─── Shell (Luxury layout) ────────────────────────────────────────────────────
const Shell = ({ children, key: k }) => (
  <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: "48px 24px",
                fontFamily: "'Inter', -apple-system, sans-serif", position: "relative", overflow: "hidden" }}>

    {/* Ambient glow — Glassmorphism atmosphere */}
    <div style={{ position: "absolute", top: -120, right: -120, width: 400, height: 400,
                  borderRadius: "50%", background: C.cyan, opacity: .055,
                  filter: "blur(80px)", pointerEvents: "none" }} />
    <div style={{ position: "absolute", bottom: -80, left: -80, width: 300, height: 300,
                  borderRadius: "50%", background: C.pink, opacity: .04,
                  filter: "blur(60px)", pointerEvents: "none" }} />

    {/* Wordmark (Luxury: Oswald + gradient) */}
    <div style={{ marginBottom: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <Logo size={88} />
      <div style={{ textAlign: "center", lineHeight: 1 }}>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 700,
                      letterSpacing: 4, color: C.white, textTransform: "uppercase" }}>UNORTHODOX</div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 4,
                      textTransform: "uppercase", background: `linear-gradient(90deg,${C.cyan},${C.pink})`,
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>ATHLETES</div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 3.5, color: C.muted,
                      marginTop: 6, textTransform: "uppercase" }}>Think · Perform · Develop</div>
      </div>
    </div>

    {/* Glass card */}
    <div key={k} className="ua-stagger"
      style={{ width: "100%", maxWidth: 360, background: "rgba(255,255,255,0.025)",
               border: `1px solid ${C.border}`, borderRadius: 20, padding: "28px 24px",
               backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
               boxShadow: "0 24px 80px rgba(0,0,0,.55)" }}>
      {children}
    </div>
  </div>
);

// ─── Step: Request ────────────────────────────────────────────────────────────
const StepRequest = ({ onSent }) => {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const handle = async () => {
    if (!email.trim()) { setErr("Απαιτείται email."); return; }
    setLoading(true); setErr("");
    try { await requestRecovery(email.trim()); onSent(email.trim()); }
    catch (e) { setErr(friendlyError(e.message)); }
    setLoading(false);
  };

  return (
    <Shell key="request">
      {/* Eyebrow (Luxury label pattern) */}
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 3,
                    color: C.cyan, textTransform: "uppercase", marginBottom: 8 }}>
        Επαναφορά κωδικού
      </div>

      {/* Heading */}
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 30, fontWeight: 700,
                    color: C.white, lineHeight: 1.15, marginBottom: 10 }}>
        Ξέχασες τον<br />κωδικό σου;
      </div>

      {/* Body */}
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 24 }}>
        Εισήγαγε το email σου και θα σου στείλουμε σύνδεσμο για να ορίσεις νέο κωδικό.
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: C.border, marginBottom: 22 }} />

      {/* Input */}
      <div>
        <Label>Email</Label>
        <GlassInput
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={e => { setEmail(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && handle()}
        />
        <ErrorMsg msg={err} />
      </div>

      <PrimaryBtn
        label="ΑΠΟΣΤΟΛΗ ΣΥΝΔΕΣΜΟΥ"
        onClick={handle}
        loading={loading}
        disabled={!email.trim()}
        style={{ marginTop: 18 }}
      />

      <a href="/" className="ua-back"
        style={{ display: "block", textAlign: "center", marginTop: 16, color: C.muted,
                 fontSize: 13, textDecoration: "none" }}>
        ← Επιστροφή στη σύνδεση
      </a>
    </Shell>
  );
};

// ─── Step: Sent ───────────────────────────────────────────────────────────────
const StepSent = ({ email }) => (
  <Shell key="sent">
    {/* Animated check icon */}
    <div style={{ width: 64, height: 64, borderRadius: "50%", border: `1.5px solid rgba(0,201,225,.35)`,
                  background: "rgba(0,201,225,.07)", display: "flex", alignItems: "center",
                  justifyContent: "center", marginBottom: 20,
                  animation: "ua-success .6s cubic-bezier(.22,1,.36,1) both" }}>
      <span style={{ fontSize: 26, color: C.cyan }}>📧</span>
    </div>

    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 30, fontWeight: 700,
                  color: C.white, lineHeight: 1.15, marginBottom: 12 }}>
      Έλεγξε το<br />email σου
    </div>

    <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 8 }}>
      Στείλαμε σύνδεσμο επαναφοράς στο
    </div>
    <div style={{ fontSize: 14, fontWeight: 600, color: C.white, marginBottom: 24,
                  wordBreak: "break-all" }}>
      {email}
    </div>

    <div style={{ height: 1, background: C.border, marginBottom: 22 }} />

    <a href="/"
      style={{ display: "block", width: "100%", height: 52, borderRadius: 12, lineHeight: "52px",
               textAlign: "center", textDecoration: "none", color: C.white, fontSize: 14, fontWeight: 600,
               background: `linear-gradient(135deg,${C.cyan},${C.pink})`,
               boxShadow: `0 4px 24px rgba(0,201,225,.2)`, boxSizing: "border-box" }}>
      ← Επιστροφή στη σύνδεση
    </a>
  </Shell>
);

// ─── Step: Reset ──────────────────────────────────────────────────────────────
const StepReset = ({ accessToken, onDone }) => {
  const [pw,         setPw]         = useState("");
  const [confirmPw,  setConfirmPw]  = useState("");
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");

  const strength = getStrength(pw);
  const pwValid  = pw.length >= 8;
  const pwMatch  = pw.length > 0 && pw === confirmPw;

  const handle = async () => {
    if (!pwValid || !pwMatch) return;
    setLoading(true); setErr("");
    try { await setNewPassword(accessToken, pw); onDone(); }
    catch (e) { setErr(friendlyError(e.message)); }
    setLoading(false);
  };

  const EyeBtn = () => (
    <button onClick={() => setShowPw(v => !v)}
      style={{ background: "none", border: "none", cursor: "pointer", color: C.muted,
               fontSize: 16, padding: 0, lineHeight: 1, fontFamily: "inherit" }}>
      {showPw ? "🙈" : "👁"}
    </button>
  );

  return (
    <Shell key="reset">
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 10, letterSpacing: 3,
                    color: C.cyan, textTransform: "uppercase", marginBottom: 8 }}>
        Νέος κωδικός
      </div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 30, fontWeight: 700,
                    color: C.white, lineHeight: 1.15, marginBottom: 10 }}>
        Ορισμός νέου<br />κωδικού
      </div>
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 24 }}>
        Επίλεξε έναν δυνατό κωδικό. Τουλάχιστον 8 χαρακτήρες.
      </div>

      <div style={{ height: 1, background: C.border, marginBottom: 22 }} />

      {/* Password field */}
      <div style={{ marginBottom: 16 }}>
        <Label>Νέο συνθηματικό</Label>
        <GlassInput
          type={showPw ? "text" : "password"}
          placeholder="Minimum 8 χαρακτήρες"
          value={pw}
          onChange={e => { setPw(e.target.value); setErr(""); }}
          suffix={<EyeBtn />}
        />

        {/* Strength bar */}
        {pw && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
              <div className="ua-strength-bar"
                style={{ height: "100%", borderRadius: 2,
                         width: `${strength.score}%`, background: strength.color }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: 1, fontWeight: 600, color: strength.color }}>
                {strength.label}
              </span>
              {pw.length < 8 && (
                <span style={{ fontSize: 11, color: C.muted }}>Τουλάχιστον 8 χαρακτήρες</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirm field */}
      <div style={{ marginBottom: 6 }}>
        <Label>Επιβεβαίωση</Label>
        <GlassInput
          type={showPw ? "text" : "password"}
          placeholder="Επανάλαβε τον κωδικό"
          value={confirmPw}
          onChange={e => { setConfirmPw(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && handle()}
        />
        {/* Match indicator */}
        {confirmPw.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: pwMatch ? C.green : C.red,
                        display: "flex", alignItems: "center", gap: 5 }}>
            <span>{pwMatch ? "✓" : "✗"}</span>
            {pwMatch ? "Οι κωδικοί ταιριάζουν" : "Οι κωδικοί δεν ταιριάζουν"}
          </div>
        )}
        <ErrorMsg msg={err} />
      </div>

      <PrimaryBtn
        label="ΑΛΛΑΓΗ ΚΩΔΙΚΟΥ"
        onClick={handle}
        loading={loading}
        disabled={!pwValid || !pwMatch}
        style={{ marginTop: 18 }}
      />
    </Shell>
  );
};

// ─── Step: Done ───────────────────────────────────────────────────────────────
const StepDone = () => (
  <Shell key="done">
    <div style={{ width: 64, height: 64, borderRadius: "50%", border: `1.5px solid rgba(22,163,74,.4)`,
                  background: "rgba(22,163,74,.08)", display: "flex", alignItems: "center",
                  justifyContent: "center", marginBottom: 20,
                  animation: "ua-success .6s cubic-bezier(.22,1,.36,1) both" }}>
      <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 28, fontWeight: 700,
                     color: "#16a34a" }}>✓</span>
    </div>

    <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 30, fontWeight: 700,
                  color: C.white, lineHeight: 1.15, marginBottom: 10 }}>
      Ο κωδικός<br />άλλαξε!
    </div>
    <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65, marginBottom: 24 }}>
      Μπορείς τώρα να συνδεθείς με τον νέο σου κωδικό.
    </div>

    <div style={{ height: 1, background: C.border, marginBottom: 22 }} />

    <a href="/"
      style={{ display: "block", height: 52, borderRadius: 12, lineHeight: "52px", textAlign: "center",
               textDecoration: "none", color: C.white, fontFamily: "'Oswald', sans-serif",
               fontSize: 15, fontWeight: 600, letterSpacing: 2,
               background: `linear-gradient(135deg,${C.cyan},${C.pink})`,
               boxShadow: `0 4px 24px rgba(0,201,225,.2)` }}>
      ΣΥΝΔΕΣΗ ΤΩΡΑ
    </a>

    <a href="/trainer" className="ua-back"
      style={{ display: "block", textAlign: "center", marginTop: 14, color: C.muted,
               fontSize: 13, textDecoration: "none" }}>
      Trainer; Σύνδεση εδώ →
    </a>
  </Shell>
);

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function ResetPassword() {
  const [accessToken, setAccessToken] = useState(null);
  const [step,        setStep]        = useState("checking");
  const [sentEmail,   setSentEmail]   = useState("");

  useEffect(() => {
    const hash   = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const token  = params.get("access_token");
    const type   = params.get("type");
    if (token && type === "recovery") { setAccessToken(token); setStep("reset"); }
    else setStep("request");
  }, []);

  if (step === "checking") return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center",
                  justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: `3px solid rgba(255,255,255,.08)`,
                    borderTopColor: C.cyan, animation: "ua-spin .8s linear infinite" }} />
    </div>
  );

  if (step === "request") return <StepRequest onSent={(e) => { setSentEmail(e); setStep("sent"); }} />;
  if (step === "sent")    return <StepSent email={sentEmail} />;
  if (step === "reset")   return <StepReset accessToken={accessToken} onDone={() => setStep("done")} />;
  return <StepDone />;
}
