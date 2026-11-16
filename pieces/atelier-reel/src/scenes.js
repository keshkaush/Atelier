
// =====================================================================
//  SCENES — one function per voice line id (SCENES below). World = screen, 1080x1920. Each scene draws, in order:
//  a full-bleed world, 3+ details of background life, the main prop(s) cued on spoken words (VW), the mascot
//  in a scene-specific hat, the sign, (optional) the terminal bar, and the caption chips (prChips).
//  Sound cues live in SFX_CUES() at the bottom (static, computed from VOICE) — src/score.js plays them.
// =====================================================================
CLAWD_SCALE = 1.12;
const CLAWD_X = 880, CLAWD_Y = 1640;
CHIP_MAX = 2;            // two words per scrap: never wraps to a second row inside the phone's bottom UI
const SCENES = {};

// ---- local helpers (prefixed ar so nothing collides with kit/core.js short names)
function arWrap(str, maxW, size, o = {}) {
  const words = str.split(' '), out = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (txtW(t, size, o) > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
// one of the five desks: monitor, top, legs, chair. (cx, y) = the desk surface under the monitor
function arDesk(cx, y, s, key) {
  withT(cx, y, 0, s, () => {
    pp(pR(-56, -96, 112, 76, 5), PR.char, { key: key + 'm', sb: 9, sy: 4, tex: 0.4 });
    pp(pR(-46, -86, 68, 8, 2), PR.green, { key: key + 'g', shadow: false, tex: 0.2 });
    pp(pR(-46, -72, 42, 8, 2), PR.mustard, { key: key + 'y', shadow: false, tex: 0.2 });
    pp(pR(-8, -20, 16, 20, 2), PR.char, { key: key + 'n', shadow: false });
    pp(pR(-104, -4, 208, 20, 4), PR.creamL, { key: key + 't', sb: 13, sy: 6 });
    pp(pR(-92, 16, 14, 100, 3), PR.woodD, { key: key + 'l1', sb: 8, sy: 4 });
    pp(pR(78, 16, 14, 100, 3), PR.woodD, { key: key + 'l2', sb: 8, sy: 4 });
    pp(pR(-46, 74, 92, 12, 4), PR.brown, { key: key + 'c', sb: 8, sy: 4 });
  });
}
// the approval card: one plain-English summary, and the two buttons that are the whole safety model
function arChangeCard(x, y, t) {
  if (TT < t) return;
  withT(x, y, 0, popS(t), () => {
    pp(pR(-300, -198, 600, 396, 14), PR.paperW, { key: 'chg', sb: 24, sy: 12 });
    pp(pR(-300, -198, 600, 72, 14), PR.char, { key: 'chgh', shadow: false, tex: 0.35 });
    sparkIcon(-254, -164, 15);
    txt('ONE PROPOSED CHANGE', -226, -154, 25, PR.creamL, { weight: 800 });
    txt('src/index.css · 3 edits', -252, -96, 24, PR.greyD, { weight: 700, font: F_MONO });
    let yy = -44;
    for (const ln of arWrap('Centre the wordmark in the top bar.', 500, 32)) { txt(ln, -252, yy, 32, PR.ink, { weight: 700 }); yy += 42; }
    pp(pR(-252, yy + 14, 504, 2, 0), 'rgba(24,27,36,0.18)', { key: 'chgr', shadow: false, tex: false });
    pp(pR(-252, yy + 44, 244, 64, 11), PR.green, { key: 'bapply', sb: 9, sy: 5 });
    txt('Apply', -130, yy + 86, 31, PR.creamL, { align: 'center', weight: 800 });
    pp(pR(8, yy + 44, 244, 64, 11), PR.cream, { key: 'bnot', sb: 9, sy: 5, rim: 'rgba(24,27,36,0.22)' });
    txt('Not yet', 130, yy + 86, 31, PR.ink, { align: 'center', weight: 800 });
  });
}
// a page whose bottom edge tears itself open at t (the honest-catch beat)
function arTornPage(x, y, w, h, t, key) {
  pp(pR(x, y, w, h, 3), PR.creamL, { key, sb: 16, sy: 8 });
  if (TT < t) return;
  const R = RNG('torn', key), n = 13, seg = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = x + i * seg, dep = R.r(0.35, 1) * 22;
    pp(pG([[x0, y + h - 3], [x0 + seg, y + h - 3], [x0 + seg * R.r(0.2, 0.8), y + h + dep]]), i % 2 ? '#e2ddcf' : '#d8d2c2', { key: key + 't' + i, sb: 6, sy: 3, tex: 0.5 });
  }
  const u = clamp((TT - t) / 1.1);
  for (let i = 0; i < 5; i++) {
    const fx = x + 46 + i * 88 + Math.sin(u * 3 + i) * 14, fy = y + h + 26 + u * 110 + i * 9;
    withT(fx, fy, u * 2 + i, 1, () => pp(pG([[-9, -6], [10, -9], [7, 7], [-8, 9]]), '#efeade', { key: key + 'fl' + i, sb: 5, sy: 3, tex: 0.4 }));
  }
}
// the repo folder: green paper folder, spark on the tab, name across the front
function arRepoFolder(x, y, s, key) {
  withT(x, y, -0.025, s, () => {
    pp(pR(-104, -92, 86, 34, 6), PR.green, { key: key + 't', sb: 6, sy: 3, tex: 0.5 });
    pp(pR(-110, -70, 220, 152, 8), PR.green, { key, sb: 13, sy: 7, tex: 0.55, rim: 'rgba(255,255,255,0.28)' });
    pp(pR(-94, -56, 188, 44, 5), 'rgba(255,255,255,0.18)', { key: key + 'i', shadow: false, tex: 0.3 });
    pp(pR(-94, 2, 188, 56, 5), 'rgba(0,0,0,0.15)', { key: key + 'i2', shadow: false, tex: 0.3 });
    txt('Atelier', 0, -24, 42, PR.creamL, { align: 'center', weight: 800 });
    txt('public repo', 0, 40, 26, 'rgba(244,241,232,0.9)', { align: 'center', weight: 700 });
  });
}

// ---------------------------------------------------------------------
SCENES.hook = () => {   // an open-plan studio at night: five lamps come up over five desks, then a rope drops
  const t0 = E0, wAsk = VW('hook', 'ask').t0;
  prWall(PR.slate, { streak: 640, gap: 172 });
  prFloor(1032, PR.floor, { studs: true });
  const XS = [130, 320, 510, 700, 890];
  XS.forEach((x, i) => {                              // pendant lamps over the five desks
    const lit = ev(t0 + 0.18 + i * 0.17, 0.4);
    pp(pR(x - 3, -40, 6, 384, 2), PR.ink, { key: 'cord' + i, shadow: false, tex: 0.3 });
    if (lit > 0) pp(pG([[x - 46, 430], [x + 46, 430], [x + 140, 1032], [x - 140, 1032]]), `rgba(255,237,190,${0.2 * lit})`, { key: 'cone' + i, shadow: false, tex: false });
    pp(pR(x - 8, 334, 16, 28, 4), PR.woodD, { key: 'neck' + i, sb: 4, sy: 2, tex: 0.3 });
    pp(pG([[x - 46, 358], [x + 46, 358], [x + 74, 426], [x - 74, 426]]), PR.mustard, { key: 'shade' + i, sb: 10, sy: 5, tex: 0.45 });
    pp(pE(x, 438, 14, 12), '#fff3cf', { key: 'bulb' + i, shadow: false, tex: false });
  });
  XS.forEach((x, i) => arDesk(x, 955, 0.78, 'dk' + i));
  prClock(946, 512, 68, 10, 2 + TT * 4, 'clk1');
  prCorkboard(806, 620, 176, 122, 'cb1');
  prNote(852, 664, 92, 80, '#f3e3a5', 0.07, 'cn1');
  prNote(922, 690, 78, 70, '#a9cbe0', -0.05, 'cn2');
  // the barrier: two posts, and a rope that drops into place on "ask"
  const rp = popS(wAsk);
  for (const px of [62, 986]) {
    pp(pR(px - 14, 1246, 28, 160, 7), PR.woodD, { key: 'post' + px, sb: 12, sy: 6 });
    pp(pE(px, 1238, 25, 12), PR.mustard, { key: 'knob' + px, sb: 6, sy: 3 });
  }
  if (rp > 0.01) {
    ctx.save(); ctx.globalAlpha = rp; ctx.lineCap = 'round'; ctx.strokeStyle = PR.red; ctx.lineWidth = 26;
    ctx.shadowColor = 'rgba(12,10,8,0.34)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
    ctx.beginPath(); ctx.moveTo(62, 1258); ctx.quadraticCurveTo(540, 1258 + 130 - 44 * rp, 986, 1258); ctx.stroke();
    ctx.restore();
  }
  clawd(CLAWD_X, CLAWD_Y, { hat: 'guard', key: 'c1', look: -14, mood: TT > wAsk + 0.3 ? 'happy' : 'neutral' });
  prSign('MEET ATELIER', { kicker: 'AN AGENTIC DESIGN STUDIO' });
  prChips();
};

SCENES.folders = () => {   // a desk at night: a folder lands on the screen, then the real file tree types itself
  const t0 = E0, wFolder = VW('folders', 'folder').t0, wRead = VW('folders', 'reads').t0;
  prWall('#2b3b5e', { panel: 'rgba(255,255,255,0.045)', streak: 320, gap: 140 });
  prBunting(-14, [PR.mustard, PR.cream, PR.red, PR.teal], 'bun2');
  prFloor(1304, PR.woodD, { trim: true });
  // the desk the laptop sits on
  pp(pR(-40, 984, W + 80, 26, 0), PR.woodL, { key: 'dtop', sb: 16, sy: 8 });
  pp(pR(88, 1010, 26, 294, 4), PR.woodD, { key: 'dleg1', sb: 10, sy: 5 });
  pp(pR(966, 1010, 26, 294, 4), PR.woodD, { key: 'dleg2', sb: 10, sy: 5 });
  // the laptop
  pp(pR(240, 646, 528, 338, 12), PR.char, { key: 'lid', sb: 22, sy: 11 });
  pp(pR(258, 664, 492, 302, 5), '#101c33', { key: 'scr', shadow: false, tex: 0.4 });
  pp(pG([[200, 984], [808, 984], [854, 1006], [154, 1006]]), PR.creamL, { key: 'base', sb: 18, sy: 9 });
  pp(pR(492, 990, 24, 8, 3), PR.grey, { key: 'notch', shadow: false });
  const files = ['src/', '  App.tsx', '  views/', 'server/', '  index.mjs', 'README.md'];
  files.forEach((f, i) => {
    const on = ev(wRead + i * 0.1, 0.18);
    if (on <= 0) return;
    txt(f, 286, 714 + i * 42, 25, i % 2 ? 'rgba(158,203,235,0.92)' : PR.creamL, { weight: 600, font: F_MONO, frac: on });
    if (on >= 1) pp(pR(694, 696 + i * 42, 18, 18, 4), PR.green, { key: 'ft' + i, shadow: false, tex: 0.2 });
  });
  withT(570, 844, 0.03, 0.88 * popS(wFolder), () => {   // the folder you point it at
    pp(pR(-118, -84, 236, 158, 9), PR.mustard, { key: 'fold', sb: 14, sy: 7, tex: 0.55, rim: 'rgba(255,255,255,0.28)' });
    pp(pR(-104, -104, 104, 34, 6), PR.mustard, { key: 'foldt', sb: 7, sy: 3, tex: 0.5 });
    txt('my-app', 0, 16, 34, PR.ink, { align: 'center', weight: 800 });
  });
  // desk life: mug, books, notes
  pp(pR(80, 892, 74, 92, 8), PR.creamL, { key: 'mug', sb: 12, sy: 6 });
  pp(pE(160, 936, 22, 26), PR.creamL, { key: 'mugr', shadow: false, tex: 0.5 });
  pp(pR(86, 900, 62, 16, 4), PR.red, { key: 'mugb', shadow: false, tex: 0.3 });
  for (let i = 0; i < 3; i++) pp(pR(862 - i * 6, 946 - i * 26, 158, 24, 3), [PR.red, PR.teal, PR.mustard][i], { key: 'bk' + i, sb: 7, sy: 4 });
  prClock(946, 404, 66, 11, 26 + TT * 3, 'clk2');
  prNote(792, 560, 104, 92, '#f3e3a5', -0.06, 'fn1');
  prNote(908, 596, 88, 80, '#a9cbe0', 0.05, 'fn2');
  clawd(CLAWD_X, CLAWD_Y, { hat: 'ranger', key: 'c2', look: -16, mood: TT > wRead + 0.4 ? 'happy' : 'neutral' });
  prSign('IT READS YOUR CODE', { kicker: 'REAL FILES, REAL CODE' });
  prTerm('attach ~/Projects/my-app', ev(t0 + 0.12, 1.5), { size: 30 });
  prChips();
};

SCENES.desks = () => {   // five station plates on a rail tick off left to right, then one change card lands
  const t0 = E0, wPass = VW('desks', 'takes').t0, wOne = VW('desks', 'one').t0;
  prWall(PR.plum, { panel: 'rgba(0,0,0,0.10)', gap: 128, streak: 400 });
  prBunting(16, [PR.mustard, PR.cream, PR.teal, PR.red], 'bun3');
  prFloor(1420, PR.floorD, { trim: false });
  pp(pR(56, 528, 960, 16, 8), PR.woodD, { key: 'rail', sb: 12, sy: 6 });
  const ST = [['UX', 'RESEARCH'], ['UX', 'DESIGN'], ['UI', 'DESIGN'], ['CONTENT', ''], ['DESIGN', 'OPS']];
  for (let i = 0; i < 5; i++) {
    const x = 128 + i * 168;
    pp(pR(x - 62, 386, 124, 148, 9), PR.creamL, { key: 'st' + i, sb: 12, sy: 6, tex: 0.5, rim: 'rgba(255,255,255,0.3)' });
    txt(ST[i][0], x, 462, 20, PR.navy, { align: 'center', weight: 800 });
    if (ST[i][1]) txt(ST[i][1], x, 490, 20, PR.navy, { align: 'center', weight: 800 });
    prCheck(x, 606, wPass + 0.06 + i * 0.14, 30);
  }
  prClock(944, 470, 72, 9, 12 + TT * 5, 'clk3');
  // studio life on the floor beside the card: a mug and a stack of books
  pp(pR(72, 1300, 66, 88, 7), PR.creamL, { key: 'dmug', sb: 12, sy: 6 });
  pp(pE(146, 1344, 20, 24), PR.creamL, { key: 'dmugr', shadow: false, tex: 0.5 });
  for (let i = 0; i < 3; i++) pp(pR(190 + i * 7, 1362 - i * 26, 150, 24, 3), [PR.red, PR.teal, PR.mustard][i], { key: 'db' + i, sb: 7, sy: 4 });
  arChangeCard(360, 880, wOne - 0.05);
  clawd(CLAWD_X, CLAWD_Y, { hat: 'mortar', key: 'c3', look: -14, mood: TT > wOne ? 'wow' : 'neutral' });
  prSign('FIVE PASSES, ONE CHANGE', { kicker: 'ONE SPECIALIST PER DESK' });
  prChips();
};

SCENES.design = () => {   // a designer's wall: a poster, swatches, and a chat bubble that gets crossed out
  const t0 = E0, wChat = VW('design', 'chat').t0;
  prWall('#c9b28a', { panel: 'rgba(0,0,0,0.045)', streak: 520, gap: 160 });
  prFloor(1262, PR.wood, { trim: false });
  pp(pR(70, 548, 500, 700, 6), PR.creamL, { key: 'poster', sb: 22, sy: 11 });
  pp(pR(96, 574, 448, 648, 2), PR.paperW, { key: 'posterin', shadow: false, tex: 0.5 });
  txt('Aa', 132, 830, 210, PR.navy, { font: F_CHIP, weight: 700 });
  pp(pR(132, 866, 376, 3, 0), PR.navy, { key: 'pr1', shadow: false, tex: false });
  txt('PAPER · INK · ULTRAMARINE', 132, 918, 21, PR.navy, { weight: 800, track: 1 });
  const sw = ['#e9e5da', '#181b24', '#3f6fb0', '#d67555'];
  sw.forEach((c, i) => pp(pR(132 + i * 96, 966, 78, 78, 5), c, { key: 'sw' + i, sb: 8, sy: 4, tex: 0.35 }));
  for (let i = 0; i < 3; i++) pp(pR(132, 1092 + i * 34, 300 - i * 70, 6, 3), 'rgba(24,27,36,0.22)', { key: 'pl' + i, shadow: false, tex: false });
  pp(pR(60, 1248, 530, 18, 6), PR.woodD, { key: 'ledge1', sb: 10, sy: 5 });
  pp(pR(640, 1248, 210, 18, 6), PR.woodD, { key: 'ledge2', sb: 10, sy: 5 });
  pp(pR(690, 1108, 96, 142, 8), PR.navy, { key: 'jar', sb: 10, sy: 5 });
  for (let i = 0; i < 3; i++) pp(pR(702 + i * 24, 1046, 12, 74, 4), [PR.mustard, PR.red, PR.teal][i], { key: 'pen' + i, sb: 5, sy: 3 });
  withT(742, 660, 0.02, popS(t0 + 0.1), () => {          // the chat box everybody else ships
    pp(pR(-146, -74, 292, 148, 26), '#b9b4a8', { key: 'bub', sb: 14, sy: 7 });
    pp(pG([[-96, 66], [-60, 66], [-88, 108]]), '#b9b4a8', { key: 'bubt', sb: 8, sy: 4 });
    for (let i = 0; i < 3; i++) pp(pE(-46 + i * 46, -2, 12, 12), '#6f6b62', { key: 'dot' + i, shadow: false });
  });
  prCross(742, 660, wChat, 92);
  prClock(952, 942, 66, 4, 18 + TT * 4, 'clk4');
  prNote(628, 916, 112, 96, '#f3e3a5', 0.08, 'dn1');
  prNote(770, 962, 96, 84, '#a9cbe0', -0.07, 'dn2');
  clawd(CLAWD_X, CLAWD_Y, { hat: 'beret', key: 'c4', look: -18, mood: TT > wChat ? 'happy' : 'neutral' });
  prSign('NOT ANOTHER CHATBOX', { kicker: 'BUILT LIKE A STUDIO' });
  prChips();
};

SCENES.catch = () => {   // dusk: a page on the ground tears open along its bottom edge on "rough"
  const t0 = E0, wRough = VW('catch', 'rough').t0;
  pp(pR(-40, -40, W + 80, 1160, 0), '#4a4566', { key: 'sky', shadow: false, tex: 0.7 });
  pp(pG([[-40, 1200], [230, 980], [470, 1120], [740, 940], [1120, 1160], [1120, 1330], [-40, 1330]]), '#3b3855', { key: 'hills', sb: 16, sy: -4 });
  pp(pR(-40, 1266, W + 80, 700, 0), PR.char, { key: 'ground', sy: -6, sb: 16, tex: 0.6 });
  prStar(120, 372, 16); prStar(380, 344, 11, PR.cream); prStar(800, 334, 13);
  pp(pE(940, 412, 62, 62), PR.creamL, { key: 'moon', sb: 20, sy: 0 });
  pp(pE(914, 390, 52, 52), '#4a4566', { key: 'moonc', shadow: false, tex: 0.5 });
  pp(pR(618, 700, 18, 570, 4), PR.ink, { key: 'lp', sb: 10, sy: 5 });
  pp(pR(560, 664, 134, 46, 10), PR.char, { key: 'lh', sb: 10, sy: 5 });
  pp(pG([[576, 706], [678, 706], [712, 806], [542, 806]]), 'rgba(255,236,180,0.10)', { key: 'lc', shadow: false, tex: false });
  for (let i = 0; i < 5; i++) { const gx = 60 + i * 52; pp(pG([[gx, 1298], [gx + 10, 1238], [gx + 20, 1298]]), '#4e6a4a', { key: 'gr' + i, sb: 5, sy: 2 }); }
  withT(330, 1010, -0.035, popS(t0 + 0.1), () => {
    arTornPage(-230, -260, 460, 520, wRough, 'page');
    for (let i = 0; i < 4; i++) pp(pR(-186, -180 + i * 62, 340 - i * 54, 7, 3), 'rgba(24,27,36,0.20)', { key: 'tl' + i, shadow: false, tex: false });
    txt('personal project', -186, 40, 30, PR.ink, { weight: 700, font: F_CHALK });
  });
  prClock(470, 470, 60, 6, 40 + TT * 3, 'clk5');
  clawd(CLAWD_X, CLAWD_Y, { hat: 'cap', key: 'c5', look: -12, mood: 'flat' });
  prSign('THE CATCH', { kicker: 'SIDE PROJECT, NOT ENTERPRISE' });
  prChips();
};

SCENES.free = () => {   // the receipt that adds to nothing, stamped FREE, beside the laptop it runs on
  const t0 = E0, wNothing = VW('free', 'nothing').t0;
  prWall(PR.teal, { panel: 'rgba(255,255,255,0.06)', streak: 380, gap: 150 });
  prBunting(-8, [PR.mustard, PR.cream, PR.red, PR.navy], 'bun5');
  prClock(940, 452, 72, 3, 36 + TT * 6, 'clk6');
  // the counter the laptop sits on
  pp(pR(-40, 1116, W + 80, 26, 0), PR.woodL, { key: 'ctop', sb: 14, sy: 7 });
  pp(pR(-40, 1142, W + 80, 300, 0), PR.woodD, { key: 'cfront', sb: 10, sy: 4, tex: 0.6 });
  // the laptop
  pp(pR(600, 930, 236, 156, 8), PR.char, { key: 'lpl', sb: 16, sy: 8 });
  pp(pR(614, 944, 208, 128, 3), '#10203a', { key: 'lps', shadow: false, tex: 0.4 });
  pp(pR(634, 972, 70, 7, 2), PR.green, { key: 'lpg', shadow: false });
  pp(pR(634, 988, 108, 7, 2), 'rgba(244,241,232,0.7)', { key: 'lpw', shadow: false });
  pp(pG([[574, 1086], [862, 1086], [894, 1116], [542, 1116]]), PR.creamL, { key: 'lpb', sb: 14, sy: 7 });
  // desk life: mug, pencils
  pp(pR(556, 1034, 62, 82, 7), PR.creamL, { key: 'fmug', sb: 11, sy: 5 });
  pp(pE(624, 1074, 19, 22), PR.creamL, { key: 'fmugr', shadow: false, tex: 0.5 });
  pp(pR(560, 1040, 52, 14, 3), PR.red, { key: 'fmugb', shadow: false, tex: 0.3 });
  for (let i = 0; i < 4; i++) pp(pR(56 + i * 26, 1050, 20, 66, 3), [PR.red, PR.creamL, PR.blue, PR.mustard][i], { key: 'fb' + i, sb: 6, sy: 3 });
  withT(300, 800, 0.05, 1.02 * popS(t0 + 0.08), () => {
    prReceipt(0, 0, [['API keys', '0'], ['credits', '0'], ['plan', '0']], '$0.00');
  });
  prStamp('FREE', 486, 1188, PR.green, wNothing - 0.06, { rot: -0.09, size: 96 });
  clawd(CLAWD_X, CLAWD_Y, { hat: 'boater', key: 'c6', look: -14, mood: TT > wNothing ? 'happy' : 'neutral' });
  prSign('RUNS LOCALLY, COSTS ZERO', { kicker: 'YOUR MACHINE, NO ACCOUNT' });
  prChips();
};

SCENES.cta = () => {   // a comment box types the keyword; the repo folder pops with confetti
  const t0 = E0, wc = VW('cta', 'comment').t0, wk = VW('cta', 'STUDIO').t0;
  prWall('#c79a5b', { panel: 'rgba(0,0,0,0.05)', streak: 560, gap: 180 });
  prBunting(-6, [PR.cream, PR.red, PR.teal, PR.mustard], 'bun7');
  prFloor(1352, PR.woodD, { trim: false });
  // studio wall: a shelf of books and a plant, two pinned sketches
  pp(pR(560, 620, 340, 16, 4), PR.woodD, { key: 'cshelf', sb: 10, sy: 5 });
  for (let i = 0; i < 5; i++) pp(pR(576 + i * 34, 548 - (i % 2) * 8, 28, 72 + (i % 2) * 8, 3), [PR.navy, PR.red, PR.teal, PR.mustard, PR.creamL][i], { key: 'csh' + i, sb: 6, sy: 3 });
  pp(pR(756, 552, 84, 68, 6), PR.clawdD, { key: 'cplant', sb: 8, sy: 4 });
  for (let i = 0; i < 4; i++) pp(pE(764 + i * 20, 536 - Math.abs(i - 1.5) * 8, 26, 40), '#4e6a4a', { key: 'clf' + i, sb: 6, sy: 3, tex: 0.5 });
  for (let i = 0; i < 2; i++) {
    pp(pR(72, 470 + i * 176, 190, 148, 4), PR.creamL, { key: 'cfr' + i, sb: 12, sy: 6 });
    pp(pR(88, 486 + i * 176, 158, 116, 2), i ? '#a9cbe0' : PR.paperW, { key: 'cfi' + i, shadow: false, tex: 0.4 });
    for (let j = 0; j < 3; j++) pp(pR(104, 512 + i * 176 + j * 26, 110 - j * 26, 5, 2), 'rgba(24,27,36,0.25)', { key: 'cfl' + i + j, shadow: false, tex: false });
  }
  prCommentBox(430, 862, 'STUDIO', wc + 0.12, { s: popS(t0 + 0.05) });
  arRepoFolder(360, 1176, 1.55 * popS(wk - 0.02), 'repof');
  prBurst(360, 1060, wk, { n: 28, life: 1.5 });
  clawd(CLAWD_X, CLAWD_Y, { hat: 'phones', key: 'c7', look: -16, mood: TT > wk ? 'happy' : 'neutral' });
  prSign('COMMENT STUDIO', { kicker: 'OPEN ON GITHUB' });
  prChips();
};

// =====================================================================
//  SHOTS + TIMELINE — one shot per line (in script order); SPLITS = [[lineId, word, n, sceneKey]] cut again on a word
// =====================================================================
const SPLITS = [];
// sound cues: 'type' (n clicks over d s), 'tick', 'pop', 'thud' (stamp), 'chime'. Static: computed from VOICE, never during a frame.
function SFX_CUES() {
  const lastT = (id) => VL(id).words[VL(id).words.length - 1].t0;
  const c = [];
  for (let i = 0; i < 5; i++) c.push({ k: 'tick', t: CUT('hook') + 0.18 + i * 0.17 });
  c.push({ k: 'pop', t: VW('hook', 'ask').t0 });
  c.push({ k: 'pop', t: VW('folders', 'folder').t0 });
  c.push({ k: 'type', t: VW('folders', 'reads').t0, n: 12, d: 0.55 });
  for (let i = 0; i < 5; i++) c.push({ k: 'tick', t: VW('desks', 'takes').t0 + 0.06 + i * 0.14 });
  c.push({ k: 'thud', t: VW('desks', 'one').t0 - 0.05 });
  c.push({ k: 'pop', t: VW('design', 'chat').t0 });
  c.push({ k: 'pop', t: VW('catch', 'rough').t0 });
  c.push({ k: 'thud', t: VW('free', 'nothing').t0 - 0.06 });
  c.push({ k: 'type', t: VW('cta', 'comment').t0 + 0.15, n: 6, d: 0.45 }, { k: 'chime', t: lastT('cta') });
  return c;
}
const SHOT_LIST = VOICE.lines.map((l, i) => [i === 0 ? 0 : CUT(l.id), l.id])
  .concat(SPLITS.map(([id, w, n, key]) => [VW(id, w, n).t0 - 0.08, key])).sort((a, b) => a[0] - b[0]);
const ERA_LIST = SHOT_LIST.map(([t0, sc], i) => [t0, i + 1 < SHOT_LIST.length ? SHOT_LIST[i + 1][0] : DURATION, () => SCENES[sc]()]);
const TIMELINE = {
  width: W, height: H, fps: FPS, duration: DURATION, frames: NFRAMES, loop: LOOP_T, safe: SAFE, format: 'voice-cut',
  shots: SHOT_LIST.map(([t0, sc], i) => ({ id: i + 1, key: sc, era: i, t0, t1: ERA_LIST[i][1], title: sc })),
  cuts: SHOT_LIST.slice(1).map(([t0]) => t0), morphs: [], cues: {},
  acts: [{ name: 'reel', role: 'journey', t0: 0, t1: DURATION }],
  board: SHOT_LIST.map(([t0, sc], i) => ({ t: (t0 + ERA_LIST[i][1]) / 2 + 0.3, title: sc, sound: '', next: 'cut' })),
  narration: VOICE.lines.map((l) => ({ t0: l.t0, t1: l.t1, text: l.text })),
};
window.TIMELINE = TIMELINE;
