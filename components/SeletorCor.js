"use client";
import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const PADRAO_JMACEDO = "#4A90D9";
const TONS_LIGHTNESS = [14, 22, 30, 38, 46, 55, 65, 75, 85, 93];

// ---------- utilidades de cor ----------
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(255 * f(n)).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

function hexToHsl(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, sat = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    sat = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: hue = ((g - b) / d) % 6; break;
      case g: hue = (b - r) / d + 2; break;
      case b: hue = (r - g) / d + 4; break;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s: sat * 100, l: l * 100 };
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function escurecer(hex, quantidade = 0.3) {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.substring(0, 2), 16) * (1 - quantidade));
  const g = Math.round(parseInt(h.substring(2, 4), 16) * (1 - quantidade));
  const b = Math.round(parseInt(h.substring(4, 6), 16) * (1 - quantidade));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function aplicarAccent(accent, dark) {
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dark", dark || escurecer(accent));
  root.style.setProperty("--accent-soft", hexToRgba(accent, 0.12));
}

// ---------- componente ----------
export default function SeletorCor({ perfil, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [hue, setHue] = useState(207);
  const [sat, setSat] = useState(60);
  const [tomAtivo, setTomAtivo] = useState(null); // hex do tom escolhido, ou null se for o padrão
  const ref = useRef(null);
  const wheelRef = useRef(null);
  const arrastando = useRef(false);

  useEffect(() => {
    const atual = perfil?.cor_accent || PADRAO_JMACEDO;
    if (atual && atual !== PADRAO_JMACEDO) {
      const { h, s } = hexToHsl(atual);
      setHue(h);
      setSat(s);
      setTomAtivo(atual);
    } else {
      setTomAtivo(null);
    }
  }, [perfil?.cor_accent]);

  useEffect(() => {
    function fora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function posicaoParaHueSat(clientX, clientY) {
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const raioMax = rect.width / 2;
    const raio = Math.min(1, Math.sqrt(dx * dx + dy * dy) / raioMax);
    let ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    return { h: ang, s: Math.round(raio * 100) };
  }

  function onPointerDown(e) {
    arrastando.current = true;
    mover(e);
  }
  function onPointerMove(e) {
    if (!arrastando.current) return;
    mover(e);
  }
  function onPointerUp() {
    arrastando.current = false;
  }
  function mover(e) {
    const { h, s } = posicaoParaHueSat(e.clientX, e.clientY);
    setHue(h);
    setSat(s);
  }

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  function onKeyDownWheel(e) {
    const passo = 5;
    if (e.key === "ArrowLeft") { setHue((h) => (h - passo + 360) % 360); e.preventDefault(); }
    if (e.key === "ArrowRight") { setHue((h) => (h + passo) % 360); e.preventDefault(); }
    if (e.key === "ArrowUp") { setSat((s) => Math.min(100, s + passo)); e.preventDefault(); }
    if (e.key === "ArrowDown") { setSat((s) => Math.max(0, s - passo)); e.preventDefault(); }
  }

  async function aplicarEsalvar(hex) {
    aplicarAccent(hex);
    setTomAtivo(hex === PADRAO_JMACEDO ? null : hex);
    if (perfil?.id) {
      await supabase.from("perfis").update({ cor_accent: hex }).eq("id", perfil.id);
    }
    onChange?.(hex);
  }

  const corSelecionada = tomAtivo || PADRAO_JMACEDO;
  const marcadorAngRad = (hue * Math.PI) / 180;
  const marcadorRaioPct = sat / 2; // sat 0-100 -> raio 0-50% do wheel

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Cor do sistema"
        className="w-9 h-9 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink transition"
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
      >
        <Palette size={16} />
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-40 card p-5 w-80 shadow-2xl">
          <p className="font-display font-semibold text-[15px] mb-1">Cor do sistema</p>
          <p className="text-xs text-muted mb-4">Selecione uma família e uma tonalidade com contraste seguro.</p>

          <div className="flex gap-4 items-start">
            <div
              ref={wheelRef}
              onPointerDown={onPointerDown}
              onKeyDown={onKeyDownWheel}
              tabIndex={0}
              role="slider"
              aria-label="Círculo cromático"
              className="relative w-28 h-28 shrink-0 rounded-full cursor-pointer outline-none focus:ring-2"
              style={{
                background:
                  "radial-gradient(circle at center, white 0%, transparent 72%), " +
                  "conic-gradient(hsl(0,100%,50%) 0deg, hsl(60,100%,50%) 60deg, hsl(120,100%,50%) 120deg, hsl(180,100%,50%) 180deg, hsl(240,100%,50%) 240deg, hsl(300,100%,50%) 300deg, hsl(360,100%,50%) 360deg)",
                boxShadow: "0 0 0 1px var(--line)"
              }}
            >
              <div
                className="absolute w-3 h-3 rounded-full border-2 border-white shadow"
                style={{
                  background: hslToHex(hue, sat, 50),
                  left: `calc(50% + ${Math.sin(marcadorAngRad) * marcadorRaioPct}% - 6px)`,
                  top: `calc(50% - ${Math.cos(marcadorAngRad) * marcadorRaioPct}% - 6px)`
                }}
              />
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-xs font-medium text-ink mb-1">Círculo cromático</p>
              <p className="text-[11px] text-muted leading-snug">
                Arraste pelo disco para escolher qualquer cor e intensidade.
              </p>
              <p className="text-[11px] text-muted leading-snug mt-1">
                Esquerda/direita muda a cor; cima/baixo muda a intensidade.
              </p>
            </div>
          </div>

          <div className="flex gap-1.5 mt-4">
            {TONS_LIGHTNESS.map((l, i) => {
              const hex = hslToHex(hue, sat, l);
              const ativo = tomAtivo === hex;
              return (
                <button
                  key={i}
                  onClick={() => aplicarEsalvar(hex)}
                  title={`Tom ${i + 1}`}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono font-semibold transition"
                  style={{
                    background: hex,
                    color: l > 55 ? "#14181F" : "#FFFFFF",
                    outline: ativo ? "2px solid var(--ink)" : "none",
                    outlineOffset: "2px"
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => aplicarEsalvar(PADRAO_JMACEDO)}
            className="w-full flex items-center gap-3 mt-4 p-2.5 rounded-lg border transition"
            style={{
              borderColor: corSelecionada === PADRAO_JMACEDO ? "var(--accent)" : "var(--line)",
              background: corSelecionada === PADRAO_JMACEDO ? "var(--accent-soft)" : "transparent"
            }}
          >
            <span
              className="w-9 h-5 rounded-full shrink-0 relative"
              style={{ background: PADRAO_JMACEDO }}
            >
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow" />
            </span>
            <span className="text-left flex-1">
              <span className="block text-xs font-medium text-ink">Padrão J.Macedo</span>
              <span className="block text-[10.5px] text-muted">Logo cinza com escrita azul</span>
            </span>
            {corSelecionada === PADRAO_JMACEDO && <Check size={16} style={{ color: "var(--accent)" }} />}
          </button>
        </div>
      )}
    </div>
  );
}
