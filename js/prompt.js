// prompt.js — 프롬프트 조립 엔진
// 가이드라인 JSON + 사용자 입력 → system 프롬프트 조립 (스펙 §5)

// 가이드라인 컨텍스트 섹션(기본 정보/용어 규정/출제 불가/추가 출제 가능)을 lines에 추가.
// 생성·검토 프롬프트가 동일한 교육과정 제약을 공유하도록 재사용 (스펙 §5)
function pushGuidelineContext(lines, guideline) {
  const meta = guideline.meta || {};

  // [기본 정보]
  lines.push("[기본 정보]");
  lines.push("- 학년: " + (meta.grade || "(미지정)"));
  lines.push("- 단원: " + (meta.unit || "(미지정)"));
  lines.push("- 교육과정: " + (meta.curriculum || "(미지정)"));
  lines.push("");

  // [용어 규정]
  lines.push("[용어 규정]");
  lines.push("아래 용어 규정을 절대적으로 준수하십시오. 규정 위반은 절대 금지입니다. 괄호 안 ✗ 표시 용어는 어떤 경우에도 사용하지 마십시오.");
  (guideline.terms || []).forEach((t) => lines.push("- " + t));
  lines.push("");

  // [출제 불가]
  lines.push("[출제 불가]");
  lines.push("다음 내용은 출제하지 마십시오.");
  (guideline.forbidden || []).forEach((f) => lines.push("- " + f));
  lines.push("");

  // [추가 출제 가능]
  lines.push("[추가 출제 가능]");
  lines.push("다음 내용은 추가로 출제할 수 있습니다.");
  (guideline.extra || []).forEach((e) => lines.push("- " + e));
  lines.push("");
}

function buildGenerationPrompt(guideline, userInput) {
  const lines = [];

  lines.push("당신은 한국 중학교 과학 정기고사 출제를 돕는 전문 보조자입니다.");
  lines.push("");

  pushGuidelineContext(lines, guideline);

  // [난이도 상 전용] — difficulty가 "상"일 때만 포함
  const isAdvanced = userInput.difficulty === "상";
  if (isAdvanced && (guideline.advanced || []).length) {
    lines.push("[난이도 상 전용]");
    lines.push("난이도가 '상'이므로 아래 심화 내용을 적극 활용하고, 모든 문항의 난이도를 반드시 '상'으로 표기하십시오.");
    (guideline.advanced || []).forEach((a) => lines.push("- " + a));
    lines.push("");
  }

  // [문항 형식]
  lines.push("[문항 형식]");
  lines.push("- 발문은 명확하고 한 가지 정답만 도출되도록 작성합니다.");
  lines.push("- 선다형·합답형은 보기 5개(①~⑤)를 제시하고 정답은 하나입니다.");
  lines.push("- 합답형은 보기를 ㄱ·ㄴ·ㄷ 진술로 제시하고, 선택지는 그 조합(예: ㄱ, ㄴ)으로 구성합니다.");
  lines.push("- 서답형·서술형은 보기 없이 정답(모범답안)을 제시합니다.");
  lines.push("- 오답 선택지는 학생의 전형적 오개념을 반영합니다.");
  lines.push("- 요청 사항:");
  lines.push("  · 문항 유형: " + (userInput.type || "선다형"));
  lines.push("  · 난이도: " + (userInput.difficulty || "중"));
  if (userInput.concept && userInput.concept.trim()) {
    lines.push("  · 출제 개념: " + userInput.concept.trim());
  }
  lines.push("  · 문항 수: " + (userInput.count || 1) + "개");
  lines.push("");

  // [출력 형식]
  lines.push("[출력 형식]");
  lines.push("아래 JSON 스키마를 정확히 따르십시오.");
  lines.push('{ "questions": [ {');
  lines.push('  "type": "선다형", "difficulty": "중",');
  lines.push('  "stem": "발문", "choices": ["①...","②...","③...","④...","⑤..."],');
  lines.push('  "answer": "④", "explanation": "해설",');
  lines.push('  "distractor_intent": { "①": "오답 선택지의 출제 의도/오개념", "②": "..." }');
  lines.push("} ] }");
  lines.push("- 서답형·서술형은 보기가 없으므로 choices=[], answer에 정답 또는 모범답안을 넣고, distractor_intent={}로 둡니다.");
  lines.push("- 선다형·합답형은 각 오답 선택지마다 distractor_intent에 해당 기호와 출제 의도(오개념)를 기록합니다.");
  lines.push("- 오직 순수 JSON만 출력하십시오. 어떠한 설명문, 머리말, 마크다운 코드펜스(```)도 포함하지 마십시오.");

  return lines.join("\n");
}

