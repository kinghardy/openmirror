// Music library: pick songs for the Sonos from Apple Music's catalog (proxy.py /music/*). Opens over the Now Playing channel with Y, from the
// home screen, the player or the screensaver. One screen: filter chips, the search bar (always there), artwork to browse or the search results,
// and the queue along the bottom as a jukebox carousel with Now Playing above it (both shrink while typing). Songs fall into the queue when
// added and grey out in the grid. Start opens the menu: Party mode, Edit queue. Also feeds the screensaver (window.MusicSaver) in Party mode.
// A plays, X adds to the end of the queue, Y plays next, B goes back. (In Party mode A and X both add to the party queue.)
(() => {
  const overlay = document.getElementById('app-music');
  if (!overlay) return;
  const SEARCH_IDLE = 45e3, FOCUS_IDLE = 10e3;                          // nobody touching it: back to the main discovery page (the screensaver comes later)
  const css = document.createElement('style');
  css.textContent = `
#ml { position:absolute; inset:0; display:none; flex-direction:column; background:#07060d; color:#fff; z-index:5; overflow:hidden;
  font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; --ac:#ff5a8a; }
#ml.on { display:flex; }
#ml .bg { position:absolute; inset:-120px; background:var(--art) center/cover; filter:blur(90px) brightness(.38) saturate(1.7); transition:background-image .4s; }
#ml .shade { position:absolute; inset:0; background:linear-gradient(180deg,rgba(7,6,13,.5),rgba(7,6,13,.9)); }
#ml .in { position:relative; flex:1; display:flex; flex-direction:column; padding:52px 44px 24px; min-height:0; gap:20px; }
#ml .top { display:flex; align-items:center; gap:12px; flex:none; }
#ml .chip { flex:1; text-align:center; padding:18px 0; border-radius:40px; font-size:28px; font-weight:800; background:rgba(255,255,255,.09); border:2px solid rgba(255,255,255,.14); color:rgba(255,255,255,.75); white-space:nowrap; }
#ml .chip.cur { background:rgba(255,255,255,.22); color:#fff; }
#ml .chip.on { background:#fff; color:#12101c; border-color:#fff; box-shadow:0 0 0 8px color-mix(in srgb, var(--ac) 50%, transparent); }
#ml .sb { flex:none; display:flex; align-items:center; gap:20px; background:rgba(255,255,255,.12); border:2px solid rgba(255,255,255,.2); border-radius:34px; padding:0 26px 0 34px; height:100px; font-size:42px; font-weight:700; }
#ml .sb .gl { font-size:40px; opacity:.6; }
#ml .sb .tx { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .sb .tx.pl { color:rgba(255,255,255,.4); font-weight:600; }
#ml .sb i { width:4px; height:54px; background:var(--ac); animation:mlblink 1s steps(2) infinite; display:none; }
#ml .sb.typ i { display:block; }
#ml .sb .pp { font-size:24px; font-weight:800; letter-spacing:.1em; color:#fff; background:var(--ac); border-radius:24px; padding:8px 18px; white-space:nowrap; }
#ml .sb .mb { font-size:26px; font-weight:700; background:rgba(255,255,255,.16); border-radius:14px; padding:6px 16px; white-space:nowrap; }
#ml .sb.on { background:rgba(255,255,255,.2); border-color:#fff; box-shadow:0 0 0 8px color-mix(in srgb, var(--ac) 50%, transparent); }
@keyframes mlblink { 50% { opacity:0 } }
#ml .sg { flex:none; display:flex; gap:12px; overflow:hidden; margin:-4px 0 -6px; }
#ml .sgc { flex:none; max-width:430px; padding:14px 26px; border-radius:32px; font-size:28px; font-weight:700; background:rgba(255,255,255,.1); border:2px solid rgba(255,255,255,.16); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .sgc.ar2 { border-color:color-mix(in srgb, var(--ac) 70%, transparent); font-weight:800; }
#ml .sgc span { color:rgba(255,255,255,.55); font-weight:600; }
#ml .sgc.on { background:#fff; color:#12101c; border-color:#fff; box-shadow:0 0 0 7px color-mix(in srgb, var(--ac) 50%, transparent); }
#ml .sgc.on span { color:#555; }
#ml .lbl { flex:none; font-size:30px; font-weight:800; margin:-4px 0 -6px 8px; color:var(--ac); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-height:36px; }
#ml .lbl span { color:rgba(255,255,255,.55); }
#ml .con { flex:1; min-height:0; position:relative; overflow:hidden; scroll-behavior:smooth; border-radius:8px; }
#ml .shelf { padding:2px 0 8px; } #ml .sht { font-size:32px; font-weight:800; margin:8px 16px 2px; letter-spacing:-.3px; }
#ml .srow { display:flex; gap:16px; overflow:hidden; scroll-behavior:smooth; padding:10px 12px 14px; } #ml .srow .cd { flex:none; width:228px; }
#ml .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:26px 22px; padding:12px 12px 24px; }
#ml .grid.l { grid-template-columns:1fr; gap:12px; }
#ml .cd { position:relative; border-radius:26px; padding:10px; border:3px solid transparent; transition:transform .12s, background .12s; min-width:0; }
#ml .cd .ar { position:relative; width:100%; aspect-ratio:1; border-radius:20px; overflow:hidden; background:rgba(255,255,255,.1); box-shadow:0 12px 28px rgba(0,0,0,.5); }
#ml .cd .ar img { width:100%; height:100%; object-fit:cover; display:block; transition:filter .4s; }
#ml .cd .tt { margin-top:12px; font-size:27px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .cd .st { margin-top:2px; font-size:23px; font-weight:600; color:rgba(255,255,255,.58); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .cd .bd { position:absolute; left:14px; bottom:14px; font-size:20px; font-weight:800; letter-spacing:.1em; background:rgba(0,0,0,.6); border-radius:12px; padding:3px 12px; }
#ml .cd .rk { position:absolute; left:14px; top:12px; font-size:26px; font-weight:900; background:rgba(0,0,0,.6); border-radius:14px; padding:2px 12px; }
#ml .cd .inq { display:none; position:absolute; inset:0; align-items:center; justify-content:center; font-size:30px; font-weight:900; letter-spacing:.08em; text-shadow:0 2px 10px rgba(0,0,0,.8); }
#ml .cd.added .ar img { filter:grayscale(1) brightness(.45); }
#ml .cd.added .inq { display:flex; }
#ml .cd.added .tt, #ml .cd.added .st { opacity:.5; }
#ml .cd.on { background:rgba(255,255,255,.17); border-color:#fff; transform:scale(1.03); box-shadow:0 0 0 7px color-mix(in srgb, var(--ac) 45%, transparent); z-index:2; }
#ml .cd.gn .ar { display:flex; align-items:center; justify-content:center; font-size:38px; font-weight:900; text-align:center; padding:12px; line-height:1.1; background:linear-gradient(135deg,var(--g1),var(--g2)); }
#ml .cd.ls { display:flex; align-items:center; gap:22px; padding:10px 18px 10px 10px; }
#ml .cd.ls .ar { width:96px; flex:none; border-radius:16px; }
#ml .cd.ls .x { flex:1; min-width:0; }
#ml .cd.ls .tt { margin-top:0; font-size:34px; } #ml .cd.ls .st { font-size:26px; }
#ml .cd.ls .n { font-size:32px; font-weight:800; color:rgba(255,255,255,.45); width:54px; text-align:center; flex:none; }
#ml .cd.ls .d { font-size:26px; font-weight:700; color:rgba(255,255,255,.55); flex:none; }
#ml .msg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; font-size:36px; font-weight:700; color:rgba(255,255,255,.65); line-height:1.4; padding:0 80px; }
#ml .spin { width:70px; height:70px; border-radius:50%; border:8px solid rgba(255,255,255,.2); border-top-color:#fff; animation:mlspin .8s linear infinite; }
@keyframes mlspin { to { transform:rotate(360deg) } }
#ml .nowpg { display:flex; flex-direction:column; align-items:center; padding:6px 0 0; text-align:center; }
#ml .nowpg .big { width:560px; height:560px; border-radius:36px; object-fit:cover; background:rgba(255,255,255,.1); box-shadow:0 30px 70px rgba(0,0,0,.65), 0 0 90px color-mix(in srgb, var(--ac) 40%, transparent); }
#ml .nowpg .t { margin-top:28px; font-size:54px; font-weight:800; letter-spacing:-.5px; max-width:980px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .nowpg .a { margin-top:6px; font-size:36px; font-weight:600; color:var(--ac); max-width:980px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .nowpg .up { align-self:stretch; margin-top:34px; text-align:left; }
#ml .nowpg .up h3 { margin:0 0 14px 10px; font-size:26px; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.6); }
#ml .nowpg .ur { display:flex; gap:20px; padding:0 10px; }
#ml .nowpg .uc { width:222px; flex:none; }
#ml .nowpg .uc img, #ml .nowpg .uc .ph2 { width:222px; height:222px; border-radius:20px; object-fit:cover; display:block; background:rgba(255,255,255,.1); box-shadow:0 10px 24px rgba(0,0,0,.5); }
#ml .nowpg .uc div { margin-top:8px; font-size:24px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .pb { height:12px; border-radius:6px; background:rgba(255,255,255,.2); overflow:hidden; }
#ml .pb i { display:block; height:100%; width:0; border-radius:6px; background:linear-gradient(90deg,var(--ac),#fff); transition:width 1s linear; }
#ml .mq { flex:none; background:rgba(255,255,255,.08); border:2px solid rgba(255,255,255,.14); border-radius:32px; padding:16px 14px 14px; min-width:0; overflow:hidden; transition:box-shadow .3s; }
#ml .mq.zn { border-color:#fff; box-shadow:0 0 0 7px color-mix(in srgb, var(--ac) 45%, transparent); }
#ml .mq.land { box-shadow:0 0 0 10px color-mix(in srgb, var(--ac) 70%, transparent), 0 0 60px color-mix(in srgb, var(--ac) 60%, transparent); }
#ml .np { display:flex; align-items:center; gap:24px; padding:0 10px 14px; }
#ml .np img { width:128px; height:128px; border-radius:20px; object-fit:cover; flex:none; background:rgba(255,255,255,.1); box-shadow:0 10px 26px rgba(0,0,0,.55); }
#ml .np .nt { flex:1; min-width:0; }
#ml .np .k { font-size:22px; font-weight:800; letter-spacing:.16em; color:var(--ac); }
#ml .np .a { font-size:38px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
#ml .np .b { font-size:27px; font-weight:600; color:rgba(255,255,255,.62); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .np .pr { display:flex; align-items:center; gap:16px; margin-top:12px; font-size:22px; font-weight:700; color:rgba(255,255,255,.65); font-variant-numeric:tabular-nums; }
#ml .np .pr .pb { flex:1; }
#ml .mq.sm .np { padding-bottom:6px; gap:16px; }
#ml .mq.sm .np img { width:60px; height:60px; border-radius:12px; }
#ml .mq.sm .np .a { font-size:28px; } #ml .mq.sm .np .b, #ml .mq.sm .np .pr { display:none; }
#ml .mq.sm .np .k { display:inline; margin-right:12px; }
#ml .mq.nonp .np { display:none; }
#ml .cfw { position:relative; }
#ml .cf { position:relative; height:330px; perspective:1100px; }
#ml .mq.sm .cf { height:176px; } #ml .mq.sm .fc { top:26px; }
#ml .fc { position:absolute; left:50%; top:36px; width:var(--cw); margin-left:calc(var(--cw) / -2); transition:transform .5s cubic-bezier(.2,.8,.2,1), opacity .4s; transform-style:preserve-3d; }
#ml .fc .ar { position:relative; width:100%; aspect-ratio:1; border-radius:16px; overflow:hidden; background:rgba(255,255,255,.1); box-shadow:0 16px 34px rgba(0,0,0,.6); border:3px solid transparent; }
#ml .fc .ar img { width:100%; height:100%; object-fit:cover; display:block; }
#ml .fc .nm { position:absolute; left:8px; top:6px; font-size:22px; font-weight:900; background:rgba(0,0,0,.65); border-radius:10px; padding:1px 10px; }
#ml .fc.cq .nm { background:var(--ac); }
#ml .fc.past .ar img { filter:grayscale(.7) brightness(.6); }
#ml .fc.on .ar { border-color:#fff; box-shadow:0 0 0 7px color-mix(in srgb, var(--ac) 55%, transparent), 0 16px 34px rgba(0,0,0,.6); }
#ml .fc.op .ar { border-color:#ffd04a; box-shadow:0 0 0 5px rgba(255,208,74,.45), 0 16px 34px rgba(0,0,0,.6); }
#ml .fc.op .nm { background:#ffd04a; color:#3a2a00; }
#ml .np .k.op, #ml .fo .kick.op, #ml .cc .op { color:#ffd04a; }
#ml .fc.nw { animation:mlpop .7s cubic-bezier(.2,.8,.2,1); }
@keyframes mlpop { 0% { filter:brightness(2.2) } 100% { filter:none } }
#ml .cc { text-align:center; font-size:27px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-height:34px; margin-top:4px; }
#ml .cc span { color:rgba(255,255,255,.6); font-weight:600; }
#ml .mq.sm .cc { display:none; }
#ml .qe { text-align:center; font-size:30px; font-weight:600; color:rgba(255,255,255,.55); padding:48px 0 54px; }
#ml .mq.sm .qe { padding:20px 0 24px; font-size:26px; }
#ml .fly { position:absolute; z-index:30; pointer-events:none; }
#ml .fly img { width:100%; height:100%; object-fit:cover; border-radius:20px; box-shadow:0 20px 40px rgba(0,0,0,.6); display:block; }
#ml .kb { flex:none; display:flex; flex-direction:column; gap:10px; }
#ml .kr { display:flex; gap:10px; justify-content:center; }
#ml .kk { width:92px; height:96px; border-radius:22px; display:flex; align-items:center; justify-content:center; font-size:44px; font-weight:800; text-transform:uppercase; background:rgba(255,255,255,.1); border:2px solid rgba(255,255,255,.16); }
#ml .kk.w { width:210px; font-size:32px; }
#ml .kk.go { background:color-mix(in srgb, var(--ac) 60%, #000); }
#ml .kk.on { background:#fff; color:#12101c; border-color:#fff; transform:scale(1.1); box-shadow:0 0 0 8px color-mix(in srgb, var(--ac) 55%, transparent); }
#ml .leg { flex:none; display:flex; justify-content:center; gap:30px; font-size:25px; font-weight:600; color:rgba(255,255,255,.55); white-space:nowrap; }
#ml .leg b { color:#fff; background:rgba(255,255,255,.16); border-radius:10px; padding:2px 14px; margin-right:8px; font-weight:700; }
#ml .ov { position:absolute; inset:0; display:none; z-index:20; background:#07060d; flex-direction:column; padding:90px 60px 40px; gap:20px; }
#ml .ov.on { display:flex; }
#ml .ov h2 { margin:0 0 14px; font-size:64px; font-weight:800; letter-spacing:-1px; }
#ml .mi { display:flex; align-items:center; gap:30px; padding:30px 38px; border-radius:32px; background:rgba(255,255,255,.09); border:3px solid transparent; font-size:46px; font-weight:800; }
#ml .mi .ic { font-size:62px; width:80px; text-align:center; }
#ml .mi .sub { display:block; margin-top:6px; font-size:27px; font-weight:600; color:rgba(255,255,255,.58); }
#ml .mi .x { flex:1; min-width:0; }
#ml .mi .pill { font-size:32px; font-weight:800; letter-spacing:.1em; padding:12px 32px; border-radius:34px; background:rgba(255,255,255,.16); flex:none; }
#ml .mi .pill.on { background:var(--ac); }
#ml .mi.on { background:rgba(255,255,255,.2); border-color:#fff; box-shadow:0 0 0 8px color-mix(in srgb, var(--ac) 45%, transparent); }
#ml .gpn { flex:1; display:flex; flex-direction:column; align-items:center; text-align:center; gap:16px; }
#ml .gpn .qr { width:520px; height:520px; border-radius:30px; background:#fff; padding:22px; image-rendering:pixelated; }
#ml .gpn .qr.off { opacity:.25; filter:grayscale(1); }
#ml .gpn .u { font-size:34px; font-weight:800; letter-spacing:.02em; }
#ml .gpn .r { font-size:27px; font-weight:600; color:rgba(255,255,255,.65); line-height:1.5; max-width:900px; }
#ml .gpn .hr { font-size:30px; font-weight:700; color:var(--ac); }
#ml .qrc { position:absolute; left:50%; bottom:52px; translate:-50% 0; display:none; align-items:center; gap:18px; background:rgba(255,255,255,.12); border:2px solid rgba(255,255,255,.22); border-radius:28px; padding:12px 26px 12px 12px; font-size:28px; font-weight:800; z-index:9; }
#ml .qrc img { width:110px; height:110px; border-radius:14px; background:#fff; padding:6px; image-rendering:pixelated; } #ml .qrc small { display:block; font-size:21px; font-weight:600; color:rgba(255,255,255,.65); margin-top:2px; }
#ml .ed { flex:1; min-height:0; position:relative; overflow:hidden; scroll-behavior:smooth; }
#ml .ed .cd.cq .tt { color:var(--ac); }
#ml .toast { position:absolute; left:50%; top:46%; translate:-50% 0; background:rgba(14,12,26,.95); border:2px solid rgba(255,255,255,.3); border-radius:30px; padding:30px 54px; font-size:42px; font-weight:800; opacity:0; pointer-events:none; transition:opacity .2s; text-align:center; max-width:900px; z-index:9; }
#ml .toast.on { opacity:1; }

#ml .fo { position:absolute; inset:0; z-index:8; display:none; flex-direction:column; background:#07060d; font-family:inherit; }
#ml .fo.on { display:flex; }
#ml.fo-on .in { visibility:hidden; }
#ml .fo .bg2 { position:absolute; inset:-120px; background:var(--fart) center/cover; filter:blur(90px) brightness(.45) saturate(1.8); }
#ml .fo .sh2 { position:absolute; inset:0; background:linear-gradient(180deg,rgba(7,6,13,.3),rgba(7,6,13,.85)); }
#ml .fo .ft { position:relative; flex:none; height:960px; display:flex; flex-direction:column; align-items:center; padding:70px 60px 0; text-align:center; }
#ml .fo .kick { font-size:30px; font-weight:800; letter-spacing:.2em; color:var(--ac); }
#ml .fo .big { margin-top:26px; width:520px; height:520px; border-radius:36px; object-fit:cover; background:rgba(255,255,255,.1); box-shadow:0 36px 80px rgba(0,0,0,.7), 0 0 110px color-mix(in srgb, var(--ac) 45%, transparent); animation:msBreathe 6s ease-in-out infinite; }
#ml .fo .t { margin-top:30px; font-size:60px; font-weight:800; letter-spacing:-1px; max-width:960px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .fo .a { margin-top:6px; font-size:38px; font-weight:600; color:var(--ac); max-width:960px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .fo .pr { width:760px; display:flex; align-items:center; gap:18px; margin-top:24px; font-size:24px; font-weight:700; color:rgba(255,255,255,.7); font-variant-numeric:tabular-nums; }
#ml .fo .pr .pb { flex:1; }
#ml .fo .fq { position:relative; flex:1; min-height:0; padding:10px 44px 0; }
#ml .fo .fq h3 { margin:0 0 16px 8px; font-size:28px; letter-spacing:.16em; text-transform:uppercase; color:rgba(255,255,255,.65); }
#ml .fo .fr { display:flex; gap:20px; overflow:hidden; padding:6px 4px; }
#ml .fo .fc2 { flex:none; width:200px; }
#ml .fo .fc2 img { width:200px; height:200px; border-radius:20px; object-fit:cover; display:block; background:rgba(255,255,255,.1); box-shadow:0 12px 28px rgba(0,0,0,.55); }
#ml .fo .fc2.nx img { outline:5px solid var(--ac); }
#ml .fo .fc2 div { margin-top:8px; font-size:23px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#ml .fo .fc2 span { display:block; font-size:20px; font-weight:600; color:rgba(255,255,255,.55); }
#ml .fo .fe { font-size:32px; font-weight:600; color:rgba(255,255,255,.6); padding:30px 8px; }
#ml .fo .fp { position:absolute; left:0; right:0; bottom:60px; display:flex; justify-content:center; }
#ml .fo .fp div { display:flex; align-items:center; gap:20px; background:rgba(255,255,255,.14); border:2px solid rgba(255,255,255,.25); border-radius:60px; padding:16px 40px; font-size:34px; font-weight:800; animation:msPulse 2.4s ease-in-out infinite; }
#ml .fo .fp b { background:#ffc20e; color:#3a2a00; border-radius:50%; width:56px; height:56px; display:flex; align-items:center; justify-content:center; font-size:34px; }

/* screensaver pages (Party mode): the queue front and centre, posters in between */
#pw-saver .ms { position:absolute; inset:0; color:#fff; overflow:hidden; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; --ac:#ff5a8a; }
#pw-saver .ms .bg { position:absolute; inset:-100px; background:var(--a) center/cover; filter:blur(90px) brightness(.5) saturate(1.8); }
#pw-saver .ms .sh { position:absolute; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.78)); }
#pw-saver .ms .w { position:absolute; left:0; right:0; top:0; height:1640px; padding:84px 60px 0; display:flex; flex-direction:column; align-items:center; }
#pw-saver .ms .kick { font-size:32px; font-weight:800; letter-spacing:.2em; color:var(--ac); text-transform:uppercase; }
#pw-saver .ms .big { margin-top:34px; width:700px; height:700px; border-radius:40px; object-fit:cover; box-shadow:0 40px 90px rgba(0,0,0,.7), 0 0 130px color-mix(in srgb, var(--ac) 50%, transparent); animation:msBreathe 6s ease-in-out infinite; }
@keyframes msBreathe { 50% { transform:scale(1.02) } }
#pw-saver .ms .t { margin-top:34px; font-size:64px; font-weight:800; letter-spacing:-1px; max-width:960px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; }
#pw-saver .ms .a { margin-top:6px; font-size:40px; font-weight:600; color:var(--ac); max-width:960px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#pw-saver .ms .pb { width:760px; height:12px; border-radius:6px; background:rgba(255,255,255,.2); overflow:hidden; margin-top:26px; }
#pw-saver .ms .pb i { display:block; height:100%; width:100%; transform:scaleX(0); transform-origin:left; background:linear-gradient(90deg,var(--ac),#fff); animation:msFill var(--d) linear var(--o) forwards; animation-play-state:var(--ps); }
@keyframes msFill { from { transform:scaleX(0) } to { transform:scaleX(1) } }   /* (scaling, not width: no layout per frame) */
#pw-saver .ms .up { align-self:stretch; margin-top:40px; }
#pw-saver .ms .up h3 { margin:0 0 16px 6px; font-size:28px; letter-spacing:.16em; text-transform:uppercase; color:rgba(255,255,255,.65); }
#pw-saver .ms .ur { display:flex; gap:22px; }
#pw-saver .ms .uc { flex:1; min-width:0; }
#pw-saver .ms .uc img { width:100%; aspect-ratio:1; border-radius:22px; object-fit:cover; display:block; box-shadow:0 12px 28px rgba(0,0,0,.55); }
#pw-saver .ms .uc div { margin-top:10px; font-size:26px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#pw-saver .ms .uc span { display:block; font-size:22px; font-weight:600; color:rgba(255,255,255,.55); }
#pw-saver .ms .hd { font-size:62px; font-weight:800; letter-spacing:-1px; text-align:center; }
#pw-saver .ms .hd span { display:block; margin-top:8px; font-size:30px; letter-spacing:.16em; text-transform:uppercase; color:var(--ac); font-weight:800; }
#pw-saver .ms .qg { margin-top:40px; align-self:stretch; display:grid; gap:26px 24px; }
#pw-saver .ms .qi { position:relative; min-width:0; }
#pw-saver .ms .qi img { width:100%; aspect-ratio:1; border-radius:22px; object-fit:cover; display:block; box-shadow:0 14px 30px rgba(0,0,0,.6); }
#pw-saver .ms .qi.cur img { outline:6px solid var(--ac); box-shadow:0 0 70px color-mix(in srgb, var(--ac) 70%, transparent); }
#pw-saver .ms .qi .bdg { position:absolute; left:12px; top:12px; background:var(--ac); border-radius:14px; padding:2px 14px; font-size:24px; font-weight:900; letter-spacing:.08em; }
#pw-saver .ms .qi .bdn { position:absolute; left:12px; top:12px; background:rgba(0,0,0,.65); border-radius:14px; padding:2px 14px; font-size:24px; font-weight:900; }
#pw-saver .ms .qi div.tl { margin-top:10px; font-size:25px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#pw-saver .ms .qi div.by { font-size:21px; font-weight:600; color:rgba(255,255,255,.55); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#pw-saver .ms .more { margin-top:22px; font-size:30px; font-weight:700; color:rgba(255,255,255,.7); }
.msad { position:absolute; left:50px; bottom:40px; z-index:7; display:flex; align-items:center; gap:22px; font-size:40px; font-weight:800; animation:msPulse 2.4s ease-in-out infinite; }
.msad .y { width:92px; height:92px; border-radius:50%; background:#ffc20e; color:#3a2a00; display:flex; align-items:center; justify-content:center; font-size:58px; font-weight:900; box-shadow:0 0 40px rgba(255,194,14,.7); }
.msad.qr { left:auto; right:50px; bottom:auto; top:1490px; gap:20px; font-size:36px; flex-direction:row-reverse; text-align:right; animation:none; }
#pw-saver .ms:has(.msad.qr) .w { height:1480px; } #pw-saver .ms:has(.msad.qr) .big { width:620px; height:620px; margin-top:24px; }
#pw-saver.espn #pw-party { display:none !important; }
.msad.qr { } .msad.qr img { width:150px; height:150px; border-radius:18px; background:#fff; padding:8px; image-rendering:pixelated; box-shadow:0 0 40px rgba(255,255,255,.35); }
.msad small { display:block; font-size:25px; font-weight:600; color:rgba(255,255,255,.65); margin-top:2px; }
@keyframes msPulse { 50% { transform:scale(1.05); } }
#pw-saver .ms .wall { position:absolute; left:0; right:0; top:0; height:1640px; display:grid; grid-template-columns:repeat(4,1fr); grid-auto-rows:1fr; }
#pw-saver .ms .wall img { width:100%; height:100%; object-fit:cover; display:block; filter:brightness(.55) saturate(1.2); animation:msIn .9s both; }
@keyframes msIn { from { opacity:0; transform:scale(.8) } }
#pw-saver .ms .wc { padding:34px 40px 40px; border-radius:44px; background:rgba(8,8,16,.86); border:2px solid rgba(255,255,255,.22); display:flex; flex-direction:column; align-items:center; text-align:center; box-shadow:0 40px 100px rgba(0,0,0,.7); max-width:840px; }
#pw-saver .ms .wc img { width:460px; height:460px; border-radius:28px; object-fit:cover; }
#pw-saver .ms .wc .t { font-size:54px; margin-top:26px; max-width:760px; } #pw-saver .ms .wc .a { font-size:36px; max-width:760px; }
#pw-saver .ms.dj { font-family:'Oswald','Arial Narrow','Roboto Condensed',Impact,sans-serif; text-transform:uppercase; }
#pw-saver .ms .djbg { position:absolute; inset:0; background:radial-gradient(900px 700px at 50% 38%, #ff3d86 0%, transparent 70%), linear-gradient(160deg,#2a0b57 0%,#5b1b8f 45%,#ff5a3d 120%); }
#pw-saver .ms .djbg::after { content:''; position:absolute; inset:0; background:repeating-conic-gradient(from 0deg at 50% 38%, rgba(255,255,255,.07) 0 6deg, transparent 6deg 14deg); animation:djSpin 60s linear infinite; }
@keyframes djSpin { to { transform:rotate(360deg) } }
#pw-saver .ms .dn { position:absolute; z-index:2; font-style:normal; font-size:110px; color:rgba(255,255,255,.28); animation:djFloat 7s ease-in-out infinite; }
@keyframes djFloat { 50% { transform:translateY(-40px) rotate(8deg) } }
#pw-saver .ms .djk { font-size:34px; font-weight:700; letter-spacing:.34em; color:#ffe27a; }
#pw-saver .ms .djh { margin-top:12px; font-size:150px; font-weight:700; line-height:.92; text-align:center; letter-spacing:-1px; color:#fff; text-shadow:0 8px 0 #7a1a8c, 0 18px 40px rgba(0,0,0,.45); }
#pw-saver .ms .djq { margin-top:30px; padding:26px; background:#fff; border-radius:44px; transform:rotate(-2.5deg); box-shadow:0 0 0 12px #ffd04a, 0 40px 90px rgba(0,0,0,.6), 0 0 160px rgba(255,208,74,.6); animation:djPulse 2.6s ease-in-out infinite; }
#pw-saver .ms .djq img { display:block; width:520px; height:520px; image-rendering:pixelated; }
@keyframes djPulse { 50% { transform:rotate(-2.5deg) scale(1.035) } }
#pw-saver .ms .djh2 { margin-top:44px; font-size:128px; font-weight:700; line-height:1; color:#ffd04a; text-shadow:0 7px 0 #7a1a8c, 0 16px 36px rgba(0,0,0,.5); text-align:center; }
#pw-saver .ms .djs { margin-top:34px; display:flex; gap:22px; }
#pw-saver .ms .djs div { width:310px; text-align:center; font-size:28px; font-weight:600; letter-spacing:.04em; color:#fff; line-height:1.15; }
#pw-saver .ms .djs b { display:block; font-size:70px; margin-bottom:6px; font-weight:400; }
#pw-saver .ms .djn { margin-top:28px; font-size:28px; font-weight:500; letter-spacing:.12em; color:rgba(255,255,255,.75); max-width:960px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#pw-saver .ms.viz { background:#05040a; } #pw-saver .ms.viz canvas { position:absolute; left:0; top:0; width:1080px; height:1640px; }
#pw-saver .ms.viz .vt { position:absolute; left:0; right:0; top:1330px; text-align:center; padding:0 70px; } #pw-saver .ms.viz .vk { font-size:28px; font-weight:800; letter-spacing:.3em; color:var(--ac); }
#pw-saver .ms.viz .vh { margin-top:12px; font-size:68px; font-weight:800; letter-spacing:-1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 4px 30px rgba(0,0,0,.7); } #pw-saver .ms.viz .va { margin-top:4px; font-size:40px; font-weight:600; color:rgba(255,255,255,.75); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#pw-saver .ms.facts .fk { font-size:30px; font-weight:800; letter-spacing:.3em; color:var(--ac); text-transform:uppercase; }
#pw-saver .ms.facts .fi { margin-top:30px; width:430px; height:430px; border-radius:50%; object-fit:cover; box-shadow:0 30px 80px rgba(0,0,0,.65), 0 0 0 10px rgba(255,255,255,.1), 0 0 120px color-mix(in srgb, var(--ac) 45%, transparent); background:rgba(255,255,255,.1); }
#pw-saver .ms.facts .fn { margin-top:30px; font-size:78px; font-weight:800; letter-spacing:-1.5px; text-align:center; line-height:1.02; max-width:960px; }
#pw-saver .ms.facts .fb { margin-top:26px; font-size:37px; line-height:1.38; font-weight:500; color:rgba(255,255,255,.88); text-align:center; max-width:940px; }
#pw-saver .ms.facts .fc { margin-top:20px; display:flex; flex-wrap:wrap; gap:12px; justify-content:center; max-width:960px; } #pw-saver .ms.facts .fc span { background:rgba(255,255,255,.14); border:2px solid rgba(255,255,255,.22); border-radius:30px; padding:10px 24px; font-size:28px; font-weight:700; }
#pw-saver .ms.facts .fs { margin-top:26px; padding:22px 30px; border-radius:26px; background:rgba(0,0,0,.35); border:2px solid rgba(255,255,255,.14); font-size:31px; line-height:1.35; color:rgba(255,255,255,.85); max-width:940px; } #pw-saver .ms.facts .fs b { display:block; font-size:22px; letter-spacing:.22em; color:var(--ac); margin-bottom:6px; }
#pw-saver .ms.who .w, #pw-saver .ms.facts .w { justify-content:center; padding-top:0; }
#pw-saver .ms.who .wk { font-size:30px; font-weight:800; letter-spacing:.3em; color:var(--ac); } #pw-saver .ms.who .wh { margin-top:8px; font-size:110px; font-weight:800; letter-spacing:-2px; line-height:1; }
#pw-saver .ms.who .wg { margin-top:44px; align-self:stretch; display:grid; grid-template-columns:repeat(3,1fr); gap:34px 20px; }
#pw-saver .ms.who .wp { text-align:center; min-width:0; } #pw-saver .ms.who .wa { width:210px; height:210px; border-radius:50%; margin:0 auto; display:flex; align-items:center; justify-content:center; font-size:100px; font-weight:800; color:#fff; box-shadow:0 14px 40px rgba(0,0,0,.55); position:relative; }
#pw-saver .ms.who .wa.off { filter:grayscale(.9) brightness(.55); } #pw-saver .ms.who .wa i { position:absolute; right:6px; bottom:6px; width:34px; height:34px; border-radius:50%; background:#4ade80; border:5px solid #101018; } #pw-saver .ms.who .wa.off i { background:#555; }
#pw-saver .ms.who .wn { margin-top:14px; font-size:38px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } #pw-saver .ms.who .wcn { font-size:28px; font-weight:700; color:#ffd04a; } #pw-saver .ms.who .wcn small { color:rgba(255,255,255,.6); font-weight:600; margin-left:8px; }
#pw-saver .ms.who .we { margin-top:120px; font-size:46px; font-weight:700; text-align:center; color:rgba(255,255,255,.8); line-height:1.3; }
#pw-saver .ms.say .w { justify-content:center; padding-top:0; }
#pw-saver .ms.say .sk { font-size:30px; font-weight:800; letter-spacing:.3em; color:var(--ac); text-align:center; } #pw-saver .ms.say .sh1 { margin-top:10px; font-size:84px; font-weight:800; letter-spacing:-1.5px; text-align:center; line-height:1.03; max-width:960px; }
#pw-saver .ms.say .sl { margin-top:40px; align-self:stretch; display:flex; flex-direction:column; gap:22px; }
#pw-saver .ms.say .bb { max-width:820px; padding:24px 34px; border-radius:38px; background:hsl(var(--h) 55% 28% / .92); border:2px solid hsl(var(--h) 70% 55% / .6); box-shadow:0 14px 40px rgba(0,0,0,.45); align-self:flex-start; border-bottom-left-radius:10px; }
#pw-saver .ms.say .bb.r { align-self:flex-end; border-radius:38px; border-bottom-right-radius:10px; }
#pw-saver .ms.say .bt { font-size:44px; font-weight:600; line-height:1.22; word-break:break-word; } #pw-saver .ms.say .bn { margin-top:8px; font-size:27px; font-weight:800; color:hsl(var(--h) 90% 75%); }
#pw-saver .ms.say .sq { margin-top:26px; font-size:30px; font-weight:600; color:rgba(255,255,255,.75); text-align:center; }
#pw-saver .ms .qrs { position:absolute; left:40px; top:40px; z-index:8; display:flex; align-items:center; gap:16px; background:rgba(8,8,16,.7); border:2px solid rgba(255,255,255,.22); border-radius:24px; padding:10px 22px 10px 10px; font-size:26px; font-weight:800; }
#pw-saver .ms .qrs img { width:120px; height:120px; border-radius:12px; background:#fff; padding:6px; image-rendering:pixelated; } #pw-saver .ms .qrs small { display:block; font-size:20px; font-weight:600; color:rgba(255,255,255,.7); }
#pw-party { position:absolute; bottom:22px; right:60px; z-index:8; display:none; align-items:center; gap:14px; background:rgba(8,8,16,.86); border:2px solid rgba(255,255,255,.22); border-radius:40px; padding:8px 24px 8px 8px; font-size:25px; font-weight:700; color:#fff; white-space:nowrap; max-width:640px; }   /* (no backdrop blur: it was redone whenever anything behind it moved) */
#pw-party.on { display:flex; }
#pw-saver.music #pw-party { display:none; }
#pw-party .y { width:46px; height:46px; border-radius:50%; background:#ffc20e; color:#3a2a00; display:flex; align-items:center; justify-content:center; font-size:30px; font-weight:900; flex:none; }
#pw-party .m { min-width:0; overflow:hidden; text-overflow:ellipsis; } #pw-party .m span { color:rgba(255,255,255,.65); font-weight:600; }
#pw-party .c { color:#ff5a8a; font-weight:800; letter-spacing:.08em; }`;
  document.head.appendChild(css);

  const GENRES = [['Pop', 14, '#ff5a8a', '#7b2ff7'], ['Hip-Hop / Rap', 18, '#f5a623', '#d0021b'], ['Rock', 21, '#e94b3c', '#2b2b2b'], ['Country', 6, '#d9a441', '#7a4a1d'],
    ['R&B / Soul', 15, '#9b59b6', '#2c3e82'], ['Alternative', 20, '#16a085', '#2c3e50'], ['Dance', 17, '#00c6ff', '#e100ff'], ['Christian & Gospel', 22, '#f6d365', '#fda085'],
    ['Jazz', 2, '#396afc', '#2948ff'], ['Latin', 12, '#ff9a44', '#fc6076'], ['Classical', 5, '#bdc3c7', '#2c3e50'], ['Reggae', 24, '#38ef7d', '#e8b923'],
    ['Electronic', 7, '#4776e6', '#8e54e9'], ['Soundtrack', 16, '#434343', '#6a82fb']];
  const CHIPS = ['Now Playing', 'Discover', 'Genres'];
  const KB = ['abcdefghij', 'klmnopqrst', 'uvwxyz0123', '456789'];
  const ACTIONS = [['⌫', 'back', ''], ['SPACE', 'space', 'w'], ['DONE', 'go', 'w go']];
  const MENU = ['party', 'pickmode', 'picks', 'guests', 'edit', 'close'];
  let party = false;
  const jpost = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const syncParty = () => fetch('/music/party').then(r => r.json()).then(j => { if (party !== !!j.on) { party = !!j.on; if (open) paintAll(); } }).catch(() => {});
  syncParty(); setInterval(syncParty, 15000);
  window.PartyMode = {
    on: () => party,
    set: async v => { party = !!v; if (open) paintAll(); try { await jpost('/music/party', { on: party }); } catch (e) {} loadQueue(); }
  };

  // Our Picks: the house list. In Party mode the mirror adds one of these by itself when nothing is lined up (or curates one if the list is empty)
  const loadPicks = () => fetch('/music/picks').then(r => r.json()).then(l => { picks = l; if (open) markAdded(); }).catch(() => {});
  loadPicks();
  const isPick = it => !!it && it.by === 'Our Pick';
  const byText = it => it.by === 'Our Pick' ? '★ Our Pick' : it.by ? 'added by ' + it.by : '';
  const picksIds = () => new Set(picks.map(x => String(x.id)));
  const pickAlb = new Set();
  // Guest requests: phones on the home Wi-Fi scan a QR code (proxy.py serves them on port 8766). The QR is drawn here with a small local library.
  let guest = { open: false, off: false, url: '', here: [], econ: {} }, qrImg = {}, qrLoading = null;
  const loadGuest = () => fetch('/guest/info').then(r => r.json()).then(j => { guest = j; if (open && zone === 'guests') paintGuests(); }).catch(() => {});
  loadGuest(); setInterval(() => { if (open || party) loadGuest(); }, 8000);
  function qrFor(url) {                              // -> data URL (cached); the library loads on first use
    if (!url) return '';
    if (qrImg[url]) return qrImg[url];
    if (window.qrcode) { const q = qrcode(0, 'M'); q.addData(url); q.make(); return qrImg[url] = q.createDataURL(10, 0); }
    if (!qrLoading) { qrLoading = new Promise(r => { const s = document.createElement('script'); s.src = 'qrcode.js'; s.onload = s.onerror = r; document.head.appendChild(s); }); qrLoading.then(() => { if (open) paintAll(); }); }
    return '';
  }
  const guestsOn = () => guest.open && !guest.off;
  const el = document.createElement('div'); el.id = 'ml';
  el.innerHTML = `<div class="bg"></div><div class="shade"></div>
    <div class="in"><div class="top"></div><div class="sb"></div><div class="sg" style="display:none"></div><div class="lbl"></div><div class="con"></div><div class="kb" style="display:none"></div><div class="mq"><div class="np"></div><div class="cfw"></div></div><div class="leg"></div></div>
    <div class="fo"></div><div class="ov" id="ml-menu"></div><div class="ov" id="ml-guests"></div><div class="ov" id="ml-edit"></div><div class="toast"></div>`;
  overlay.appendChild(el);
  const $ = s => el.querySelector(s);
  const topEl = $('.top'), sbEl = $('.sb'), sgEl = $('.sg'), lblEl = $('.lbl'), conEl = $('.con'), kbEl = $('.kb'), mqEl = $('.mq'), npEl = $('.np'), cfwEl = $('.cfw'), legEl = $('.leg'), menuEl = $('#ml-menu'), guestsEl = $('#ml-guests'), editEl = $('#ml-edit'), toastEl = $('.toast'), foEl = $('.fo');
  const k = b => `<b>${b}</b>`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = s => s ? Math.floor(s / 60) + ':' + String(Math.floor(s) % 60).padStart(2, '0') : '0:00';
  const blip = (f, d = .04) => { if (window.playWiiSound) playWiiSound(f, 'sine', d); };

  // state. zone: chips | search | kb | grid | queue | menu | edit. disc = the browse stack (chart -> genre songs / album tracks); res = the search results
  let open = false, openedAt = 0, zone = 'grid', chip = 1, q = '', kbR = 0, kbC = 0, disc = [], res = null, resT = null, resId = 0, loadId = 0, toastT = null;
  let lastAct = performance.now(), foOn = false, foSig = '', picks = [], pickMode = false, edMode = 'queue';
  let sug = [], sugSel = 0, sugT = null, sugQ = '';
  let queue = { items: [], current: 0 }, qSel = 0, edSel = 0, menuSel = 0, fromPad = false, qTemp = null, qTempT = null, qSig = '', nowSig = '';
  const added = new Map(), addedAlb = new Map();     // id -> time: picked here this session, greyed out in the grid until it shows in (or leaves) the queue
  const isOpen = () => open && overlay.classList.contains('active');
  const searching = () => q.trim().length >= 2;
  const viewing = () => (searching() && res) ? res : disc[disc.length - 1];
  const qIds = () => new Set(queue.items.map(x => String(x.id)));
  const isAdded = (it, ids) => !it || it.kind === 'genre' || it.kind === 'artist' ? false : pickMode ? (it.kind === 'album' ? pickAlb.has(String(it.id)) : picksIds().has(String(it.id))) : it.kind === 'album' ? addedAlb.has(String(it.id)) : (ids || qIds()).has(String(it.id)) || added.has(String(it.id));

  async function api(path) { const r = await fetch(path); if (!r.ok) throw new Error(r.status); return r.json(); }
  function fresh(kind, title) { return { kind, title, items: [], sel: 0, loading: true, err: '', cols: 3 }; }

  // ---- data ----
  function shelfView(shelves) {                      // a stack of horizontal shelves; items / sel always mean "the selected shelf", so play() works unchanged
    const v = { kind: 'shelves', title: 'Discover', si: 0, shelves: shelves.map(s => Object.assign({ ci: 0 }, s)), loading: false, err: '', cols: 4 };
    Object.defineProperty(v, 'items', { get() { return (this.shelves[this.si] || {}).items || []; } });
    Object.defineProperty(v, 'sel', { get() { return (this.shelves[this.si] || {}).ci || 0; }, set(x) { if (this.shelves[this.si]) this.shelves[this.si].ci = x; } });
    return v;
  }
  function loadChip(c) {
    chip = c; const id = ++loadId;
    if (c === 0) { disc = [{ kind: 'now', title: 'Now Playing', items: [], sel: 0, loading: false, err: '', cols: 3 }]; nowSig = ''; paintContent(); paintTop(); paintQueue(); return; }
    if (c === 2) { disc = [{ kind: 'genres', title: 'Genres', items: GENRES.map(g => ({ kind: 'genre', id: g[1], title: g[0], c1: g[2], c2: g[3] })), sel: 0, loading: false, err: '', cols: 3 }]; paintContent(); paintTop(); paintQueue(); return; }
    const v = shelfView([]); v.loading = true; disc = [v]; paintContent(); paintTop(); paintQueue();
    const n = nowInfo(), seed = n && n.artist ? n.artist.split(',')[0].split(' & ')[0] : '';
    const go = (tries) => api('/music/discover').then(d => {
      if (id !== loadId) return;
      if (!d.shelves.length && tries < 6) return setTimeout(() => go(tries + 1), 2500);          // the shelves are still being built (first start)
      const nv = shelfView(d.shelves); if (!nv.shelves.length) { nv.err = 'Nothing to show yet: try again in a minute'; }
      disc = [nv]; paintContent(); paintTop();
      if (seed) api('/music/discover?only=more&seed=' + encodeURIComponent(seed)).then(m2 => {       // "more like what's playing" arrives a moment later and goes on top
        if (id !== loadId || !m2.shelves.length || disc[0] !== nv) return;
        nv.shelves.unshift(Object.assign({ ci: 0 }, m2.shelves[0])); nv.si++; paintContent();
      }).catch(() => {});
    }).catch(() => { if (id === loadId) { v.loading = false; v.err = 'Couldn’t load music ideas'; paintContent(); } });
    go(0);
  }
  function push(v, path) {
    disc.push(v); zone = 'grid'; const id = loadId; paintAll();
    api(path).then(d => { if (id !== loadId) return; v.items = d; v.loading = false; paintContent(); })
      .catch(() => { v.loading = false; v.err = 'Couldn’t reach Apple Music'; paintContent(); });
  }
  function openAlbum(it) {
    const v = fresh('album', it.title); v.sub = it.artist; v.art = it.art; v.cols = 1;
    q = ''; res = null; push(v, '/music/album?id=' + it.id);
  }
  const topArtist = () => sug.find(x => x.kind === 'artist' && sugQ === q.trim());
  function withArtist(v) {                           // the best-matching artist leads the results: typing "bea" puts The Beatles first
    const a = topArtist(); if (!v || !a || v.loading || v.kind !== 'search') return;
    const i = v.items.findIndex(x => x.kind === 'artist' && x.title.toLowerCase() === a.q.toLowerCase());
    if (i === 0) return;
    v.items.unshift(i > 0 ? v.items.splice(i, 1)[0] : { kind: 'artist', id: '', title: a.q }); v.err = ''; v.sel = 0;
  }
  function suggest() {                               // as you type: Deezer's autocomplete, shown as a strip under the search bar
    clearTimeout(sugT); const want = q.trim();
    if (want.length < 2) { sug = []; sugQ = ''; paintSug(); return; }
    sugT = setTimeout(() => {
      api('/music/suggest?q=' + encodeURIComponent(want)).then(d => {
        if (q.trim() !== want) return;
        sug = d; sugQ = want; sugSel = 0; if (zone === 'sug' && !sug.length) zone = 'kb';
        if (res && searching()) { withArtist(res); paintContent(); }
        paintSug(); paintQueue();
      }).catch(() => {});
    }, 220);
  }
  function openArtist(name) {                        // an artist's top songs, then their albums
    const v = fresh('artist', name); v.cols = 3; q = ''; res = null; sug = []; sugQ = ''; clearTimeout(resT); clearTimeout(sugT);
    disc.push(v); zone = 'grid'; const id = loadId; paintAll();
    api('/music/artist?name=' + encodeURIComponent(name)).then(d => {
      if (id !== loadId) return;
      v.title = d.name; v.items = d.songs.concat(d.albums); v.loading = false; if (!v.items.length) v.err = 'No catalog found for “' + d.name + '”';
      paintTop(); paintContent();
    }).catch(() => { v.loading = false; v.err = 'Couldn’t reach Apple Music'; paintContent(); });
  }
  function scheduleSearch() {                       // as you type: debounced, stale answers dropped
    clearTimeout(resT); suggest();
    if (!searching()) { res = null; paintAll(); return; }
    const want = q.trim();
    res = Object.assign(fresh('search', 'Results'), { q: want }); paintContent();
    resT = setTimeout(() => {
      const id = ++resId;
      api('/music/search?q=' + encodeURIComponent(want)).then(d => {
        if (id !== resId || q.trim() !== want) return;
        const seenA = new Set(); res.items = (d.artists || []).filter(a => !seenA.has(a.title.toLowerCase()) && seenA.add(a.title.toLowerCase())).slice(0, 2).concat(d.songs.slice(0, 15), d.albums.slice(0, 6)); res.loading = false;
        if (!res.items.length) res.err = 'No results for “' + want + '”';
        withArtist(res); paintContent(); paintTop();
      }).catch(() => { if (id !== resId) return; res.loading = false; res.err = 'Couldn’t reach Apple Music'; paintContent(); });
    }, 450);
  }
  function loadQueue() {
    return api('/music/queue').then(d => {
      party = !!d.party; queue = { items: d.items, current: d.current };
      const ids = qIds(), now = Date.now();
      added.forEach((t, id) => { if (!ids.has(id) && now - t > 15000) added.delete(id); });
      addedAlb.forEach((t, id) => { if (now - t > 600e3) addedAlb.delete(id); });
      qSel = Math.max(0, Math.min(qSel, Math.max(0, queue.items.length - 1))); edSel = Math.max(0, Math.min(edSel, Math.max(0, queue.items.length - 1)));
      if (open) { paintQueue(); paintTop(); markAdded(); if (zone === 'edit') paintEdit(); if (viewing().kind === 'now') paintContent(); }
    }).catch(() => {});
  }
  setInterval(() => { if (open || party) loadQueue(); }, 4000);

  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 1700); }
  async function addTracks(tracks, mode) {
    const r = await jpost('/music/play', { tracks, start: 0, mode, by: 'Guest' });
    if (!r.ok) { let msg = ''; try { msg = (await r.json()).error || ''; } catch (e) {} throw new Error(msg || String(r.status)); }
  }

  // a picked song drops into the queue: the carousel scrolls to the end, the art falls into it, the card greys out in the grid
  function fall(card, it) {
    const ar = card && card.querySelector('.ar'); if (!ar) return;
    const r = ar.getBoundingClientRect(), base = el.getBoundingClientRect(), cf = cfwEl.querySelector('.cf');
    const dest = (cf || mqEl).getBoundingClientRect(), cw = parseFloat(mqEl.style.getPropertyValue('--cw')) || 190;
    const f = document.createElement('div'); f.className = 'fly';
    f.style.cssText = `left:${r.left - base.left}px;top:${r.top - base.top}px;width:${r.width}px;height:${r.height}px`;
    f.innerHTML = `<img src="${esc(it.art || '')}" alt="">`; el.appendChild(f);
    const tx = dest.left + dest.width / 2 - r.width / 2 - r.left, ty = dest.top + 36 + cw * .65 - r.height / 2 - r.top, s = cw * 1.3 / r.width;
    f.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${tx}px)` }], { duration: 760, easing: 'cubic-bezier(.3,.5,.4,1)', fill: 'forwards' });
    f.firstChild.animate([{ transform: 'translateY(0) scale(1) rotate(0)', offset: 0, easing: 'cubic-bezier(.3,0,.6,1)' },
      { transform: 'translateY(-70px) scale(.95) rotate(-4deg)', offset: .22, easing: 'cubic-bezier(.55,0,1,.5)' },
      { transform: `translateY(${ty}px) scale(${s}) rotate(3deg)`, offset: 1 }], { duration: 760, fill: 'forwards' }).onfinish = () => {
      f.remove(); mqEl.classList.add('land'); setTimeout(() => mqEl.classList.remove('land'), 700); blip(440, .1);
    };
  }
  function optimistic(it, mode) {                   // show the new song in the carousel straight away; the speaker's own queue replaces it on the next refresh
    const i = mode === 'next' ? Math.max(0, queue.items.findIndex(x => x.n === queue.current)) + 1 : queue.items.length;
    queue.items.splice(i, 0, { n: 0, id: String(it.id), title: it.title, artist: it.artist, art: it.art, by: 'Guest', temp: true });
    queue.items.forEach((x, j) => { if (j >= i) x.n = j + 1; });
    qTemp = i; clearTimeout(qTempT); qTempT = setTimeout(() => { qTemp = null; placeCarousel(); }, 1900);
    paintQueue();
    const c = cfwEl.querySelectorAll('.fc')[i]; if (c) c.classList.add('nw');
    markAdded();
  }
  async function play(mode) {                       // A: play now · X: add to queue · Y: play next
    const v = viewing(), it = v && v.items[v.sel];
    if (!it || it.kind === 'genre') return;
    if (it.kind === 'artist') { if (mode === 'now') openArtist(it.title); return; }
    const card = conEl.querySelector('.cd.on') || conEl.querySelector(`.cd[data-i="${v.sel}"]`);
    if (pickMode) {                                  // the selector: everything chosen goes to Our Picks instead of the queue
      if (it.kind === 'album') {
        if (mode === 'now') return openAlbum(it);
        try { const t = await api('/music/album?resolve=1&id=' + it.id); await pickPost({ action: 'add', tracks: t }); pickAlb.add(String(it.id)); toast('★ Album added to Our Picks'); } catch (e) { toast('Couldn’t save that one'); }
      } else if (isAdded(it)) toast('Already in Our Picks');
      else { try { await pickPost({ action: 'add', tracks: [it] }); toast('★ Added to Our Picks'); blip(660, .1); } catch (e) { toast('Couldn’t save that one'); } }
      markAdded(); return;
    }
    if (it.kind === 'album') {
      if (mode === 'now') return openAlbum(it);
      if (addedAlb.has(String(it.id))) return toast('Already in the queue');
      addedAlb.set(String(it.id), Date.now()); markAdded(); fall(card, it);
      try { await addTracks(await api('/music/album?resolve=1&id=' + it.id), 'add'); toast(party ? 'Album added to the party queue' : 'Album added to the queue'); setTimeout(loadQueue, 700); }
      catch (e) { addedAlb.delete(String(it.id)); markAdded(); toast(/^\d+$/.test(e.message) ? 'The speaker didn’t take that one' : e.message); }
      return;
    }
    const single = party || mode !== 'now' || v.kind === 'search' || String(it.id).startsWith('dz:');
    if (single && isAdded(it)) return toast('Already in the queue');
    const tracks = single ? [it] : v.items.slice(v.sel).filter(t => t.kind === 'song' || !t.kind);
    if (mode === 'now' && !party) toast('Starting “' + it.title + '”…');
    const sid = String(it.id);
    if (single) { added.set(sid, Date.now()); fall(card, it); optimistic(it, mode === 'next' ? 'next' : 'add'); }
    try {
      await addTracks(tracks, mode);
      if (mode === 'now' && !party) hide(); else { toast(party && mode !== 'next' ? '🎉 Added to the party queue' : mode === 'add' ? 'Added to queue' : 'Playing next'); setTimeout(loadQueue, 700); }
    } catch (e) { if (single) { added.delete(sid); queue.items = queue.items.filter(x => !x.temp); paintQueue(); markAdded(); } toast(/^\d+$/.test(e.message) ? 'The speaker didn’t take that one' : e.message); }
  }
  async function pickPost(body) { const r = await jpost('/music/picks', body); if (!r.ok) throw new Error(r.status); picks = await r.json(); }
  async function queueAct(action, n) {
    try { await jpost('/music/queue', { action, n }); toast(action === 'remove' ? 'Removed from the queue' : 'Jumping to it…'); } catch (e) {}
    loadQueue();
  }

  // ---- painting: each region on its own, so moving the selection never rebuilds the artwork ----
  const artOf = it => it.art ? `<img src="${esc(it.art)}" alt="" loading="lazy">` : '';
  function card(it, i, v, ids) {
    if (it.kind === 'genre') return `<div class="cd gn" data-i="${i}" style="--g1:${it.c1};--g2:${it.c2}"><div class="ar">${esc(it.title)}</div></div>`;
    if (it.kind === 'artist') return `<div class="cd gn" data-i="${i}" style="--g1:#ff5a8a;--g2:#4a2c8a"><div class="ar" style="flex-direction:column;gap:6px"><span style="font-size:84px">👤</span><span style="font-size:26px;letter-spacing:.12em">ARTIST</span></div><div class="tt">${esc(it.title)}</div><div class="st">See all songs &amp; albums</div></div>`;
    if (it.kind === 'artist' && it.art) return `<div class="cd" data-i="${i}"><div class="ar" style="border-radius:50%"><img src="${esc(it.art)}" alt=""><span class="bd" style="left:50%;translate:-50% 0">ARTIST</span></div><div class="tt" style="text-align:center">${esc(it.title)}</div><div class="st" style="text-align:center">All songs &amp; albums</div></div>`;
    const ad = isAdded(it, ids) ? ' added' : '';
    if (v.cols === 1) return `<div class="cd ls${ad}" data-i="${i}"><div class="n">${i + 1}</div><div class="x"><div class="tt">${esc(it.title)}</div><div class="st">${esc(it.artist)}</div></div><div class="d">${ad ? (pickMode ? '★ IN PICKS' : '✓ IN QUEUE') : fmt(it.dur)}</div></div>`;
    const bd = it.kind === 'album' ? '<span class="bd">ALBUM</span>' : '', rk = v.chart && i < 9 ? `<span class="rk">${i + 1}</span>` : '';
    return `<div class="cd${ad}" data-i="${i}"><div class="ar">${artOf(it)}${bd}${rk}<div class="inq">${pickMode ? '★ IN PICKS' : '✓ IN QUEUE'}</div></div><div class="tt">${esc(it.title)}</div><div class="st">${esc(it.artist)}</div></div>`;
  }
  const scard = (it, s, i, ids) => card(it, i, { cols: 3 }, ids).replace('data-i="' + i + '"', 'data-s="' + s + '" data-i="' + i + '"');
  function markAdded() {
    const v = viewing(); if (!v || !v.items) return; const ids = qIds();
    if (v.kind === 'shelves') { conEl.querySelectorAll('.cd[data-s]').forEach(c => { const it = (v.shelves[+c.dataset.s] || { items: [] }).items[+c.dataset.i]; if (it) c.classList.toggle('added', isAdded(it, ids)); }); return; }
    conEl.querySelectorAll('.cd[data-i]').forEach(c => { const it = v.items[+c.dataset.i]; if (it) { c.classList.toggle('added', isAdded(it, ids)); const d = c.querySelector('.d'); if (d && v.cols === 1) d.textContent = c.classList.contains('added') ? (pickMode ? '★ IN PICKS' : '✓ IN QUEUE') : fmt(it.dur); } });
  }
  function paintSug() {
    const show = searching() && sug.length && sugQ === q.trim() && !(viewing() && viewing().kind === 'artist');
    sgEl.style.display = show ? '' : 'none';
    if (!show) { if (zone === 'sug') zone = 'search'; return; }
    sgEl.innerHTML = sug.map((x, i) => `<div class="sgc${x.kind === 'artist' ? ' ar2' : ''}${zone === 'sug' && i === sugSel ? ' on' : ''}">${x.kind === 'artist' ? '👤 ' : '♪ '}${esc(x.label)}${x.sub ? ` <span>· ${esc(x.sub)}</span>` : ''}</div>`).join('');
  }
  function paintTop() {
    topEl.innerHTML = CHIPS.map((t, i) => `<div class="chip${!searching() && i === chip ? ' cur' : ''}${zone === 'chips' && i === chip ? ' on' : ''}">${t}</div>`).join('');
    const edit = zone === 'kb';
    sbEl.className = 'sb' + (zone === 'search' ? ' on' : '') + (edit ? ' typ' : '');
    sbEl.innerHTML = `<span class="gl">🔍</span><span class="tx${q ? '' : ' pl'}">${q ? esc(q) : 'Search songs, artists, albums'}</span><i></i>${pickMode ? '<span class="pp" style="background:#ffd04a;color:#3a2a00">★ PICKS</span>' : party ? '<span class="pp">🎉 PARTY</span>' : ''}<span class="mb">☰ Menu</span>`;
    const v = viewing();
    lblEl.innerHTML = pickMode ? `<span style="color:#ffd04a">★ Adding to Our Picks</span> <span>· ☰ Menu to finish</span>` : searching() ? `Results for “${esc(q.trim())}”` : v && v.kind === 'album' ? `${esc(v.title)} <span>· ${esc(v.sub || '')}</span>` : v && v.kind === 'artist' ? `${esc(v.title)} <span>· top songs &amp; albums</span>` : v && disc.length > 1 ? esc(v.title) : '';
    lblEl.style.display = lblEl.innerHTML ? '' : 'none';
    paintSug();
  }
  const nowInfo = () => {
    const np = window.mirrorNow ? window.mirrorNow() : null, cq = queue.items.find(x => x.n === queue.current);
    if (!np || !np.ok || !np.title) return null;
    return { title: np.title, artist: np.artist, album: np.album, art: np.art || (cq && cq.art) || '', playing: np.state === 'playing', dur: np.dur || 0, pos: window.mirrorPos ? mirrorPos() : (np.pos || 0) };
  };
  const curQ = () => queue.items.find(x => x.n === queue.current);
  function nowPage() {
    const n = nowInfo(), up = queue.items.filter(x => x.n > queue.current).slice(0, 4);
    if (!n) return '<div class="msg">Nothing playing<br><span style="font-size:28px;color:rgba(255,255,255,.5)">Pick something from Top Songs</span></div>';
    return `<div class="nowpg"><img class="big" src="${esc(n.art)}" alt=""><div class="t">${esc(n.title)}</div><div class="a">${esc(n.artist)}</div>
      <div class="np-pg" style="display:flex;align-items:center;gap:18px;width:760px;margin-top:22px;font-size:24px;font-weight:700;color:rgba(255,255,255,.7);font-variant-numeric:tabular-nums"><span class="pe">${fmt(n.pos)}</span><div class="pb" style="flex:1"><i></i></div><span class="pd">${fmt(n.dur)}</span></div>
      <div class="up"><h3>Up next</h3>${up.length ? `<div class="ur">${up.map(x => `<div class="uc">${x.art ? `<img src="${esc(x.art)}" alt="">` : '<div class="ph2"></div>'}<div>${esc(x.title)}</div></div>`).join('')}</div>` : '<div style="font-size:28px;color:rgba(255,255,255,.5);padding:0 10px">Nothing queued: pick a song from Top Songs</div>'}</div></div>`;
  }
  function paintContent() {
    if (!open) return;
    const v = viewing();
    if (!v) { conEl.innerHTML = ''; return; }
    if (v.kind === 'now') {
      const n = nowInfo(), sig = (n ? n.title + n.playing : '') + queue.items.map(x => x.id).join() + queue.current;
      if (sig !== nowSig || !conEl.firstChild) { nowSig = sig; conEl.innerHTML = nowPage(); if (n && n.art) el.style.setProperty('--art', `url("${n.art}")`); tickNow(); }
      return;
    }
    nowSig = '';
    if (v.kind === 'shelves' && !v.loading && !v.err && v.shelves.length) {
      const ids = qIds(); conEl.style.scrollBehavior = 'auto'; const keep = conEl.scrollTop;
      conEl.innerHTML = v.shelves.map((sh, si) => `<div class="shelf" data-s="${si}"><div class="sht">${esc(sh.title)}</div><div class="srow">${sh.items.map((it, i) => scard(it, si, i, ids)).join('')}</div></div>`).join('');
      conEl.scrollTop = keep; conEl.style.scrollBehavior = ''; selGrid(); return;
    }
    if (v.loading) { conEl.innerHTML = '<div class="msg"><div class="spin"></div></div>'; return; }
    if (v.err) { conEl.innerHTML = `<div class="msg">${esc(v.err)}</div>`; return; }
    if (!v.items.length) { conEl.innerHTML = '<div class="msg">Nothing here</div>'; return; }
    const head = v.kind === 'album' && v.art ? `<div style="display:flex;justify-content:center;padding:6px 0 18px"><img src="${esc(v.art)}" alt="" style="width:380px;height:380px;border-radius:30px;object-fit:cover;box-shadow:0 20px 50px rgba(0,0,0,.6)"></div>` : '';
    const ids = qIds();
    conEl.style.scrollBehavior = 'auto'; const keep = conEl.scrollTop;
    conEl.innerHTML = head + `<div class="grid${v.cols === 1 ? ' l' : ''}">${v.items.map((it, i) => card(it, i, v, ids)).join('')}</div>`;
    conEl.scrollTop = keep; conEl.style.scrollBehavior = '';
    selGrid();
  }
  function selGrid() {
    const v = viewing(); if (!v || v.kind === 'now') return;
    if (v.kind === 'shelves') {
      let on = null; conEl.querySelectorAll('.cd[data-s]').forEach(c => { const s = zone === 'grid' && +c.dataset.s === v.si && +c.dataset.i === v.sel; c.classList.toggle('on', s); if (s) on = c; });
      if (on) { const sh = on.closest('.shelf'), row = on.parentElement; conEl.scrollTop = Math.max(0, sh.offsetTop - 10); row.scrollLeft = Math.max(0, on.offsetLeft - 30); const it = v.items[v.sel]; if (it && it.art) el.style.setProperty('--art', `url("${it.art}")`); }
      return;
    }
    const cards = conEl.querySelectorAll('.cd'); let on = null;
    cards.forEach((c, i) => { const s = zone === 'grid' && i === v.sel; c.classList.toggle('on', s); if (s) on = c; });
    if (on) conEl.scrollTop = Math.max(0, on.offsetTop - conEl.clientHeight / 2 + on.offsetHeight / 2);
    const it = v.items && v.items[v.sel];
    if (it && it.art) el.style.setProperty('--art', `url("${it.art}")`);
  }
  const small = () => searching() || zone === 'kb';
  const qCenter = () => qTemp != null ? qTemp : zone === 'queue' ? qSel : Math.max(0, queue.items.findIndex(x => x.n === queue.current));
  function paintNp() {
    const n = nowInfo();
    npEl.innerHTML = n ? `${n.art ? `<img src="${esc(n.art)}" alt="">` : ''}<div class="nt"><div class="k${isPick(curQ()) ? ' op' : ''}">${isPick(curQ()) ? '★ OUR PICK · ' : ''}${n.playing ? '▶ NOW PLAYING' : '❚❚ PAUSED'}</div><div class="a">${esc(n.title)}</div><div class="b">${esc(n.artist)}</div><div class="pr"><span class="pe">${fmt(n.pos)}</span><div class="pb"><i></i></div><span class="pd">${fmt(n.dur)}</span></div></div>`
      : '<div class="nt"><div class="k">NOW PLAYING</div><div class="b" style="margin-top:8px">Nothing playing</div></div>';
    tickNow();
  }
  function tickNow() {                               // progress bars: re-measured every second from the player's own clock
    const n = nowInfo(); if (!n) return;
    el.querySelectorAll('.np .pb i, .np-pg .pb i, .fo .pb i').forEach(i => { i.style.width = (n.dur ? Math.min(100, n.pos / n.dur * 100) : 0) + '%'; });
    el.querySelectorAll('.np .pe, .np-pg .pe, .fo .pe').forEach(s => { s.textContent = fmt(n.pos); });
  }
  function paintQueue() {
    mqEl.className = 'mq' + (small() ? ' sm' : '') + (zone === 'queue' ? ' zn' : '') + (!searching() && viewing() && viewing().kind === 'now' ? ' nonp' : '');
    mqEl.style.setProperty('--cw', (small() ? 100 : 190) + 'px');
    paintNp();
    const sig = small() + '|' + queue.current + '|' + queue.items.map(x => x.id + x.n).join();
    if (sig !== qSig) {
      qSig = sig;
      cfwEl.innerHTML = queue.items.length
        ? `<div class="cf">${queue.items.map(it => `<div class="fc${it.n === queue.current ? ' cq' : ''}${it.n < queue.current ? ' past' : ''}${isPick(it) ? ' op' : ''}"><div class="ar">${artOf(it).replace(' loading="lazy"', '')}<span class="nm">${isPick(it) ? '★' : it.n === queue.current ? '▶' : it.n}</span></div></div>`).join('')}</div><div class="cc"></div>`
        : '<div class="qe">The queue is empty: pick a song above and it drops in here</div>';
    }
    placeCarousel();
  }
  function placeCarousel() {
    const cf = cfwEl.querySelector('.cf'); if (!cf) return;
    const cw = parseFloat(mqEl.style.getPropertyValue('--cw')) || 190, c = qCenter(), cards = cf.querySelectorAll('.fc');
    cards.forEach((card, i) => {
      const d = i - c, a = Math.abs(d), sg = Math.sign(d), x = d === 0 ? 0 : sg * (cw * .62 * (a - 1) + cw * 1.2), s = d === 0 ? 1.3 : Math.max(.5, 1 - .12 * a);
      card.style.transform = `translateX(${x}px) translateZ(${d === 0 ? 40 : -a * 30}px) rotateY(${-sg * (d === 0 ? 0 : 38)}deg) scale(${s})`;
      card.style.zIndex = 100 - a; card.style.opacity = a > 4 ? 0 : Math.max(.25, 1 - .14 * a);
      card.classList.toggle('on', zone === 'queue' && d === 0);
    });
    const it = queue.items[c], cc = cfwEl.querySelector('.cc');
    if (cc && it) cc.innerHTML = `${esc(it.title || 'Song')} <span>· ${esc(it.artist)}${it.by ? ' · ' : ''}${isPick(it) ? '<span class="op">★ Our Pick</span>' : esc(byText(it))}</span>`;
  }
  function paintKb() {
    kbEl.style.display = zone === 'kb' ? '' : 'none';
    if (zone !== 'kb') return;
    kbEl.innerHTML = KB.map((r, ri) => `<div class="kr">${[...r].map((c, ci) => `<div class="kk${ri === kbR && ci === kbC ? ' on' : ''}">${c}</div>`).join('')}${ri === KB.length - 1 ? ACTIONS.map((a, ai) => `<div class="kk ${a[2]}${kbR === KB.length - 1 && kbC === KB[ri].length + ai ? ' on' : ''}">${a[0]}</div>`).join('') : ''}</div>`).join('');
  }
  function paintLeg() {
    legEl.innerHTML = zone === 'kb' ? `<span>${k('◀▶▲▼')}Pick</span><span>${k('A')}Type</span><span>${k('X')}Delete</span><span>${k('Y')}Space</span><span>${k('B')}Done</span>`
      : zone === 'sug' ? `<span>${k('◀▶')}Pick</span><span>${k('A')}Go</span><span>${k('▼')}Results</span><span>${k('B')}Back</span>`
      : zone === 'queue' ? `<span>${k('◀▶')}Browse</span><span>${k('A')}Jump to</span><span>${k('X')}Remove</span><span>${k('B')}Back</span>`
      : zone === 'search' ? `<span>${k('A')}Type</span><span>${k('▲')}Filters</span><span>${k('B')}Back</span>`
      : zone === 'chips' ? `<span>${k('◀▶')}Browse</span><span>${k('▼')}Search</span><span>${k('B')}Back</span>`
      : `<span>${k('A')}${party ? 'Add to party' : 'Play'}</span><span>${k('X')}${party ? 'Add album / song' : 'Add to queue'}</span><span>${k('Y')}Play next</span><span>${k('☰')}Menu</span><span>${k('B')}Back</span>`;
  }
  function paintMenu() {
    menuEl.classList.toggle('on', zone === 'menu');
    if (zone !== 'menu') return;
    const items = { party: `<div class="ic">🎉</div><div class="x">Party mode<span class="sub">${party ? 'A song always plays: when the queue runs dry Our Picks fills in' : 'Off: a pick plays, then stops'}</span></div><div class="pill${party ? ' on' : ''}">${party ? 'ON' : 'OFF'}</div>`,
      pickmode: `<div class="ic">⭐</div><div class="x">Add to Our Picks<span class="sub">${pickMode ? 'On: A adds the highlighted song to Our Picks, not the queue' : 'Browse and add songs the party plays when nothing else is queued'}</span></div><div class="pill${pickMode ? ' on' : ''}" style="${pickMode ? 'background:#ffd04a;color:#3a2a00' : ''}">${pickMode ? 'ON' : 'OFF'}</div>`,
      picks: `<div class="ic">★</div><div class="x">Our Picks list<span class="sub">${picks.length ? picks.length + ' saved: remove any you are tired of' : 'Empty: the mirror curates songs from the charts for you'}</span></div><div class="chev" style="font-size:54px;color:rgba(255,255,255,.5)">›</div>`,
      guests: `<div class="ic">📱</div><div class="x">Guest requests<span class="sub">${guest.off ? 'Off: switched off until you turn it back on' : party ? (guest.here.length ? guest.here.length + ' here: ' + esc(guest.here.slice(0, 4).join(', ')) : 'On with Party mode: scan the code to join') : 'Ready: opens by itself when Party mode is on'}</span></div><div class="pill${guest.off ? '' : ' on'}">${guest.off ? 'OFF' : 'ON'}</div>`,
      edit: `<div class="ic">✏️</div><div class="x">Edit queue<span class="sub">${queue.items.length} in the queue: jump to a song or remove it</span></div><div class="chev" style="font-size:54px;color:rgba(255,255,255,.5)">›</div>`,
      close: '<div class="ic">✕</div><div class="x">Close menu</div>' };
    menuEl.innerHTML = `<h2>Menu</h2>${MENU.map((m, i) => `<div class="mi${i === menuSel ? ' on' : ''}">${items[m]}</div>`).join('')}<div style="flex:1"></div><div class="leg"><span>${k('A')}Select</span><span>${k('B')}Close</span></div>`;
  }
  function paintEdit() {
    editEl.classList.toggle('on', zone === 'edit');
    if (zone !== 'edit') return;
    const pk = edMode === 'picks', list = pk ? picks : queue.items; edSel = Math.max(0, Math.min(edSel, list.length - 1));
    const keep = editEl.querySelector('.ed') ? editEl.querySelector('.ed').scrollTop : 0;
    editEl.innerHTML = `<h2>${pk ? '★ Our Picks' : 'Edit queue' + (party ? ' 🎉' : '')}</h2><div class="ed">${list.length ? `<div class="grid l">${list.map((it, i) => `<div class="cd ls${!pk && it.n === queue.current ? ' cq' : ''}${i === edSel ? ' on' : ''}" data-i="${i}"><div class="ar">${artOf(it)}</div><div class="x"><div class="tt">${!pk && it.n === queue.current ? '▶ ' : isPick(it) ? '★ ' : ''}${esc(it.title || 'Song')}</div><div class="st">${esc(it.artist)}${!pk && it.by ? ' · ' + esc(byText(it)) : ''}</div></div><div class="d">${pk ? '★' : it.n}</div></div>`).join('')}</div>` : `<div class="msg">${pk ? 'No picks yet: the mirror curates from the charts. Use “Add to Our Picks” in the menu.' : 'The queue is empty'}</div>`}</div>
      <div class="leg">${pk ? '' : `<span>${k('A')}Jump to</span>`}<span>${k('X')}Remove</span><span>${k('B')}Back</span></div>`;
    const ed = editEl.querySelector('.ed'), on = ed.querySelector('.cd.on');
    ed.style.scrollBehavior = 'auto'; ed.scrollTop = keep; ed.style.scrollBehavior = '';
    if (on) ed.scrollTop = Math.max(0, on.offsetTop - ed.clientHeight / 2 + on.offsetHeight / 2);
  }
  // idle for 10 s: Now Playing takes the top half, the queue sits below it, any button goes back to discovery
  function paintFo() {
    const n = nowInfo(), cq = queue.items.findIndex(x => x.n === queue.current), up = queue.items.filter(x => x.n > queue.current).slice(0, 5), cur = curQ();
    const sig = (n ? n.title + n.playing : '') + queue.items.map(x => x.id).join() + queue.current;
    if (sig === foSig && foEl.firstChild) { tickNow(); return; }
    foSig = sig; const art = n && n.art ? n.art : (queue.items[cq] || {}).art || '';
    foEl.style.setProperty('--fart', `url("${art}")`);
    foEl.innerHTML = `<div class="bg2"></div><div class="sh2"></div><div class="ft"><div class="kick${isPick(cur) ? ' op' : ''}">${isPick(cur) ? '★ OUR PICK · ' : party ? '🎉 PARTY · ' : ''}${n ? (n.playing ? 'NOW PLAYING' : 'PAUSED') : 'NOTHING PLAYING'}</div>
      ${n ? `<img class="big" src="${esc(art)}" alt=""><div class="t">${esc(n.title)}</div><div class="a">${esc(n.artist)}</div><div class="pr"><span class="pe">${fmt(n.pos)}</span><div class="pb"><i></i></div><span class="pd">${fmt(n.dur)}</span></div>`
        : '<div class="t" style="margin-top:300px">Nothing playing</div><div class="a">Pick a song to get the party started</div>'}</div>
      <div class="fq"><h3>Up next${queue.items.length ? ` · ${queue.items.filter(x => x.n > queue.current).length} in line` : ''}</h3>${up.length ? `<div class="fr">${up.map((x, i) => `<div class="fc2${i === 0 ? ' nx' : ''}">${x.art ? `<img src="${esc(x.art)}" alt="">` : ''}<div>${esc(x.title)}<span>${x.by ? esc(byText(x)) : esc(x.artist)}</span></div></div>`).join('')}</div>` : '<div class="fe">The queue is empty: be the first to add a song</div>'}</div>
      <div class="fp"><div><b>★</b>Press any button to find music</div></div>${guestsOn() && qrFor(guest.url) ? `<div class="qrc" style="display:flex;bottom:170px"><img src="${qrFor(guest.url)}" alt=""><div>Scan to request a song<small>${guest.here.length ? guest.here.length + ' here' : 'phones on the Wi-Fi'}</small></div></div>` : ''}`;
    tickNow();
  }
  function showFo() { if (foOn) return; foOn = true; foSig = ''; foEl.classList.add('on'); el.classList.add('fo-on'); paintFo(); }
  function dismissFo() {                              // back to discovery: whatever search or album was open is dropped
    if (!foOn) return; foOn = false; foEl.classList.remove('on'); el.classList.remove('fo-on');
    q = ''; res = null; sug = []; sugQ = ''; clearTimeout(resT); while (disc.length > 1) disc.pop(); zone = 'grid'; openedAt = lastAct = performance.now(); paintAll();
  }
  setInterval(() => {
    if (!open) { if (foOn) { foOn = false; foEl.classList.remove('on'); el.classList.remove('fo-on'); } return; }
    if (foOn) { paintFo(); return; }
    if (performance.now() - lastAct > FOCUS_IDLE && zone !== 'menu' && zone !== 'edit' && zone !== 'guests' && performance.now() - openedAt > 3000) showFo();
  }, 1000);
  function paintGuests() {
    guestsEl.classList.toggle('on', zone === 'guests');
    if (zone !== 'guests') return;
    const E = guest.econ || {}, qr = qrFor(guest.url);
    guestsEl.innerHTML = `<h2>📱 Guest requests</h2><div class="gpn"><img class="qr${guest.off ? ' off' : ''}" src="${qr}" alt="">
      <div class="u">${guest.off ? 'Switched OFF' : esc(guest.url.replace('http://', '').replace(/\/$/, ''))}${!guest.off && guest.alt && guest.alt.length ? ' <span style="opacity:.6;font-weight:600">or ' + esc(guest.alt[0]) + '</span>' : ''}</div>
      <div class="hr">${guest.off ? 'Press A to turn it back on' : party ? (guest.here.length ? guest.here.length + ' here: ' + esc(guest.here.join(', ')) : 'Scan with a phone on the Wi-Fi') : 'Opens by itself when Party mode is on'}</div>
      <div class="r">Guests pick a name and a PIN, earn ${E.rate || 10} coins a minute while the page is open, and spend them: request ${E.request || 100} · bump to next ${E.bump || 250} · vote to skip ${E.voteskip || 50} (${E.voters || 3} votes) · skip now ${E.skipnow || 500}.<br>The controller is always free. These are the same coins as ${(window.OM_BRAND && OM_BRAND.slots) || 'King Hardy Slots'}.${guest.off || party ? '' : '<br><b style="color:#ffd04a">Party mode is off: requests are paused.</b>'}</div></div>
      <div class="leg"><span>${k('A')}${guest.off ? 'Turn on' : 'Switch off'}</span><span>${k('B')}Back</span></div>`;
  }
  function paintAll() { if (!open) return; qSig = ''; paintTop(); paintContent(); paintQueue(); paintKb(); paintLeg(); paintMenu(); paintEdit(); paintGuests(); }
  const focusPaint = () => { paintTop(); selGrid(); paintQueue(); paintKb(); paintLeg(); paintMenu(); paintEdit(); paintGuests(); };

  function show() {
    if (open) return;
    open = true; openedAt = lastAct = performance.now(); el.classList.add('on'); zone = 'grid';
    if (!disc.length) loadChip(chip);
    paintAll(); loadQueue();
  }
  function hide() { open = false; el.classList.remove('on'); }
  function pick() {                                  // Y from the screensaver (or any other channel): straight to the picker
    if (window.MirrorExternal) return;
    document.querySelectorAll('.app-overlay.active').forEach(a => { if (a !== overlay) a.classList.remove('active'); });
    overlay.classList.add('active'); if (typeof activeApp !== 'undefined') activeApp = 'app-music';
    if (open) { zone = 'grid'; openedAt = performance.now(); paintAll(); } else show();
  }
  window.MusicLib = { open: show, isOpen: () => open, pick };
  window.musicBack = () => {                         // B: one step back; true while the library has something to go back to
    if (!open) return false;
    if (foOn) { dismissFo(); return true; }
    if (performance.now() - openedAt < 300) return true;
    blip(300);
    if (zone === 'menu' || zone === 'edit' || zone === 'guests') { zone = zone === 'menu' ? 'grid' : 'menu'; paintAll(); return true; }
    if (zone === 'sug') { zone = 'kb'; paintAll(); return true; }
    if (zone === 'kb') { zone = searching() && res && res.items.length ? 'grid' : 'search'; paintAll(); return true; }
    if (zone === 'queue') { zone = 'grid'; paintAll(); return true; }
    if (searching()) { q = ''; res = null; zone = 'search'; paintAll(); return true; }
    if (q) q = '';
    if (disc.length > 1) { disc.pop(); zone = 'grid'; paintAll(); return true; }
    hide(); return true;
  };
  // nobody touching it: leave the search / the album and go back to the main discovery page (the screensaver follows later)
  setInterval(() => {
    if (!open || performance.now() - lastAct < SEARCH_IDLE) return;
    if (!(q || res || disc.length > 1 || zone === 'kb' || zone === 'search' || zone === 'sug')) return;
    q = ''; res = null; while (disc.length > 1) disc.pop(); if (zone === 'kb' || zone === 'search' || zone === 'sug' || zone === 'queue') zone = 'grid'; clearTimeout(resT); paintAll();
  }, 2000);
  setInterval(() => { if (open) tickNow(); }, 1000);

  // ---- input ----
  function gridMove(dx, dy) {
    const v = viewing(); if (!v || !v.items.length) { if (dy < 0) zone = 'search'; else if (dy > 0 && queue.items.length) zone = 'queue'; focusPaint(); return; }
    if (v.kind === 'shelves') {
      const sh = v.shelves[v.si];
      if (dx) sh.ci = Math.max(0, Math.min(sh.items.length - 1, sh.ci + dx));
      else if (dy < 0) { if (v.si === 0) zone = sgEl.style.display !== 'none' ? 'sug' : 'search'; else { v.si--; const t = v.shelves[v.si]; t.ci = Math.min(t.ci, t.items.length - 1); } }
      else if (dy > 0) { if (v.si < v.shelves.length - 1) { v.si++; const t = v.shelves[v.si]; t.ci = Math.min(t.ci, t.items.length - 1); } else if (queue.items.length) zone = 'queue'; }
      if (zone === 'queue') qSel = Math.max(0, queue.items.findIndex(x => x.n === queue.current));
      focusPaint(); blip(520); return;
    }
    const cols = v.cols || 3, n = v.items.length, r = Math.floor(v.sel / cols);
    if (dx) v.sel = Math.max(0, Math.min(n - 1, v.sel + dx));
    else if (dy < 0) { if (r === 0) { zone = sgEl.style.display !== 'none' ? 'sug' : 'search'; } else v.sel = Math.max(0, v.sel - cols); }
    else if (dy > 0) { if (v.sel + cols < n) v.sel += cols; else if (r < Math.floor((n - 1) / cols)) v.sel = n - 1; else if (queue.items.length) zone = 'queue'; }
    if (zone === 'queue') qSel = Math.max(0, queue.items.findIndex(x => x.n === queue.current));
    focusPaint(); blip(520);
  }
  function move(dx, dy) {
    if (zone === 'menu') { if (dy) { menuSel = (menuSel + dy + MENU.length) % MENU.length; paintMenu(); blip(520); } return; }
    if (zone === 'edit') { const n = (edMode === 'picks' ? picks : queue.items).length; if (dy && n) { edSel = Math.max(0, Math.min(n - 1, edSel + dy)); paintEdit(); blip(520); } return; }
    if (zone === 'chips') {
      if (dx) { q = ''; res = null; loadChip((chip + dx + CHIPS.length) % CHIPS.length); paintAll(); blip(520); }
      else if (dy > 0) { zone = 'search'; focusPaint(); blip(520); }
    } else if (zone === 'search') {
      if (dy < 0) zone = 'chips'; else if (dy > 0 && sgEl.style.display !== 'none') { zone = 'sug'; sugSel = 0; } else if (dy > 0) zone = (viewing() && viewing().items.length) ? 'grid' : queue.items.length ? 'queue' : 'search';
      if (zone === 'queue') qSel = Math.max(0, queue.items.findIndex(x => x.n === queue.current));
      focusPaint(); blip(520);
    } else if (zone === 'kb') {
      const last = KB.length - 1, len = r => KB[r].length + (r === last ? ACTIONS.length : 0);
      if (dy < 0) { if (kbR === 0) zone = sgEl.style.display !== 'none' ? 'sug' : 'search'; else { kbR--; kbC = Math.min(kbC, len(kbR) - 1); } }
      else if (dy > 0 && kbR < last) { kbR++; kbC = Math.min(kbC, len(kbR) - 1); }
      else if (dx) kbC = (kbC + dx + len(kbR)) % len(kbR);
      focusPaint(); blip(520);
    } else if (zone === 'sug') {
      if (dx) sugSel = Math.max(0, Math.min(sug.length - 1, sugSel + dx));
      else if (dy < 0) zone = 'search';
      else if (dy > 0) zone = (viewing() && viewing().items.length) ? 'grid' : 'kb';
      focusPaint(); blip(520);
    } else if (zone === 'queue') {
      if (dy < 0) zone = (viewing() && viewing().items.length) ? 'grid' : 'search';
      else if (dx) qSel = Math.max(0, Math.min(queue.items.length - 1, qSel + dx));
      focusPaint(); blip(520);
    } else gridMove(dx, dy);
  }
  function type(ch) { if (q.length < 40) { q += ch; scheduleSearch(); paintTop(); paintQueue(); } }
  function back() { if (q) { q = q.slice(0, -1); scheduleSearch(); paintTop(); paintQueue(); } }
  function kbPress() {
    const last = KB.length - 1;
    if (kbR === last && kbC >= KB[last].length) {
      const a = ACTIONS[kbC - KB[last].length][1];
      if (a === 'back') back(); else if (a === 'space') type(' '); else { zone = res && res.items.length ? 'grid' : 'search'; paintAll(); }
    } else type(KB[kbR][kbC]);
    blip(660, .05);
  }
  function menuPick() {
    const m = MENU[menuSel]; blip(880, .12);
    if (m === 'party') window.PartyMode.set(!party);
    else if (m === 'pickmode') { pickMode = !pickMode; zone = 'grid'; toast(pickMode ? '★ Pick mode: A adds songs to Our Picks' : 'Back to normal: A adds to the queue'); paintAll(); }
    else if (m === 'guests') { zone = 'guests'; loadGuest(); paintAll(); }
    else if (m === 'picks') { edMode = 'picks'; zone = 'edit'; edSel = 0; loadPicks(); paintAll(); }
    else if (m === 'edit') { edMode = 'queue'; zone = 'edit'; edSel = Math.max(0, queue.items.findIndex(x => x.n === queue.current)); loadQueue(); paintAll(); }
    else { zone = 'grid'; paintAll(); }
  }
  function enter() {
    if (zone === 'guests') { blip(880, .12); fetch('/guest/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: guest.off }) }).then(r => r.json()).then(j => { guest.open = j.open; guest.off = j.off; paintGuests(); paintMenu(); }).catch(() => {}); return; }
    if (zone === 'menu') return menuPick();
    if (zone === 'edit') { if (edMode === 'picks') return; const it = queue.items[edSel]; if (it) { blip(880, .12); queueAct('jump', it.n); } return; }
    if (zone === 'chips') { move(0, 1); return; }
    if (zone === 'search') { zone = 'kb'; focusPaint(); blip(660, .05); return; }
    if (zone === 'sug') { const x = sug[sugSel]; blip(880, .12); if (x.kind === 'artist') openArtist(x.q); else { q = x.q; sug = []; zone = 'grid'; scheduleSearch(); } return; }
    if (zone === 'kb') return kbPress();
    if (zone === 'queue') { const it = queue.items[qSel]; if (it && !it.temp) { blip(880, .12); queueAct('jump', it.n); } return; }
    const v = viewing(), it = v && v.items[v.sel]; if (!it) return;
    blip(880, .12);
    if (it.kind === 'artist') return openArtist(it.title);
    if (it.kind === 'genre') { const g = fresh('songs', it.title); g.chart = 'songs'; push(g, `/music/chart?kind=songs&genre=${it.id}`); }
    else play('now');
  }
  function openMenu() { if (zone === 'menu') { zone = 'grid'; } else { if (zone === 'edit') return; menuSel = 0; zone = 'menu'; loadQueue(); } blip(700, .08); paintAll(); }

  function openFrom() {                              // Y on the home screen (or from the player)
    if (window.MirrorExternal) return;
    if (!overlay.classList.contains('active')) {
      if (typeof activeApp !== 'undefined' && activeApp) return;       // another channel has the controller
      overlay.classList.add('active'); activeApp = 'app-music';
    }
    show();
  }
  window.addEventListener('keydown', e => {
    if (!open) { if ((e.key === 'y' || e.key === 'Y') && !e.repeat) openFrom(); return; }
    if (!isOpen()) { open = false; el.classList.remove('on'); return; }       // the channel was closed from elsewhere
    lastAct = performance.now();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.ctrlKey || e.altKey || e.metaKey || /^F\d+$/.test(key)) return;      // browser shortcuts (reload etc.) stay the browser's
    const typing = zone === 'kb' || zone === 'search';
    if (foOn) { if (['Escape', 'Backspace'].includes(key)) return; e.stopImmediatePropagation(); e.preventDefault(); dismissFo(); return; }      // any button: back to discovery
    if (['Escape', 'Backspace'].includes(key) && !(typing && key === 'Backspace')) return;    // the page's own B handler (window.musicBack)
    e.stopImmediatePropagation(); e.preventDefault();
    if (performance.now() - openedAt < 400) return;
    if (key === 'Tab' || key === 'ContextMenu') return openMenu();
    if (key === 'ArrowLeft') move(-1, 0); else if (key === 'ArrowRight') move(1, 0);
    else if (key === 'ArrowUp') move(0, -1); else if (key === 'ArrowDown') move(0, 1);
    else if (key === 'Enter') enter();
    else if (zone === 'menu' || zone === 'sug' || zone === 'guests') return;
    else if (zone === 'edit') { if (key === 'x') { if (edMode === 'picks') { const it = picks[edSel]; if (it) pickPost({ action: 'remove', id: it.id }).then(() => { markAdded(); paintEdit(); toast('Removed from Our Picks'); }).catch(() => {}); } else { const it = queue.items[edSel]; if (it) queueAct('remove', it.n); } } }
    else if (zone === 'kb' || zone === 'search') {
      if (key === 'Backspace' || (fromPad && key === 'x')) back();
      else if (fromPad && key === 'y' && zone === 'kb') type(' ');
      else if (fromPad) return;
      else if (key === ' ' || /^[a-z0-9'&-]$/.test(key)) { if (zone === 'search') { zone = 'kb'; focusPaint(); } type(key === ' ' ? ' ' : key); }
    } else if (zone === 'queue') { if (key === 'x') { const it = queue.items[qSel]; if (it && !it.temp) queueAct('remove', it.n); } }
    else if (zone === 'grid') { if (key === 'x') play('add'); else if (key === 'y') play('next'); }
  }, true);

  // activity for the idle timers is counted here, not from the page's own clock: a stick or trigger that rests off-centre keeps that one awake forever
  window.addEventListener('keydown', () => { lastAct = performance.now(); }, true);
  // controller X / Y / Start (the dashboard's pad module only sends the d-pad, A and B); Y also opens the library from the home screen and wakes the screensaver into it
  window.MirrorPadKey = key => { fromPad = true; try { window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); } finally { fromPad = false; } };     // X / Y as the controller sends them (the phone remote uses this)
  const was = {};
  (function padLoop() {
    const p = [...navigator.getGamepads()].find(x => x && x.connected && x.mapping === 'standard');
    const wasFo = foOn;
    if (p && foOn && p.buttons.some((b, i) => b.pressed && !was['a' + i]) ) dismissFo();
    if (p) p.buttons.forEach((b, i) => { if (b.pressed && !was['a' + i]) lastAct = performance.now(); was['a' + i] = b.pressed; });
    [[2, 'x'], [3, 'y'], [9, 'Tab']].forEach(([b, key]) => {
      const d = !!(p && p.buttons[b] && p.buttons[b].pressed);
      if (d && !was[b] && !window.MirrorExternal) {
        if (open) { if (!wasFo) { fromPad = true; window.dispatchEvent(new KeyboardEvent('keydown', { key })); fromPad = false; } }
        else if (key === 'y') { const I = window.MirrorIdle; (I && (I.saver && I.saver.active || performance.now() - I.wokeAt < 500)) ? pick() : openFrom(); }
      }
      was[b] = d;
    });
    requestAnimationFrame(padLoop);
  })();
  new MutationObserver(() => { if (open && !overlay.classList.contains('active')) hide(); }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

  // ---- screensaver pages (Party mode) ----
  // The posters' screensaver (index.html) asks for these: every other slide is a music page while Party mode is on, and a "now playing" pill sits
  // over the poster slides. Y wakes it straight into the picker.
  const upNext = () => queue.items.filter(x => x.n > queue.current);
  const sQr = () => guestsOn() && qrFor(guest.url) ? `<div class="qrs"><img src="${qrFor(guest.url)}" alt=""><div>Scan to request<small>${guest.here.length ? guest.here.length + ' here' : 'join from your phone'}</small></div></div>` : '';
  const sAd = () => {                                // the bottom strip of every music page: scan to join (or just "press Y" when guests are off)
    const qr = guestsOn() && qrFor(guest.url);
    return qr ? `<div class="msad qr"><img src="${qr}" alt=""><div>Scan to become the DJ<small>${guest.here.length ? guest.here.length + ' here · ' : ''}or press Y to pick</small></div></div>`
      : '<div class="msad"><div class="y">Y</div><div>Pick a song<small>Press Y on the controller to add yours</small></div></div>';
  };
  function sNow() {
    const n = nowInfo(), up = upNext().slice(0, 4), art = n ? n.art : '';
    return `<div class="ms" style="--a:url('${esc(art)}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="kick">🎉 Party mode · ${n ? (n.playing ? 'Now playing' : 'Paused') : 'The floor is open'}</div>
      ${n ? `<img class="big" src="${esc(art)}" alt=""><div class="t">${esc(n.title)}</div><div class="a">${esc(n.artist)}</div>
        ${n.dur ? `<div class="pb"><i style="--d:${n.dur}s;--o:-${n.pos.toFixed(1)}s;--ps:${n.playing ? 'running' : 'paused'}"></i></div>` : ''}`
        : '<div class="t" style="margin-top:300px">Nothing playing yet</div><div class="a">Be the first to pick a song</div>'}
      <div class="up"><h3>Up next</h3>${up.length ? `<div class="ur">${up.map(x => `<div class="uc"><img src="${esc(x.art)}" alt=""><div>${esc(x.title)}<span>${x.by ? esc(byText(x)) : esc(x.artist)}</span></div></div>`).join('')}</div>` : '<div style="font-size:34px;font-weight:600;color:rgba(255,255,255,.65)">Nothing queued: add yours</div>'}</div>
      </div>${sAd()}</div>`;
  }
  // more pages so the queue never feels like one repeating slide: now playing, the full queue, a "coming up" spotlight, what's trending right now
  // (a nudge to add something) and an artwork wall with the current song in the middle
  const trend = { songs: [], albums: [], at: 0 };
  function loadTrend() {
    if (Date.now() - trend.at < 30 * 60e3) return; trend.at = Date.now();
    Promise.all([api('/music/chart?kind=songs'), api('/music/chart?kind=albums')]).then(([s, a]) => { trend.songs = s; trend.albums = a; }).catch(() => { trend.at = 0; });
  }
  setTimeout(loadTrend, 4000);
  // facts about whatever is playing (proxy.py /music/facts: Wikipedia + iTunes + Deezer), fetched once per song
  const facts = {}, factKey = it => it ? (it.artist + '|' + it.title).toLowerCase() : '';
  function ensureFacts(it) {
    const k = factKey(it); if (!k || k in facts) return; facts[k] = null;
    fetch('/music/facts?artist=' + encodeURIComponent(it.artist || '') + '&title=' + encodeURIComponent(it.title || '') + '&id=' + encodeURIComponent(it.id || '')).then(r => r.json()).then(d => { facts[k] = d; }).catch(() => { delete facts[k]; });
  }
  const curFacts = () => { const n = nowInfo(), c = curQ(); return n ? facts[factKey({ artist: n.artist, title: n.title })] || facts[factKey(c)] || null : null; };
  const warmFacts = () => { const n = nowInfo(), c = curQ(); if (n) ensureFacts(Object.assign({ id: c && c.id }, n)); upNext().slice(0, 2).forEach(ensureFacts); };
  setInterval(() => { if (party) warmFacts(); }, 12000);
  const hue = s => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  function sFacts() {
    const f = curFacts(), n = nowInfo(); if (!f || !n) return sNow();
    const A = f.artist, yrs = f.year ? new Date().getFullYear() - f.year : 0, img = (A && A.img) || n.art;
    const chips = [f.year ? `Released ${f.year}${yrs > 0 ? ' · ' + yrs + ' yrs ago' : ''}` : '', f.genre, f.album && f.album !== n.title ? f.album : '', f.bpm ? f.bpm + ' BPM' : '', f.len ? Math.floor(f.len / 60) + ':' + String(f.len % 60).padStart(2, '0') : ''].filter(Boolean);
    return `<div class="ms facts" style="--a:url('${esc(n.art)}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="fk">Did you know?</div><img class="fi" src="${esc(img)}" alt=""><div class="fn">${esc((A && A.title.replace(/\s*\(.*\)/, '')) || n.artist)}</div>
      ${A ? `<div class="fb">${esc(A.blurb)}</div>` : ''}
      ${chips.length ? `<div class="fc">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      ${f.song ? `<div class="fs"><b>ABOUT “${esc(n.title.replace(/\s*[\(\[].*/, '').toUpperCase())}”</b>${esc(f.song.blurb.length > 260 ? f.song.blurb.slice(0, 257).replace(/\s+\S*$/, '') + '…' : f.song.blurb)}</div>` : ''}
      </div>${sAd()}</div>`;
  }
  // a music visualizer. The Sonos plays straight from Apple Music, so there is no audio here to analyse: this one is animated to the song's tempo
  // (Deezer's BPM when it has one) and coloured from the album art.
  function sViz() {
    const n = nowInfo(); if (!n) return sNow(); const f = curFacts() || {}, c = curQ() || {};
    return `<div class="ms viz" style="--a:url('${esc(n.art)}')"><canvas width="540" height="820" data-art="${esc(n.art)}" data-bpm="${f.bpm || 0}" data-seed="${esc(n.title + n.artist)}" data-playing="${n.playing ? 1 : 0}"></canvas>
      <div class="vt"><div class="vk">${isPick(c) ? '★ OUR PICK · ' : ''}NOW PLAYING</div><div class="vh">${esc(n.title)}</div><div class="va">${esc(n.artist)}</div></div>${sAd()}</div>`;
  }
  function vizStart(cv) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, bpm = +cv.dataset.bpm || 104, playing = cv.dataset.playing === '1';
    let h = hue(cv.dataset.seed), seed = h / 57, col = [255, 90, 138];
    const img = new Image(); img.src = cv.dataset.art;                    // drawn as-is (no CORS needed for that) ...
    const hs = hue(cv.dataset.seed); col = [Math.round(130 + 120 * Math.cos(hs * .0174)), Math.round(130 + 120 * Math.cos((hs + 120) * .0174)), Math.round(130 + 120 * Math.cos((hs + 240) * .0174))];     // (a colour from the title until the art's own is known)
    const cimg = new Image(); cimg.crossOrigin = 'anonymous';             // ... and a second copy, if the CDN allows it, for the dominant colour
    cimg.onload = () => { try { const t = document.createElement('canvas'); t.width = t.height = 8; const x = t.getContext('2d'); x.drawImage(cimg, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let best = 0;
      for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), sat = mx - mn; if (sat + mx / 4 > best) { best = sat + mx / 4; col = [d[i], d[i + 1], d[i + 2]]; } } } catch (e) {} };
    cimg.src = cv.dataset.art;
    const parts = Array.from({ length: 46 }, (_, i) => ({ x: (i * 97 % 100) / 100 * W, y: (i * 53 % 100) / 100 * H, r: 1.5 + (i % 5), v: .15 + (i % 7) / 14 }));
    const t0 = performance.now(), N = 120, cx = W / 2, cy = 330, R = 150;
    (function frame() {
      if (!cv.isConnected) return;
      const t = (performance.now() - t0) / 1000, ph = (t * bpm / 60) % 1, env = playing ? Math.pow(1 - ph, 2.6) : 0, [r, g, b] = col, c1 = `rgb(${r},${g},${b})`;
      ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
      const gl = ctx.createRadialGradient(cx, cy, 20, cx, cy, 380); gl.addColorStop(0, `rgba(${r},${g},${b},${.35 + .3 * env})`); gl.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, 760);
      parts.forEach(p => { p.y -= p.v * (1 + env * 2); if (p.y < -10) p.y = H + 10; ctx.fillStyle = `rgba(255,255,255,${.1 + .25 * env})`; ctx.beginPath(); ctx.arc(p.x + Math.sin(t + p.r) * 12, p.y, p.r, 0, 6.3); ctx.fill(); });
      const val = i => { const k = Math.min(i, N - i); return .2 + .8 * Math.abs(Math.sin(k * .43 + t * 1.9 + seed) * Math.sin(k * .13 - t * 1.1 + seed * 2)) * (playing ? .45 + .75 * env : .12); };
      ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = c1;
      for (let i = 0; i < N; i++) { const a = i / N * 6.2832 - 1.5708, len = 14 + val(i) * 120, r0 = R * (1 + .05 * env) + 14; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); ctx.stroke(); }
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R * (1 + .05 * env), 0, 6.3); ctx.clip(); if (img.complete && img.naturalWidth) ctx.drawImage(img, cx - R * 1.06, cy - R * 1.06, R * 2.12, R * 2.12); else { ctx.fillStyle = c1; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); } ctx.restore();
      const bars = 54, bw = (W - 40) / bars;
      for (let i = 0; i < bars; i++) { const v = (.15 + .85 * Math.abs(Math.sin(i * .52 + t * 2.3 + seed) * Math.cos(i * .21 - t * 1.4))) * (playing ? .35 + .85 * env : .1), bh = 12 + v * 210; ctx.fillStyle = `rgba(${r},${g},${b},${.35 + .55 * v})`; ctx.fillRect(20 + i * bw + 2, 668 - bh, bw - 4, bh); }
      requestAnimationFrame(frame);
    })();
  }
  function sWho() {
    const B = (guest.board || []).slice().sort((a, b) => (b.here - a.here) || (b.songs - a.songs) || (b.coins - a.coins)), here = B.filter(x => x.here).length, top = B.slice(0, 9), big = top.length <= 4;
    return `<div class="ms who" style="--a:url('${esc((nowInfo() || {}).art || '')}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="wk">🎉 THE GUEST LIST</div><div class="wh">${here ? here + ' ' + (here === 1 ? 'DJ is' : 'DJs are') + ' here' : 'Nobody here yet'}</div>
      ${top.length ? `<div class="wg" style="grid-template-columns:repeat(${big ? 2 : 3},1fr)">${top.map(p => `<div class="wp"><div class="wa${p.here ? '' : ' off'}" style="${big ? 'width:300px;height:300px;font-size:140px;' : ''}background:linear-gradient(135deg,hsl(${hue(p.name)} 80% 58%),hsl(${(hue(p.name) + 50) % 360} 75% 38%))">${esc(p.name[0].toUpperCase())}<i></i></div><div class="wn">${esc(p.name)}${p.admin ? ' ⭐' : ''}</div><div class="wcn">${p.coins.toLocaleString()} 🪙<small>${p.songs ? p.songs + ' song' + (p.songs === 1 ? '' : 's') : ''}</small></div></div>`).join('')}</div>`
        : '<div class="we">Be the first to join:<br>scan the code below!</div>'}</div>${sAd()}</div>`;
  }
  // what guests type on their phones, and the admin's question to the room
  const bubble = (mm, i, big) => `<div class="bb${i % 2 ? ' r' : ''}" style="--h:${hue(mm.name)}"><div class="bt"${big ? ' style="font-size:50px"' : ''}>${esc(mm.text)}</div><div class="bn">— ${esc(mm.name)}</div></div>`;
  function sSay() {
    const ms = (guest.wall || []).filter(x => !x.reply).slice(0, 5).reverse(); if (!ms.length) return sNow();
    return `<div class="ms say" style="--a:url('${esc((nowInfo() || {}).art || '')}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="sk">💬 LIVE FROM THE ROOM</div><div class="sh1">What people are saying</div><div class="sl">${ms.map((x, i) => bubble(x, i)).join('')}</div><div class="sq">Add yours: scan the code below</div></div>${sAd()}</div>`;
  }
  function sAsk() {
    const p = guest.prompt; if (!p) return sNow();
    const ans = (guest.wall || []).filter(x => x.reply && x.pid === p.id).slice(0, 4).reverse();
    return `<div class="ms say" style="--a:url('${esc((nowInfo() || {}).art || '')}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="sk">🎤 QUESTION FOR THE ROOM</div><div class="sh1" style="font-size:${p.text.length > 60 ? 70 : 90}px">${esc(p.text)}</div>
      ${ans.length ? `<div class="sl">${ans.map((x, i) => bubble(x, i)).join('')}</div>` : '<div class="sq" style="font-size:42px;margin-top:70px">No answers yet.<br>Scan the code and be the first!</div>'}
      ${ans.length ? '<div class="sq">Answer on your phone: scan the code below</div>' : ''}</div>${sAd()}</div>`;
  }
  function gridPage(head, sub, items, numbered) {
    const cols = items.length <= 4 ? 2 : items.length <= 9 ? 3 : 4, cap = cols * (cols === 4 ? 3 : cols === 3 ? 3 : 2), shown = items.slice(0, cap);
    return `<div class="ms" style="--a:url('${esc((shown[0] || {}).art || '')}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="hd">${head}<span>${sub}</span></div>
      <div class="qg" style="grid-template-columns:repeat(${cols},1fr)">${shown.map((x, i) => `<div class="qi${x.cur ? ' cur' : ''}"><img src="${esc(x.art)}" alt="">${x.cur ? '<span class="bdg">NOW</span>' : numbered ? `<span class="bdn">${x.rank || i + 1}</span>` : ''}<div class="tl">${esc(x.title)}</div><div class="by">${esc(x.artist)}${x.by ? ' · ' + esc(x.by) : ''}</div></div>`).join('')}</div>
      ${items.length > shown.length ? `<div class="more">+ ${items.length - shown.length} more</div>` : ''}</div>${sAd()}</div>`;
  }
  function sFull() {
    const items = queue.items.filter(x => x.n >= queue.current).map(x => Object.assign({}, x, { cur: x.n === queue.current, rank: x.n - queue.current + 1 }));
    return gridPage('The queue', `🎉 ${items.length} song${items.length === 1 ? '' : 's'} lined up`, items, true);
  }
  function sTrend() {
    const have = new Set(queue.items.map(x => String(x.id)));
    return gridPage('Trending right now', '🔥 Add one to the party', trend.songs.filter(x => !have.has(String(x.id))).slice(0, 9), true);
  }
  function sNext() {
    const [nx, ...rest] = upNext(); if (!nx) return sNow();
    return `<div class="ms" style="--a:url('${esc(nx.art)}')"><div class="bg"></div><div class="sh"></div><div class="w">
      <div class="kick">🎉 Coming up next</div><img class="big" src="${esc(nx.art)}" alt=""><div class="t">${esc(nx.title)}</div><div class="a">${esc(nx.artist)}</div>
      <div style="margin-top:14px;font-size:30px;font-weight:600;color:rgba(255,255,255,.65)">${nx.by ? esc(byText(nx)) : ''}</div>
      ${rest.length ? `<div class="up"><h3>After that</h3><div class="ur">${rest.slice(0, 3).map(x => `<div class="uc"><img src="${esc(x.art)}" alt=""><div>${esc(x.title)}<span>${esc(x.artist)}</span></div></div>`).join('')}</div></div>` : ''}
      </div>${sAd()}</div>`;
  }
  function sWall() {
    const n = nowInfo(), arts = [...new Set([...queue.items.map(x => x.art), ...trend.albums.map(x => x.art), ...trend.songs.map(x => x.art)].filter(Boolean))];
    if (arts.length < 6) return sNow();
    const tiles = Array.from({ length: 24 }, (_, i) => arts[i % arts.length]);
    return `<div class="ms" style="--a:url('${esc(n ? n.art : arts[0])}')"><div class="bg"></div><div class="wall">${tiles.map((a, i) => `<img src="${esc(a)}" alt="" style="animation-delay:${(i * 70) % 900}ms">`).join('')}</div><div class="sh"></div>
      <div class="w" style="justify-content:center;padding-top:0"><div class="wc">${n ? `<div class="kick">🎉 ${n.playing ? 'Now playing' : 'Paused'}</div><img src="${esc(n.art)}" alt="" style="margin-top:22px"><div class="t">${esc(n.title)}</div><div class="a">${esc(n.artist)}</div>` : '<div class="t">Pick a song</div>'}</div></div>${sAd()}</div>`;
  }
  // the advertisement: a poster of its own, not a sticker over the other pages
  function sDj() {
    const qr = qrFor(guest.url), n = nowInfo();
    return `<div class="ms dj"><div class="djbg"></div><i class="dn" style="left:8%;top:64%;animation-delay:0s">♪</i><i class="dn" style="left:84%;top:22%;animation-delay:1.2s">♫</i><i class="dn" style="left:12%;top:18%;animation-delay:2.1s">♬</i><i class="dn" style="left:88%;top:70%;animation-delay:.6s">♪</i><div class="w" style="padding-top:64px">
      <div class="djk">🎉 PARTY MODE</div>
      <div class="djh">SCAN THE<br>QR CODE</div>
      <div class="djq"><img src="${qr}" alt=""></div>
      <div class="djh2">BECOME THE DJ!</div>
      <div class="djs"><div><b>📱</b>Scan &amp; pick a name</div><div><b>🪙</b>Earn coins just by being here</div><div><b>🎶</b>Request songs, skip tracks</div></div>
      <div class="djn">${guest.here.length ? guest.here.length + ' here now · ' : ''}${n ? '▶ ' + esc(n.title) + ' · ' + esc(n.artist) : 'Add the first song'}</div></div></div>`;
  }
  let lastPage = '';
  window.MusicSaver = {
    on: () => party,
    refresh() { loadQueue(); loadTrend(); loadGuest(); warmFacts(); },
    after(slide) { const cv = slide.querySelector('.ms.viz canvas'); if (cv) vizStart(cv); },     // (the visualizer is a canvas: start it once the slide is in the page)
    html() {                                          // a different page each time, never the same twice in a row
      const have = { now: true, full: upNext().length + (queue.items.some(x => x.n === queue.current) ? 1 : 0) >= 3, next: upNext().length > 0, trend: trend.songs.length >= 4, dj: guestsOn() && !!qrFor(guest.url), who: guestsOn() && !!qrFor(guest.url), viz: !!nowInfo(), say: guestsOn() && (guest.wall || []).some(x => !x.reply), ask: guestsOn() && !!guest.prompt, facts: !!(curFacts() && (curFacts().artist || curFacts().song)), wall: trend.albums.length + queue.items.length >= 6 };
      const pages = Object.keys(have).filter(k => have[k] && k !== lastPage).flatMap(k => k === 'dj' || k === 'ask' ? [k, k] : [k]);     // the poster comes up twice as often
      const pick = pages[Math.floor(Math.random() * pages.length)] || 'now'; lastPage = pick;
      warmFacts();
      return { now: sNow, full: sFull, next: sNext, trend: sTrend, wall: sWall, dj: sDj, who: sWho, say: sSay, ask: sAsk, viz: sViz, facts: sFacts }[pick]();
    },
    bar() {
      if (!party) return '';
      const n = nowInfo();
      return `<div class="y">Y</div><div class="m"><span class="c">🎉</span> ${n ? esc(n.title) + ' <span>· ' + esc(n.artist) + '</span>' : 'Pick a song'}</div>`;
    },
    pick
  };
})();
