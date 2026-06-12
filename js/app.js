// app.js — UI 로직, 상태 관리
const state = {
  units: [],        // index.json + 사용자 가이드라인 병합 목록
  guidelines: {}    // id → 가이드라인 JSON
};

// 현재 선택된 가이드라인 JSON 반환 (없으면 null)
function currentGuideline() {
  const id = Store.getSelectedUnit() || $("#unit-select")?.value;
  return id ? state.guidelines[id] || null : null;
}

const $ = (sel) => document.querySelector(sel);

// ---------- 탭 전환 ----------
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("#" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ---------- 설정 모달 ----------
function initSettings() {
  const modal = $("#settings-modal");
  const status = $("#settings-status");

  const modelSelect = $("#model-select");
  MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });

  $("#settings-btn").addEventListener("click", () => {
    $("#api-key-input").value = Store.getApiKey();
    modelSelect.value = Store.getModel() || DEFAULT_MODEL;
    status.textContent = "";
    status.className = "status";
    modal.showModal();
  });

  $("#settings-close").addEventListener("click", () => modal.close());

  $("#settings-save").addEventListener("click", async () => {
    const key = $("#api-key-input").value.trim();
    const model = modelSelect.value;
    if (!key) {
      status.textContent = "API 키를 입력해 주세요.";
      status.className = "status error";
      return;
    }
    status.textContent = "키 검증 중...";
    status.className = "status";
    try {
      await validateApiKey(key, model);
      Store.setApiKey(key);
      Store.setModel(model);
      status.textContent = "검증 성공 — 설정이 저장되었습니다.";
      status.className = "status ok";
    } catch (e) {
      status.textContent = "검증 실패 — " + e.message;
      status.className = "status error";
    }
  });
}

// ---------- 단원 로딩 ----------
async function loadUnits() {
  try {
    const res = await fetch("data/guidelines/index.json");
    const index = await res.json();
    for (const unit of index.units) {
      const g = await (await fetch("data/guidelines/" + unit.file)).json();
      state.guidelines[unit.id] = g;
      state.units.push({ ...unit, builtin: true });
    }
  } catch {
    $("#unit-select").innerHTML = "<option>단원 목록을 불러오지 못했습니다</option>";
    return;
  }

  // 사용자 가이드라인 병합 (M4에서 생성)
  for (const g of Store.getUserGuidelines()) {
    state.guidelines[g.id] = g;
    state.units.push({ id: g.id, label: g.meta?.unit || g.id, builtin: false });
  }

  const select = $("#unit-select");
  select.innerHTML = "";
  state.units.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.label + (u.builtin ? "" : " (사용자)");
    select.appendChild(opt);
  });

  const saved = Store.getSelectedUnit();
  if (saved && state.guidelines[saved]) select.value = saved;
  Store.setSelectedUnit(select.value);

  select.addEventListener("change", () => Store.setSelectedUnit(select.value));

  renderGuidelineList();
}

// ---------- 탭 3: 가이드라인 카드 ----------
function renderGuidelineList() {
  const list = $("#guideline-list");
  list.innerHTML = "";
  state.units.forEach((u) => {
    const g = state.guidelines[u.id];
    const card = document.createElement("div");
    card.className = "guideline-card";
    card.innerHTML = `
      <div class="card-head">
        <strong>${g.meta?.unit || u.label}</strong>
        <span class="badge">${u.builtin ? "내장" : "사용자"}</span>
      </div>
      <p class="card-meta">${g.meta?.grade || ""} · ${g.meta?.curriculum || ""}</p>
      <p class="card-meta">용어 규정 ${g.terms?.length || 0} · 출제 불가 ${g.forbidden?.length || 0} · 추가 출제 가능 ${g.extra?.length || 0} · 난이도 상 전용 ${g.advanced?.length || 0}</p>
    `;
    list.appendChild(card);
  });
}

// ---------- 탭 1: 문항 생성 ----------
function readGenInput() {
  return {
    type: $("#gen-type").value,
    difficulty: $("#gen-difficulty").value,
    concept: $("#gen-concept").value.trim(),
    count: Math.min(5, Math.max(1, parseInt($("#gen-count").value, 10) || 1))
  };
}

function initGenerate() {
  const btn = $("#gen-btn");
  btn.disabled = false;
  btn.removeAttribute("title");
  btn.textContent = "문항 생성";
  btn.addEventListener("click", () => runGeneration(readGenInput()));
  renderHistory();
}