// 생성 응답 파싱: ```json 펜스 및 앞뒤 산문 제거 후 첫 { ~ 마지막 } 추출하여 파싱
// 실패 시 { ok:false, raw } 폴백 (스펙 §5 "실패 시 원문 그대로 표시")
function parseGenerationResponse(text) {
  if (typeof text !== "string") return { ok: false, raw: String(text) };
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const slice = text.slice(start, end + 1);
    try {
      return { ok: true, data: JSON.parse(slice) };
    } catch {
      // fall through to fallback
    }
  }
  return { ok: false, raw: text };
}

// 검토 모드 프롬프트 (스펙 §4 탭2 + §5 검토 모드)
// - 응답은 마크다운 텍스트 (JSON 아님)
// - 첫 줄에 "오류 없음" / "오류 있음" 판정 강제, 이어서 근거, 마지막에 개선 제안(선택)
// - devilsAdvocate=true 시 이의제기 시뮬레이션(악마의 변호인) 관점으로 전환
function buildReviewPrompt(guideline, questionText, devilsAdvocate) {
  const lines = [];

  lines.push("당신은 한국 중학교 과학 정기고사 문항을 검토하는 전문 보조자입니다.");
  lines.push("아래 교육과정 제약(용어 규정·출제 불가 등)을 기준으로 문항의 오류를 엄정하게 검토합니다.");
  lines.push("");

  // 동일한 가이드라인 컨텍스트 재사용 (생성과 일관)
  pushGuidelineContext(lines, guideline);

  // [난이도 상 전용] — 검토에서는 심화 허용 범위 파악을 위해 항상 제공
  if ((guideline.advanced || []).length) {
    lines.push("[난이도 상 전용]");
    lines.push("다음은 난이도 '상' 문항에서만 허용되는 심화 내용입니다.");
    (guideline.advanced || []).forEach((a) => lines.push("- " + a));
    lines.push("");
  }

  // [검토 관점]
  if (devilsAdvocate) {
    lines.push("[검토 관점 — 악마의 변호인 모드]");
    lines.push("학생 또는 학부모가 이 문항에 이의를 제기한다고 가정하고, 이의제기 시뮬레이션 관점으로 검토하십시오.");
    lines.push("정답 시비, 보기의 모호성, 복수 정답 가능성, 발문 해석의 여지 등 논쟁의 소지가 있는 모든 지점을 빠짐없이 들추어 내십시오.");
    lines.push("이의제기에 타당한 근거가 하나라도 있으면 판정은 '오류 있음'입니다.");
  } else {
    lines.push("[검토 관점]");
    lines.push("용어 규정 위반, 출제 불가 내용 포함, 사실 오류, 복수 정답·정답 없음, 발문의 모호성을 중심으로 검토하십시오.");
  }
  lines.push("");

  // [검토 대상 문항]
  lines.push("[검토 대상 문항]");
  lines.push(questionText || "(문항 없음)");
  lines.push("");

  // [출력 형식] — 마크다운 텍스트, 판정 첫 줄 규칙 강제
  lines.push("[출력 형식]");
  lines.push("JSON이 아닌 마크다운 텍스트로 응답하십시오.");
  lines.push('첫 줄은 반드시 "오류 없음" 또는 "오류 있음" 중 하나의 판정만 단독으로 적으십시오. 다른 문구를 덧붙이지 마십시오.');
  lines.push("둘째 줄부터 판정의 근거를 구체적으로 서술하고, 마지막에 개선 제안을 선택적으로 덧붙이십시오.");
  lines.push("오류가 없는데 있는 것처럼 암시하는 표현 금지: 실제 오류가 없으면 망설이거나 에둘러 말하지 말고 '오류 없음'이라고 분명히 밝히십시오.");

  return lines.join("\n");
}
