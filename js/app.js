// app.js — UI 로직, 상태 관리
const state = {
  units: [],        // index.json + 사용자 가이드라인 병합 목록
  guidelines: {}    // id → 가이드라인 JSON
};

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

// ---------- 초기화 ----------
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initSettings();
  loadUnits();
});
