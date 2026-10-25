// One-off light-theme converter used to move the dark screens onto the Realm Builder palette.
// Kept so another agent can re-run it on newly added dark screens: node -e "..." or paste into a script.
const BG = "linear-gradient(180deg,rgba(255,251,240,0.5) 0%,rgba(255,251,240,0.72) 45%,rgba(246,236,212,0.9) 100%),url('aegis/05_floating_sky_citadel_4k.jpg') center/cover fixed,#EADFC4";
const muted = (a) => Math.min(1, +(a * 0.55 + 0.42).toFixed(2));
function theme(s, canvasSafe) {
  s = s.replace(/html,body\{margin:0;background:#(0A0C12|10131B);color:#F4F7FC/, 'html,body{margin:0;background:' + BG + ';color:#1C2830');
  s = s.replace(/a\{color:#8DEBFF;text-decoration:none\}a:hover\{color:#fff\}/i, 'a{color:#2A6A98;text-decoration:none}a:hover{color:#1C2830}');
  const h = s.indexOf('</helmet>');
  if (h > 0) s = s.slice(0, h) + s.slice(h).replace(/background:#(0A0C12|10131B)/i, 'background:transparent');
  s = s.replace(/border:1px solid rgba\(244,247,252,0?\.(0\d|1\d?|2)\)/g, 'border:1px solid rgba(201,164,92,0.55)');
  s = s.replace(/rgba\(244,\s*247,\s*252,\s*([\d.]+)\)/g, (m, a) => `rgba(28,40,48,${a})`);
  s = s.replace(/rgba\(232,\s*237,\s*245,\s*([\d.]+)\)/g, (m, a) => `rgba(28,40,48,${muted(+a)})`);
  s = s.replace(/rgba\(200,\s*212,\s*228,\s*([\d.]+)\)/g, (m, a) => (+a < 0.3 ? `rgba(28,40,48,${a})` : `rgba(28,40,48,${muted(+a)})`));
  s = s.replace(/rgba\(22,\s*26,\s*36,\s*([\d.]+)\)/g, (m, a) => `rgba(255,251,240,${Math.max(+a, 0.92)})`);
  s = s.replace(/rgba\((10,\s*12,\s*18|16,\s*19,\s*27|5,\s*6,\s*10),\s*([\d.]+)\)/g, (m, _, a) => `rgba(255,251,240,${a})`);
  s = s.replace(/rgba\(141,\s*235,\s*255,\s*([\d.]+)\)/g, (m, a) => `rgba(42,106,152,${a})`);
  s = s.replace(/rgba\(255,\s*200,\s*107,\s*([\d.]+)\)/g, (m, a) => `rgba(192,138,46,${a})`);
  if (!canvasSafe) s = s.replace(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/g, (m, a) => `rgba(40,60,80,${(+a * 0.45).toFixed(2)})`);
  else s = s.replace(/box-shadow:([^;"]*)rgba\(0,0,0,([\d.]+)\)/g, (m, p, a) => `box-shadow:${p}rgba(40,60,80,${(+a * 0.45).toFixed(2)})`);
  s = s.replace(/#F4F7FC/gi, '#1C2830').replace(/#(0A0C12|10131B)/gi, '#FFFBF0').replace(/#(161A24|141821|161A23)/gi, '#FFFFFF').replace(/#8DEBFF/gi, '#2A6A98').replace(/#FFC86B/gi, '#B9822A').replace(/#FFC98A/gi, '#B9772F');
  s = s.replace(/oklch\(0\.78 0\.15 150\)/g, 'oklch(0.5 0.13 150)').replace(/oklch\(0\.83 0\.14 80\)/g, 'oklch(0.6 0.14 70)').replace(/oklch\(0\.7 0\.19 25\)/g, 'oklch(0.55 0.19 25)').replace(/oklch\(0\.75 0\.17 25\)/g, 'oklch(0.55 0.18 25)');
  s = s.replace('oklch(0.15 0.04 ${t.hue} / 0.75)', 'oklch(0.3 0.06 ${t.hue} / 0.72)').replace('oklch(0.18 0.04 ${x.hue} / 0.95)', 'oklch(0.3 0.06 ${x.hue} / 0.92)').replace('oklch(0.3 0.08 ${x.hue} / 0.35)', 'oklch(0.42 0.1 ${x.hue} / 0.45)');
  return s;
}
if (typeof module !== 'undefined') module.exports = { theme, BG };