// 단일 문항 평문 텍스트 (복사·검토 전달용)
function questionToText(q) {
  const parts = [];
  parts.push(q.stem || "");
  if (Array.isArray(q.choices) && q.choices.length) parts.push(q.choices.join("\n"));
  if (q.answer) parts.push("정답: " + q.answer);
  if (q.explanation) parts.push("해설: " + q.explanation);
  return parts.filter(Boolean).join("\n");
}

async function runGeneration(input) {
  const output = $("#gen-output");
  const btn = $("#gen-btn");

  const apiKey = Store.getApiKey();
  if (!apiKey) {
    output.innerHTML = '<p class="placeholder">API 키가 설정되지 않았습니다. 우측 상단 ⚙ 설정에서 키를 먼저 입력해 주세요.</p>';
    return;
  }

  const guideline = currentGuideline();
  if (!guideline) {
    output.innerHTML = '<p class="placeholder">단원(가이드라인)을 먼저 선택해 주세요.</p>';
    return;
  }

  const system = buildGenerationPrompt(guideline, input);
  const model = Store.getModel() || DEFAULT_MODEL;

  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = "생성 중...";
  output.innerHTML = '<p class="placeholder">문항을 생성하고 있습니다...</p>';

  try {
    const res = await callClaude({
      apiKey,
      model,
      system,
      messages: [{ role: "user", content: "문항을 생성해 주세요." }]
    });
    const text = res?.content?.map((b) => b.text || "").join("") || "";
    const parsed = parseGenerationResponse(text);

    const meta = { input, guidelineId: guideline.id, unitLabel: guideline.meta?.unit || guideline.id };
    renderGenerationResult(parsed, meta);

    Store.addHistory({ ...meta, parsed });
    renderHistory();
  } catch (e) {
    output.innerHTML = '<p class="placeholder">' + (e.message || "요청에 실패했습니다.") + "</p>";
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

// 파싱 결과 → 카드 렌더링 (실패 시 원문 <pre> 폴백)
function renderGenerationResult(parsed, meta) {
  const output = $("#gen-output");
  output.innerHTML = "";

  if (!parsed.ok) {
    const pre = document.createElement("pre");
    pre.className = "raw-fallback";
    pre.textContent = parsed.raw;
    output.appendChild(pre);
    return;
  }

  const questions = Array.isArray(parsed.data?.questions) ? parsed.data.questions : [];
  if (!questions.length) {
    output.innerHTML = '<p class="placeholder">생성된 문항이 없습니다.</p>';
    return;
  }
  questions.forEach((q, i) => output.appendChild(buildQuestionCard(q, i + 1, meta)));
}

function buildQuestionCard(q, num, meta) {
  const card = document.createElement("div");
  card.className = "q-card";

  const head = document.createElement("div");
  head.className = "q-head";
  head.innerHTML = `<strong>문항 ${num}</strong>` +
    `<span class="badge">${q.type || ""} · ${q.difficulty || ""}</span>`;
  card.appendChild(head);

  const sections = [];
  sections.push(section("발문", q.stem || ""));

  if (Array.isArray(q.choices) && q.choices.length) {
    const choicesHtml = q.choices.map((c) => `<li>${escapeHtml(c)}</li>`).join("");
    sections.push(`<div class="q-sec"><span class="q-label">보기</span><ul class="q-choices">${choicesHtml}</ul></div>`);
  }

  sections.push(section("정답", q.answer || ""));
  sections.push(section("해설", q.explanation || ""));

  const di = q.distractor_intent || {};
  const diKeys = Object.keys(di);
  if (diKeys.length) {
    const items = diKeys.map((k) => `<li><strong>${escapeHtml(k)}</strong> ${escapeHtml(di[k])}</li>`).join("");
    sections.push(`<div class="q-sec"><span class="q-label">오답별 출제 의도·오개념</span><ul class="q-distractors">${items}</ul></div>`);
  }

  const body = document.createElement("div");
  body.innerHTML = sections.join("");
  card.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "q-actions";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "복사";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(questionToText(q));
      copyBtn.textContent = "복사됨";
      setTimeout(() => (copyBtn.textContent = "복사"), 1500);
    } catch {
      copyBtn.textContent = "복사 실패";
      setTimeout(() => (copyBtn.textContent = "복사"), 1500);
    }
  });

  const regenBtn = document.createElement("button");
  regenBtn.textContent = "재생성";
  regenBtn.addEventListener("click", () => {
    // 이 카드의 파라미터로 1문항 재생성
    runGeneration({ ...(meta?.input || readGenInput()), count: 1 });
  });

  const reviewBtn = document.createElement("button");
  reviewBtn.textContent = "이 문항 검토하기";
  reviewBtn.addEventListener("click", () => {
    const ta = $("#review-input");
    if (ta) ta.value = questionToText(q);
    const tabBtn = document.querySelector('.tab-btn[data-tab="tab-review"]');
    if (tabBtn) tabBtn.click();
  });

  actions.append(copyBtn, regenBtn, reviewBtn);
  card.appendChild(actions);
  return card;
}

