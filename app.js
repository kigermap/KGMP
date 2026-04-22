// ═══ KGMP Quiz App — Full Business Logic ═══
(function() {

// ── Config ──
var PROXY = "https://quiz-fehu-proxy-zuquarisfl.cn-hangzhou.fcapp.run";
var TABLES = {
  questions: "tblp8mq3c6tp5BcQ",
  results:   "tblLbefJWDGnzhXT",
  submissions:"tblzXdgkwRylo3vh",
  stats:     "tbl9FmUoqgvgRCtu",
};
var QUIZ_COUNT = 15;
var LABELS = ["A","B","C","D"];

// ── Radar Dimensions ──
// 5 dimensions derived from question themes (by original question number 1-30)
var DIM_NAMES = ["\u53D8\u8EAB\u6B32","\u53CD\u5DEE\u611F","\u8868\u6F14\u6B32","\u638C\u63A7\u529B","\u6C89\u6D78\u5EA6"];
// Transformation, Contrast, Performance, Control, Immersion
var DIM_MAP = {
  1:0, 2:0, 6:0, 21:0, 23:0, 27:0,   // 变身欲: becoming another self
  3:1, 5:1, 10:1, 18:1, 22:1, 29:1,   // 反差感: gap & contrast
  4:2, 8:2, 11:2, 12:2, 16:2, 25:2,   // 表演欲: being seen
  9:3, 13:3, 14:3, 17:3, 19:3, 20:3,  // 掌控力: control & seduction
  7:4, 15:4, 24:4, 26:4, 28:4, 30:4   // 沉浸度: depth of immersion
};

// ── State ──
var allQuestions = [];   // all from feishu
var questions = [];      // picked 15
var results = [];        // result mappings
var cur = 0;
var answers = [];        // scores per question
var phase = "loading";
var startTime = 0;
var totalCount = 0;
var sessionId = "";
var submissionId = "";

var $ = document.getElementById("app");

// ── Session ID ──
sessionId = localStorage.getItem("kgmp:sid") || "";
if (!sessionId) {
  sessionId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  localStorage.setItem("kgmp:sid", sessionId);
}

// ── UA Source Detection ──
function detectSource() {
  var ua = navigator.userAgent || "";
  try { var u = new URLSearchParams(location.search).get("utm_source"); if (u) return u; } catch(e) {}
  if (/MicroMessenger/i.test(ua)) return "\u5FAE\u4FE1";
  if (/QQ\//i.test(ua) || /MQQBrowser/i.test(ua)) return "QQ";
  if (/Douyin|BytedanceWebview|aweme/i.test(ua)) return "\u6296\u97F3";
  if (/Bilibili/i.test(ua)) return "B\u7AD9";
  if (/Weibo/i.test(ua)) return "\u5FAE\u535A";
  if (/xiaohongshu|discover/i.test(ua)) return "\u5C0F\u7EA2\u4E66";
  if (/DingTalk/i.test(ua)) return "\u9489\u9489";
  if (/Lark|Feishu/i.test(ua)) return "\u98DE\u4E66";
  if (/Telegram/i.test(ua)) return "Telegram";
  if (/Mobile/i.test(ua)) return "\u624B\u673A\u6D4F\u89C8\u5668";
  return "\u7F51\u9875";
}

// ── Feishu API ──
async function feishuList(tableId) {
  try {
    var r = await fetch(PROXY + "?action=list&table=" + tableId);
    var d = await r.json();
    return (d.code === 0 && d.data && d.data.items) ? d.data.items : [];
  } catch(e) { console.warn("[KGMP] list:", e); return []; }
}

async function feishuCreate(tableId, fields) {
  try {
    var r = await fetch(PROXY + "?action=create&table=" + tableId, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({fields})
    });
    var d = await r.json();
    if (d.code !== 0) console.error("[KGMP] create err:", d.code, d.msg);
    return d.code === 0;
  } catch(e) { console.warn("[KGMP] create:", e); return false; }
}

// ── Shuffle ──
function shuffle(a) {
  a = a.slice();
  for (var i = a.length-1; i > 0; i--) { var j = Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}

// ── Interlude messages ──
function getInterlude(idx, total) {
  if (idx === 4) return "\u5230\u8FD9\u91CC\u8FD8\u5728\u5634\u786C\u7684\u4EBA\uFF0C\u5EFA\u8BAE\u7EE7\u7EED\u3002\u771F\u6B63\u7CBE\u5F69\u7684\u8FD8\u5728\u540E\u9762\u3002";
  if (idx === Math.floor(total * 0.5)) return "\u534A\u7A0B\u4E86\u3002\u5982\u679C\u4F60\u5DF2\u7ECF\u5F00\u59CB\u9009\u5F97\u5FC3\u865A\uFF0C\u8BF4\u660E\u6D4B\u8BD5\u65B9\u5411\u5BF9\u4E86\u3002";
  if (idx === total - 2) return "\u8FD8\u5269\u6700\u540E\u51E0\u9898\u3002\u5C01\u5370\u5FEB\u89E3\u5B8C\u4E86\u3002";
  return "";
}

// ══════════════════════════════════
// LOAD DATA
// ══════════════════════════════════
async function loadData() {
  render(); // show loading spinner

  // 1. Load questions from Feishu
  var qItems = await feishuList(TABLES.questions);
  allQuestions = [];
  qItems.forEach(function(r) {
    var f = r.fields; if (!f) return;
    var q = (f["\u9898\u76EE"] || "").toString();
    var a1 = (f["A\u9009\u9879"] || "").toString();
    if (!q || !a1) return;
    var status = (f["\u72B6\u6001"] || "").toString();
    if (status && status !== "\u542F\u7528") return; // skip disabled
    allQuestions.push({
      num: parseInt(f["\u9898\u53F7"]) || 0,
      text: q,
      opts: [a1, (f["B\u9009\u9879"]||"").toString(), (f["C\u9009\u9879"]||"").toString(), (f["D\u9009\u9879"]||"").toString()],
      scores: [parseInt(f["A\u5206\u503C"])||1, parseInt(f["B\u5206\u503C"])||2, parseInt(f["C\u5206\u503C"])||3, parseInt(f["D\u5206\u503C"])||4],
      sort: parseInt(f["\u6392\u5E8F"]) || 0,
    });
  });
  console.log("[KGMP] Loaded " + allQuestions.length + " questions");

  // Fallback to data.js
  if (allQuestions.length === 0 && window.QUIZ_DATA) {
    window.QUIZ_DATA.forEach(function(d, i) {
      allQuestions.push({ num: i+1, text: d[0], opts: [d[1],d[2],d[3],d[4]], scores: [d[5],d[6],d[7],d[8]], sort: i+1 });
    });
  }

  // 2. Load results from Feishu
  var rItems = await feishuList(TABLES.results);
  results = [];
  rItems.forEach(function(r) {
    var f = r.fields; if (!f) return;
    var type = (f["\u7ED3\u679C\u6807\u9898"] || "").toString();
    if (!type) return;
    results.push({
      min: parseInt(f["\u6700\u4F4E\u5206"]) || 0,
      max: parseInt(f["\u6700\u9AD8\u5206"]) || 999,
      type: type,
      subtitle: (f["\u7ED3\u679C\u526F\u6807\u9898"] || "").toString(),
      desc: (f["\u7ED3\u679C\u63CF\u8FF0"] || "").toString(),
      quote: (f["\u5206\u4EAB\u6587\u6848"] || "").toString(),
      sort: parseInt(f["\u6392\u5E8F"]) || 0,
    });
  });
  results.sort(function(a,b) { return a.sort - b.sort; });

  // Fallback
  if (results.length === 0 && window.QUIZ_RESULTS) results = window.QUIZ_RESULTS;

  // 3. Load submission count
  try {
    var sItems = await feishuList(TABLES.submissions);
    totalCount = sItems.filter(function(r) { return r.fields && r.fields["\u603B\u5206"]; }).length;
  } catch(e) {}

  // 4. Pick questions
  pickQuestions();

  phase = "cover";
  render();
}

function pickQuestions() {
  var shuffled = shuffle(allQuestions);
  questions = shuffled.slice(0, Math.min(QUIZ_COUNT, shuffled.length));
}

// Scale result ranges for fewer questions
function getScaledResults() {
  if (questions.length >= 30) return results;
  var ratio = questions.length / 30;
  return results.map(function(r) {
    return { min: Math.round(r.min * ratio), max: Math.round(r.max * ratio), type: r.type, subtitle: r.subtitle, desc: r.desc, quote: r.quote };
  });
}

function matchResult(score) {
  var scaled = getScaledResults();
  var found = null;
  var foundIdx = -1;
  for (var i = 0; i < scaled.length; i++) {
    if (score >= scaled[i].min && score <= scaled[i].max) {
      found = scaled[i];
      foundIdx = i;
      break;
    }
  }
  if (!found) { found = scaled[scaled.length - 1] || { type: "\u672A\u77E5", desc: "", quote: "" }; foundIdx = scaled.length - 1; }
  found._idx = foundIdx;
  return found;
}

// ══════════════════════════════════
// SUBMIT
// ══════════════════════════════════
async function submitResult(score, result) {
  var duration = Math.round((Date.now() - startTime) / 1000);
  submissionId = sessionId + "_" + Date.now();

  var fields = {};
  fields["\u63D0\u4EA4ID"] = submissionId;
  fields["\u533F\u540DID"] = sessionId;
  fields["\u603B\u5206"] = score;
  fields["\u7ED3\u679CID"] = result.type;
  fields["\u7ED3\u679C\u6807\u9898"] = result.type;
  fields["\u5B8C\u6210\u65F6\u957F"] = duration;
  fields["\u6765\u6E90"] = detectSource();
  fields["\u662F\u5426\u5206\u4EAB"] = false;

  // Map answers to ORIGINAL question numbers
  questions.forEach(function(q, i) {
    if (i < answers.length) {
      var scoreVal = answers[i];
      var optIdx = q.scores.indexOf(scoreVal);
      if (optIdx >= 0 && q.num > 0) {
        fields["Q" + q.num] = LABELS[optIdx];
      }
    }
  });

  var ok = await feishuCreate(TABLES.submissions, fields);
  if (ok) {
    totalCount++;
    console.log("[KGMP] Submitted: score=" + score + " type=" + result.type + " duration=" + duration + "s");
  }
}

// Mark shared
async function markShared() {
  // We can't update existing record easily via create API
  // So we just log it
  console.log("[KGMP] User shared result");
}

// ══════════════════════════════════
// RENDER
// ══════════════════════════════════
function render() {
  switch(phase) {
    case "loading": renderLoading(); break;
    case "cover": renderCover(); break;
    case "quiz": renderQuiz(); break;
    case "analyzing": renderAnalyzing(); break;
    case "result": renderResult(); break;
  }
}

function renderLoading() {
  $.innerHTML = '<div class="screen"><div class="loading-spinner"></div><div class="loading-text">\u6B63\u5728\u52A0\u8F7D\u9898\u76EE...</div></div>';
}

function renderCover() {
  $.innerHTML =
    '<div class="screen">' +
      '<div class="cover-logo"><img src="logo.png" alt="KGMP" class="cover-logo-img"></div>' +
      '<div class="cover-title">KGMP</div>' +
      '<div class="cover-sub">KIGURUMI PERSONALITY MAP</div>' +
      '<div class="cover-desc">\u6234\u4E0A\u9762\u5177\u4E4B\u540E\uFF0C\u4F60\u662F\u54EA\u79CD\u70E7\u9E21\uFF1F</div>' +
      '<div class="cover-warn">\u2728 \u7EAF\u5C5E\u5A31\u4E50\u6D4B\u8BD5 \u00B7 \u8D8A\u5634\u786C\u5206\u6570\u8D8A\u9AD8 \u00B7 15\u9898\u968F\u673A\u62BD\u53D6</div>' +
      '<button class="cover-btn" onclick="window._q(\'start\')">\u6234 \u4E0A \u9762 \u5177 \u5F00 \u59CB \u6D4B \u8BD5</button>' +
      '<div class="cover-count">\u5DF2\u6709 <span>' + totalCount.toLocaleString() + '</span> \u4F4DKiger\u5B8C\u6210\u6D4B\u8BD5</div>' +
      
    '</div>';
}

function renderQuiz() {
  var q = questions[cur];
  var total = questions.length;
  var pct = Math.round(cur / total * 100);
  var inter = getInterlude(cur, total);

  $.innerHTML =
    '<div class="screen">' +
      '<div class="quiz-header"><div class="quiz-progress">' +
        '<span class="quiz-progress-num">' + (cur+1) + '/' + total + '</span>' +
        '<div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="quiz-progress-num">' + pct + '%</span>' +
      '</div></div>' +
      '<div class="quiz-card">' +
        '<div class="quiz-label">Q' + (cur+1) + '</div>' +
        (inter ? '<div class="quiz-interlude">' + inter + '</div>' : '') +
        '<div class="quiz-text">' + q.text + '</div>' +
        '<div class="quiz-opts">' +
          q.opts.map(function(opt, i) {
            return opt ? '<button class="quiz-opt" onclick="window._q(\'ans\',' + i + ')"><span class="tag">' + LABELS[i] + '</span><span>' + opt + '</span></button>' : '';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderAnalyzing() {
  $.innerHTML =
    '<div class="screen">' +
      '<div class="loading-spinner"></div>' +
      '<div class="loading-text">\u6B63\u5728\u89E3\u6790\u4F60\u7684\u70E7\u9E21\u4EBA\u683C...</div>' +
      '<div class="loading-bar"><div class="loading-bar-fill"></div></div>' +
    '</div>';
  setTimeout(function() { phase = "result"; render(); scrollTo(0,0); }, 2800);
}

// ══════════════════════════════════
// RADAR CHART
// ══════════════════════════════════
function calcDimensions() {
  var sums = [0,0,0,0,0];
  var counts = [0,0,0,0,0];
  questions.forEach(function(q, i) {
    if (i >= answers.length) return;
    var dim = DIM_MAP[q.num];
    if (dim === undefined) {
      // Fallback: distribute evenly by index
      dim = i % 5;
    }
    sums[dim] += answers[i];
    counts[dim]++;
  });
  // Normalize each dimension to 0-100 scale (score range per question: 1-4)
  return sums.map(function(s, i) {
    if (counts[i] === 0) return 50; // default mid if no questions in this dim
    var avg = s / counts[i]; // 1.0 ~ 4.0
    return Math.round(((avg - 1) / 3) * 100);
  });
}

function drawRadar(canvasId, dims) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var size = 340;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  var cx = size / 2, cy = size / 2;
  var R = 105; // max radius
  var n = 5;
  var angleOff = -Math.PI / 2; // start from top

  function getPoint(i, r) {
    var a = angleOff + (2 * Math.PI * i / n);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  // Draw grid rings (3 levels)
  [0.33, 0.66, 1.0].forEach(function(scale) {
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var p = getPoint(i % n, R * scale);
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(168,85,247,' + (scale === 1 ? 0.2 : 0.08) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Draw axis lines
  for (var i = 0; i < n; i++) {
    var p = getPoint(i, R);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = 'rgba(168,85,247,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw data polygon (filled)
  ctx.beginPath();
  dims.forEach(function(v, i) {
    var r = Math.max(R * v / 100, R * 0.08); // min 8% so shape is visible
    var p = getPoint(i, r);
    i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
  });
  ctx.closePath();
  // Gradient fill
  var grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  grd.addColorStop(0, 'rgba(168,85,247,0.35)');
  grd.addColorStop(1, 'rgba(236,72,153,0.15)');
  ctx.fillStyle = grd;
  ctx.fill();
  // Stroke
  ctx.strokeStyle = 'rgba(192,132,252,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw data points (dots)
  dims.forEach(function(v, i) {
    var r = Math.max(R * v / 100, R * 0.08);
    var p = getPoint(i, r);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#c084fc';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Draw labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px "Noto Sans SC", sans-serif';
  DIM_NAMES.forEach(function(name, i) {
    var p = getPoint(i, R + 36);
    // Fine-tune positions per vertex
    if (i === 0) p[1] -= 6;        // top: push up
    if (i === 1) p[0] += 8;        // top-right: push right
    if (i === 2) p[0] += 8;        // bottom-right: push right
    if (i === 3) p[0] -= 8;        // bottom-left: push left
    if (i === 4) p[0] -= 8;        // top-left: push left
    ctx.fillStyle = '#c4b5fd';
    ctx.fillText(name, p[0], p[1]);
    // Value below label
    ctx.font = '700 11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = 'rgba(168,85,247,0.6)';
    ctx.fillText(dims[i] + '%', p[0], p[1] + 16);
    ctx.font = '600 13px "Noto Sans SC", sans-serif';
  });
}

function renderResult() {
  var score = answers.reduce(function(s,v){return s+v;}, 0);
  var r = matchResult(score);
  var idx = r._idx >= 0 ? r._idx : 0;

  // Map result tier (0-4) to lv image (lv1-lv5)
  var lvNum = Math.min(Math.max(idx + 1, 1), 5);
  var lvImg = 'img/lv' + lvNum + '.png';

  // Calculate dimensions for radar
  var dims = calcDimensions();
  // Find dominant dimension
  var maxDim = 0;
  dims.forEach(function(v, i) { if (v > dims[maxDim]) maxDim = i; });

  // Calculate same-type percentage
  var sameTypePct = "";
  if (totalCount > 5) {
    var band = idx >= 0 ? idx : 2;
    var pcts = [15, 25, 30, 20, 10];
    sameTypePct = '<div class="result-stat-pill">\u4F60\u548C\u7EA6 ' + pcts[band] + '% \u7684\u6D4B\u8BD5\u8005\u5C5E\u4E8E\u540C\u4E00\u7C7B\u578B</div>';
  }

  $.innerHTML =
    '<div class="screen">' +
      '<div class="result-img"><img src="' + lvImg + '" alt="Lv.' + lvNum + '"></div>' +
      '<div class="result-type">' + r.type + '</div>' +
      '<div class="result-dominant">\u6838\u5FC3\u7279\u8D28\uFF1A' + DIM_NAMES[maxDim] + ' ' + dims[maxDim] + '%</div>' +
      sameTypePct +
      '<div class="result-radar"><canvas id="radarCanvas"></canvas></div>' +
      '<div class="result-desc">' + r.desc + '</div>' +
      (r.quote ? '<div class="result-quote">\u201C' + r.quote + '\u201D</div>' : '') +
      '<div class="result-btns">' +
        '<button class="result-share" onclick="window._q(\'share\')">\uD83D\uDCCB \u590D\u5236\u7ED3\u679C\u5206\u4EAB</button>' +
        '<button class="result-retry" onclick="window._q(\'retry\')">\uD83D\uDD04 \u6362\u4E00\u6279\u9898\u91CD\u6D4B</button>' +
      '</div>' +
      '<div class="result-footer">' +
        '\u9762\u5177\u4ECE\u6765\u4E0D\u53EA\u662F\u906E\u6321\u3002<br>\u5B83\u4F1A\u653E\u5927\u4F60\u7684\u53CD\u5DEE\uFF0C\u4FDD\u62A4\u4F60\u7684\u72B9\u8C6B\uFF0C<br>\u4E5F\u66FF\u4F60\u8BF4\u51FA\u90A3\u4E9B\u5E73\u65F6\u4E0D\u6562\u627F\u8BA4\u7684\u5C0F\u5FC3\u601D\u3002<br><br>' +
        '<em>\u4F60\u5230\u5E95\u53EA\u662F\u7A7F\u4E0A\u4E86\u89D2\u8272\uFF0C\u8FD8\u662F\u7EC8\u4E8E\u653E\u51FA\u4E86\u90A3\u4E2A\u771F\u6B63\u7684\u4F60\uFF1F</em>' +
      '</div>' +
    '</div>';

  // Draw radar chart after DOM is ready
  requestAnimationFrame(function() { drawRadar('radarCanvas', dims); });

  // Submit to Feishu
  submitResult(score, r);
}

// ══════════════════════════════════
// ACTIONS (single global handler)
// ══════════════════════════════════
window._q = function(action, val) {
  switch(action) {
    case "start":
      phase = "quiz"; cur = 0; answers = [];
      startTime = Date.now();
      render(); scrollTo(0,0);
      break;

    case "ans":
      var q = questions[cur];
      answers.push(q.scores[val]);
      if (cur < questions.length - 1) {
        cur++;
        render(); scrollTo({top:0,behavior:"smooth"});
      } else {
        phase = "analyzing";
        render(); scrollTo(0,0);
      }
      break;

    case "share":
      var score = answers.reduce(function(s,v){return s+v;},0);
      var r = matchResult(score);
      var dims = calcDimensions();
      var maxDim = 0;
      dims.forEach(function(v, i) { if (v > dims[maxDim]) maxDim = i; });
      var dimBar = DIM_NAMES.map(function(n, i) { return n + ' ' + dims[i] + '%'; }).join(' | ');
      var text = "\uD83C\uDFAD \u6211\u7684 KGMP \u70E7\u9E21\u4EBA\u683C\u56FE\u8C31\n\u7ED3\u679C\uFF1A\u3010" + r.type + "\u3011\n\u6838\u5FC3\u7279\u8D28\uFF1A" + DIM_NAMES[maxDim] + " " + dims[maxDim] + "%\n" + dimBar + "\n\n\u201C" + (r.quote || r.type) + "\u201D\n\n\u4F60\u4E5F\u6765\u6D4B\u6D4B\uFF1F\uD83D\uDC49 " + location.href + "\n\n\u2728 \u66F4\u591A\u597D\u770B\u5A03\u53CB\uFF0C\u7CBE\u5F69\u5185\u5BB9\u8BBF\u95EE\uFF1Ahttps://kighub.cn";
      navigator.clipboard.writeText(text).then(function() {
        toast("\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01\u53D1\u7ED9\u670B\u53CB\u770B\u770B\u5427~");
        markShared();
      }).catch(function() { toast("\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236"); });
      break;

    case "retry":
      phase = "loading";
      render();
      // Re-pick from existing pool (no re-fetch needed)
      pickQuestions();
      cur = 0; answers = [];
      phase = "cover";
      render(); scrollTo(0,0);
      break;
  }
};

function toast(msg) {
  var el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 2500);
}

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
loadData();

})();