function section(label, value) {
  return `<div class="q-sec"><span class="q-label">${label}</span><div class="q-text">${escapeHtml(value)}</div></div>`;
}

// ---------- 탭 2: 문항 검토 ----------
function initReview() {
  const btn = $("#review-btn");
  btn.disabled = false;
  btn.removeAttribute("title");
  btn.textContent = "검토하기";
  btn.addEventListener("click", runReview);
}

// 응답 첫 비어있지 않은 줄을 판정으로 파싱
function parseVerdict(text) {
  const lines = String(text).split("\n");
  const first = (lines.find((l) => l.trim()) || "").trim();
  if (first.includes("오류 없음")) return "clean";
  if (first.includes("오류 있음")) return "error";
  return "unknown";
}

async function runReview() {
  const output = $("#review-output");
  const btn = $("#review-btn");

  const questionText = ($("#review-input").value || "").trim();
  if (!questionText) {
    output.innerHTML = '<p class="placeholder">검토할 문항을 먼저 붙여넣어 주세요.</p>';
    return;
  }

  const apiKey = Store.getApiKey();
  if (!apiKey) {
    output.innerHTML = '<p class="placeholder">API 키가 설정되지 않았습니다. 우측 상단 ⚙ 설정에서 키를 먼저 입력해 주세요.</p>';
    return;
  }

  const guideline = currentGuideline();
  if (!guideline) {
    output.innerHTML = '<p class="placeholder">단원(가이드라인)을 먼저 선택해 주세요.</p>';
    return;
  }

  const devil = !!$("#review-devil").checked;
  const system = buildReviewPrompt(guideline, questionText, devil);
  const model = Store.getModel() || DEFAULT_MODEL;

  btn.disabled = true;
  btn.textContent = "검토 중...";
  output.innerHTML = '<p class="placeholder">문항을 검토하고 있습니다...</p>';

  try {
    const res = await callClaude({
      apiKey,
      model,
      system,
      messages: [{ role: "user", content: "위 문항을 검토해 주세요." }]
    });
    const text = res?.content?.map((b) => b.text || "").join("") || "";
    renderReviewResult(text, devil);
  } catch (e) {
    output.innerHTML = '<p class="placeholder">' + (e.message || "요청에 실패했습니다.") + "</p>";
  } finally {
    btn.disabled = false;
    btn.textContent = "검토하기";
  }
}

// 판정 배지 + 마크다운 본문(줄바꿈 보존) 렌더링
function renderReviewResult(text, devil) {
  const output = $("#review-output");
  const verdict = parseVerdict(text);
  const labels = { clean: "오류 없음", error: "오류 있음", unknown: "판정 미상" };

  let html = '<div class="review-head">';
  html += `<span class="verdict-badge ${verdict}">${labels[verdict]}</span>`;
  if (devil) html += '<span class="devil-tag">악마의 변호인 모드</span>';
  html += "</div>";
  html += `<div class="review-body">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;

  output.innerHTML = html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- 생성 이력 패널 ----------
function renderHistory() {
  const panel = $("#gen-history");
  const list = Store.getHistory();
  panel.innerHTML = "<h2>생성 이력</h2>";
  if (!list.length) {
    panel.insertAdjacentHTML("beforeend", '<p class="placeholder">아직 생성 이력이 없습니다.</p>');
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "history-list";
  list.forEach((item) => {
    const li = document.createElement("li");
    const inp = item.input || {};
    const time = new Date(item.id).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    li.innerHTML = `<button class="history-item">${escapeHtml(item.unitLabel || "")}` +
      ` · ${escapeHtml(inp.type || "")} · ${escapeHtml(inp.difficulty || "")}` +
      `<span class="history-time">${time}</span></button>`;
    li.querySelector("button").addEventListener("click", () => {
      renderGenerationResult(item.parsed, { input: inp, guidelineId: item.guidelineId, unitLabel: item.unitLabel });
    });
    ul.appendChild(li);
  });
  panel.appendChild(ul);
}

// ---------- 초기화 ----------
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initSettings();
  initGenerate();
  initReview();
  loadUnits();
});
