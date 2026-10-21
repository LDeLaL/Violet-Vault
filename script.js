/* =========================================================
   Violet Vault - Main Application
   File: script.js
   Fixes: safe draw completion + module compatibility guards
   ========================================================= */
(function () {
  "use strict";

  let rolling = false;
  let autoTimer = null;
  let animationTimer = null;
  let animationFallbackTimer = null;
  let drawToken = 0;

  const $ = (id) => document.getElementById(id);
  const format = (n) => Number(n || 0).toLocaleString("ko-KR");

  function safe(label, callback, fallback = null) {
    try {
      return callback();
    } catch (error) {
      console.error(`[Violet Vault] ${label} 오류:`, error);
      return fallback;
    }
  }

  function state() {
    return window.SaveStore?.getState
      ? safe("상태 읽기", () => SaveStore.getState())
      : null;
  }

  function toast(message, type = "") {
    if (window.Effects?.toast) {
      return safe("알림 표시", () => Effects.toast(message, type));
    }

    if (window.VioletEffects?.toast) {
      return safe("알림 표시", () => VioletEffects.toast(message, type));
    }

    console.log(`[Violet Vault] ${message}`);
  }

  function rarityFor(prize) {
    if (window.Rarity?.get) {
      const value = safe("희귀도 확인", () => Rarity.get(prize));
      if (value) return value;
    }

    if (window.VioletRarity?.getRarityInfo) {
      const value = safe(
        "희귀도 확인",
        () => VioletRarity.getRarityInfo(prize)
      );

      if (value) {
        return {
          id: value.id || value.key || "common",
          name: value.name || value.label || "Common",
          label: value.label || value.name || "일반",
          description: value.description || "오늘의 행운을 확인해 봐.",
          color: value.color || "#a99bbf"
        };
      }
    }

    return (window.GAME_DATA?.rarities || []).find(
      (r) => prize >= r.min && prize <= r.max
    ) || {
      id: "common",
      name: "Common",
      label: "일반",
      description: "오늘의 행운을 확인해 봐."
    };
  }

  function syncDrawButtons() {
    if ($("draw-button")) $("draw-button").disabled = rolling;
    if ($("instant-button")) $("instant-button").disabled = rolling;
    if ($("auto-button")) $("auto-button").disabled = false;
  }

  function animationsEnabled() {
    const current = state();

    if (typeof current?.settings?.animations === "boolean") {
      return current.settings.animations;
    }

    if (typeof current?.settings?.animationsEnabled === "boolean") {
      return current.settings.animationsEnabled;
    }

    return true;
  }

  function applyTheme(theme) {
    const value = theme === "light" ? "light" : "dark";
    const root = document.documentElement;

    root.dataset.theme = value;
    root.dataset.violetTheme = value;
    root.style.colorScheme = value;

    root.classList.toggle("vv-theme-light", value === "light");
    root.classList.toggle("vv-theme-dark", value === "dark");
    root.classList.toggle("violet-theme-light", value === "light");
    root.classList.toggle("violet-theme-dark", value === "dark");

    document.body?.classList.toggle("vv-theme-light", value === "light");
    document.body?.classList.toggle("vv-theme-dark", value === "dark");
    document.body?.classList.toggle("violet-theme-light", value === "light");
    document.body?.classList.toggle("violet-theme-dark", value === "dark");
  }

  function applySettings() {
    const current = state();
    const settings = current?.settings || {};

    applyTheme(settings.theme || "dark");

    const effects = typeof settings.effectsEnabled === "boolean"
      ? settings.effectsEnabled
      : true;

    document.documentElement.classList.toggle(
      "vv-effects-disabled",
      !effects
    );

    document.body?.classList.toggle("vv-effects-disabled", !effects);

    document.documentElement.classList.toggle(
      "vv-animations-disabled",
      !animationsEnabled()
    );

    document.body?.classList.toggle(
      "vv-animations-disabled",
      !animationsEnabled()
    );

    if (window.VioletEffects?.setEnabled) {
      safe("효과 설정", () => VioletEffects.setEnabled(effects));
    }
  }

  window.UI = Object.assign(window.UI || {}, {
    openModal(title, kicker, content) {
      const backdrop = $("modal-backdrop");

      if (!backdrop || !$("modal-title") || !$("modal-content")) {
        toast("패널을 열 수 없어. 모달 요소를 확인해 줘.", "error");
        return;
      }

      $("modal-title").textContent = title || "패널";

      if ($("modal-kicker")) {
        $("modal-kicker").textContent = kicker || "VIOLET VAULT";
      }

      $("modal-content").innerHTML = content || "";
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      $("modal-close")?.focus();
    },

    closeModal() {
      $("modal-backdrop")?.classList.remove("open");
      $("modal-backdrop")?.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    },

    toast
  });

  function renderHistoryFallback(current) {
    const el = $("history-list");
    if (!el) return;

    const records = Array.isArray(current.history)
      ? current.history.slice(0, 4)
      : [];

    if (!records.length) {
      el.innerHTML =
        '<div class="history-empty"><span>◷</span> 뽑기를 시작하면 기록이 여기에 쌓여.</div>';
      return;
    }

    el.innerHTML = records.map((record) => {
      const prize = Number(
        record.prize ?? record.reward ?? record.amount ?? 0
      );

      const rarity = rarityFor(prize);
      const date = new Date(record.at || record.timestamp || Date.now());

      const time = Number.isNaN(date.getTime())
        ? "시간 정보 없음"
        : date.toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit"
          });

      return `
        <div class="history-row">
          <span class="history-icon">✦</span>
          <div class="history-main">
            <strong>${format(prize)}Q 당첨</strong>
            <small>${time} · 뽑기 비용 1Q</small>
          </div>
          <span class="history-amount">
            +${format(prize)}<small> Q</small>
          </span>
          <span class="history-chip rarity-${rarity.id || "common"}">
            ${rarity.name || "Common"}
          </span>
        </div>
      `;
    }).join("");
  }

  function renderAchievementFallback(current) {
    const el = $("achievement-strip");
    if (!el) return;

    const definitions = window.GAME_DATA?.achievements || [];
    const unlocked = Array.isArray(current.unlockedAchievements)
      ? current.unlockedAchievements
      : [];

    el.innerHTML = definitions.slice(0, 3).map((a) => {
      const done = unlocked.includes(a.id);

      return `
        <article class="achievement-card ${done ? "unlocked" : "locked"}">
          <span class="achievement-symbol">${a.icon || "✧"}</span>
          <div>
            <strong>${a.name || "업적"}</strong>
            <small>
              ${done ? "달성 완료" : (a.description || "계속 도전해 봐!")}
            </small>
          </div>
          <span class="achievement-lock">${done ? "✓" : "○"}</span>
        </article>
      `;
    }).join("");
  }

  function render() {
    const current = state();
    if (!current) return;

    if ($("balance-value")) {
      $("balance-value").textContent = format(current.balance);
    }

    if ($("draw-count")) {
      $("draw-count").textContent = `${format(current.totalDraws)}회`;
    }

    if ($("best-prize")) {
      $("best-prize").textContent = current.highestPrize
        ? `${format(current.highestPrize)}Q`
        : "—";
    }

    if ($("record-best")) {
      $("record-best").innerHTML = current.highestPrize
        ? `${format(current.highestPrize)} <small>Q</small>`
        : "— <small>Q</small>";
    }

    const codex = Array.isArray(current.codex) ? current.codex : [];

    if ($("record-codex")) {
      $("record-codex").innerHTML = `${codex.length} <small>/ 100</small>`;
    }

    if ($("codex-progress")) {
      $("codex-progress").style.width = `${Math.min(100, codex.length)}%`;
    }

    const achievements = Array.isArray(current.unlockedAchievements)
      ? current.unlockedAchievements
      : [];

    const definitions = window.GAME_DATA?.achievements || [];

    if ($("record-achievements")) {
      $("record-achievements").innerHTML =
        `${achievements.length} <small>/ ${definitions.length}</small>`;
    }

    if ($("achievement-progress")) {
      $("achievement-progress").style.width = `${
        definitions.length
          ? Math.min(100, achievements.length / definitions.length * 100)
          : 0
      }%`;
    }

    const last = $("last-win-content");

    if (last) {
      if (current.lastPrize) {
        const prize = Number(
          current.lastPrize.prize ?? current.lastPrize.amount ?? 0
        );

        const rarity = rarityFor(prize);

        last.innerHTML = `
          <div class="empty-orb win-icon">✦</div>
          <div>
            <strong class="last-win-value">${format(prize)}Q</strong>
            <span class="last-win-rarity rarity-${rarity.id || "common"}">
              ${rarity.name || "Common"}
            </span>
          </div>
        `;
      } else {
        last.innerHTML = `
          <div class="empty-orb">?</div>
          <div>
            <strong>아직 기록이 없어</strong>
            <p>첫 뽑기의 주인공이 되어봐.</p>
          </div>
        `;
      }
    }

    // 메인 버튼 상태를 먼저 갱신해 모듈 오류가 버튼에 영향을 주지 않도록 해.
    syncDrawButtons();

    const earned = $("earned-value");
    const spent = $("spent-value");
    const profit = $("profit-value");

    if (earned) {
      earned.innerHTML = `${format(current.totalEarned)} <small>Q</small>`;
    }

    if (spent) {
      spent.innerHTML = `${format(current.totalSpent)} <small>Q</small>`;
    }

    if (profit) {
      const net = Number(current.totalEarned || 0) -
        Number(current.totalSpent || 0);

      profit.innerHTML =
        `${net > 0 ? "+" : ""}${format(net)} <small>Q</small>`;

      profit.classList.toggle("positive", net >= 0);
      profit.classList.toggle("negative", net < 0);
    }

    if (window.Statistics?.renderHome) {
      safe("통계 홈", () => Statistics.renderHome());
    } else if (
      window.VioletStatistics?.render &&
      $("statistics-content")
    ) {
      safe("통계 홈", () => VioletStatistics.render(current));
    }

    if (window.HistoryPanel?.renderHome) {
      safe("최근 기록", () => HistoryPanel.renderHome());
    } else if (
      window.VioletHistory?.render &&
      $("history-content")
    ) {
      safe("최근 기록", () => VioletHistory.render(current));
    } else {
      safe("최근 기록", () => renderHistoryFallback(current));
    }

    if (window.Achievements?.renderStrip) {
      safe("업적 목록", () => Achievements.renderStrip());
    } else if (window.VioletAchievements?.renderPreview) {
      safe("업적 목록", () => VioletAchievements.renderPreview(current));
      safe("업적 목록 보완", () => renderAchievementFallback(current));
    } else {
      safe("업적 목록", () => renderAchievementFallback(current));
    }

    if (window.Rarity?.renderList) {
      safe("희귀도 목록", () => Rarity.renderList());
    } else if (window.VioletRarity?.renderList) {
      safe("희귀도 목록", () => VioletRarity.renderList());
    }
  }

  function updateResult(prize) {
    const r = rarityFor(prize);

    if ($("result-overline")) {
      $("result-overline").textContent = "YOUR NEXT FORTUNE";
    }

    if ($("result-number")) {
      $("result-number").textContent = format(prize);
    }

    if ($("result-rarity")) {
      $("result-rarity").textContent =
        `${String(r.name || "Common").toUpperCase()} · ${r.label || "일반"}`;

      $("result-rarity").className =
        `result-rarity rarity-${r.id || "common"}`;
    }

    if ($("result-caption")) {
      $("result-caption").textContent =
        r.description || "오늘의 행운을 확인해 봐.";
    }
  }

  function openBank() {
    if (window.Bank?.open) {
      return safe("은행 열기", () => Bank.open());
    }

    if (window.VioletBank?.open) {
      return safe("은행 열기", () => VioletBank.open());
    }

    toast("은행 패널을 불러올 수 없어.", "error");
  }

  function showFundsError() {
    toast(
      "잔액이 부족해! 보라 은행에서 무이자 대출을 이용할 수 있어.",
      "error"
    );

    openBank();
  }

  function clearAnimationTimers() {
    if (animationTimer !== null) {
      clearTimeout(animationTimer);
    }

    if (animationFallbackTimer !== null) {
      clearTimeout(animationFallbackTimer);
    }

    animationTimer = null;
    animationFallbackTimer = null;
  }

  function checkAchievements() {
    if (window.Achievements?.check) {
      return safe("업적 확인", () => Achievements.check());
    }

    if (window.VioletAchievements?.check) {
      safe("업적 확인", () => VioletAchievements.check(state()));
    }
  }

  function finishDraw(prize, token) {
    if (token !== drawToken || !rolling) return;

    let result = null;

    try {
      if (!window.Economy?.draw) {
        throw new Error("Economy.draw 함수를 찾을 수 없습니다.");
      }

      result = Economy.draw(prize);
    } catch (error) {
      console.error("[Violet Vault] 뽑기 처리 실패:", error);
      toast("뽑기 처리 중 오류가 발생했어. 다시 시도해 줘.", "error");
    } finally {
      // 핵심 수정: 성공하거나 실패하더라도 뽑기 잠금을 반드시 해제해.
      rolling = false;
      clearAnimationTimers();
      $("draw-card")?.classList.remove("is-rolling");
      syncDrawButtons();
    }

    if (!result?.ok) {
      if (result?.reason === "funds") {
        showFundsError();
      } else if (result?.reason === "invalid") {
        toast("뽑기 결과가 올바르지 않아. 다시 시도해 줘.", "error");
      }

      safe("실패 후 화면 갱신", render);
      return;
    }

    updateResult(prize);
    safe("화면 갱신", render);
    checkAchievements();

    if (animationsEnabled()) {
      if (window.Effects?.win) {
        safe("당첨 효과", () => Effects.win(prize));
      } else if (window.VioletEffects?.playWin) {
        safe("당첨 효과", () =>
          VioletEffects.playWin({
            amount: prize,
            rarity: rarityFor(prize)
          })
        );
      }
    }

    toast(
      prize >= 90 ? `대박! ${prize}Q 당첨!` : `${prize}Q 당첨!`,
      prize >= 90 ? "success" : ""
    );
  }

  function draw(instant = false) {
    if (rolling) return;

    if (!window.Economy?.canAfford || !window.Economy?.draw) {
      toast("경제 시스템을 불러올 수 없어. economy.js를 확인해 줘.", "error");
      return;
    }

    const data = window.GAME_DATA || {};

    const minPrize = Number.isFinite(Number(data.minPrize))
      ? Number(data.minPrize)
      : 1;

    const maxPrize = Number.isFinite(Number(data.maxPrize))
      ? Number(data.maxPrize)
      : 100;

    const cost = Number.isFinite(Number(data.drawCost))
      ? Number(data.drawCost)
      : 1;

    if (!Economy.canAfford(cost)) {
      stopAuto();
      showFundsError();
      return;
    }

    const prize = Math.floor(
      Math.random() * (maxPrize - minPrize + 1)
    ) + minPrize;

    const token = ++drawToken;
    const animate = !instant && animationsEnabled();

    // 저장 시스템이 화면을 갱신하기 전에 잠금을 걸어 중복 실행을 막아.
    rolling = true;
    syncDrawButtons();

    if (!animate) {
      finishDraw(prize, token);
      return;
    }

    $("draw-card")?.classList.add("is-rolling");

    const startedAt = performance.now();
    const duration = Math.max(
      250,
      Number(data.rollingDuration) || 1250
    );

    let finished = false;

    function finishOnce() {
      if (finished) return;
      finished = true;
      finishDraw(prize, token);
    }

    // 브라우저가 애니메이션 프레임을 멈추더라도 잠금이 무한히 유지되지 않도록 해.
    animationFallbackTimer = setTimeout(
      finishOnce,
      duration + 1800
    );

    function tick(now) {
      if (finished || token !== drawToken || !rolling) return;

      const progress = Math.min(
        1,
        (now - startedAt) / duration
      );

      const interval = progress < 0.7
        ? 65
        : progress < 0.9
          ? 110
          : 180;

      if ($("result-number")) {
        $("result-number").textContent = String(
          Math.floor(
            Math.random() * (maxPrize - minPrize + 1)
          ) + minPrize
        );
      }

      if (progress < 1) {
        animationTimer = setTimeout(() => {
          if (!finished && token === drawToken && rolling) {
            requestAnimationFrame(tick);
          }
        }, interval);
      } else {
        finishOnce();
      }
    }

    requestAnimationFrame(tick);
  }

  function startAuto() {
    if (autoTimer) {
      stopAuto();
      return;
    }

    const interval = Math.max(
      500,
      Number(window.GAME_DATA?.autoDrawInterval) || 1900
    );

    const cost = Number(window.GAME_DATA?.drawCost) || 1;

    if (!window.Economy?.canAfford || !Economy.canAfford(cost)) {
      showFundsError();
      return;
    }

    autoTimer = setInterval(() => {
      if (rolling) return;

      if (!window.Economy?.canAfford || !Economy.canAfford(cost)) {
        stopAuto();
        toast("잔액이 부족해서 자동 뽑기를 멈췄어.", "error");
        return;
      }

      draw(true);
    }, interval);

    const button = $("auto-button");

    if (button) {
      button.classList.add("auto-active");

      button.innerHTML =
        '<span class="button-icon">Ⅱ</span><span>자동 뽑기 중</span><small>중지</small>';

      button.setAttribute("aria-pressed", "true");
    }

    toast("자동 뽑기를 시작했어.");
  }

  function stopAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
    }

    autoTimer = null;

    const button = $("auto-button");

    if (button) {
      button.classList.remove("auto-active");

      button.innerHTML =
        '<span class="button-icon">⟳</span><span>자동 뽑기</span><small>반복</small>';

      button.setAttribute("aria-pressed", "false");
      button.disabled = false;
    }
  }

  function openHistoryFallback() {
    const current = state();
    if (!current) return;

    const records = Array.isArray(current.history)
      ? current.history
      : [];

    const content = records.length
      ? `
        <p class="modal-muted">저장된 뽑기 기록이 최신순으로 표시돼.</p>
        <div class="history-modal-list">
          ${records.map((record) => {
            const prize = Number(
              record.prize ?? record.reward ?? record.amount ?? 0
            );

            const r = rarityFor(prize);
            const date = new Date(
              record.at || record.timestamp || Date.now()
            );

            const time = Number.isNaN(date.getTime())
              ? "시간 정보 없음"
              : date.toLocaleString("ko-KR");

            return `
              <div class="table-row">
                <div>
                  <strong>
                    ${format(prize)}Q 당첨
                    <span class="tag">${r.name || "Common"}</span>
                  </strong>
                  <small>${time}</small>
                </div>
                <span class="row-value">+${format(prize)}Q</span>
              </div>
            `;
          }).join("")}
        </div>
      `
      : '<p class="modal-muted">아직 기록이 없어. 첫 뽑기를 하면 이곳에 내역이 쌓여.</p>';

    UI.openModal("뽑기 기록", "ACTIVITY", content);
  }

  function openStatisticsFallback() {
    const current = state();
    if (!current) return;

    const earned = Number(current.totalEarned || 0);
    const spent = Number(current.totalSpent || 0);
    const draws = Number(current.totalDraws || 0);
    const average = draws ? earned / draws : 0;

    const history = Array.isArray(current.history)
      ? current.history
      : [];

    const high = history.filter(
      (item) => Number(item.prize || 0) >= 50
    ).length;

    const highRate = history.length
      ? high / history.length * 100
      : 0;

    const debt = Number(current.bank?.debt || 0);

    const stockValue = (window.GAME_DATA?.stocks || []).reduce(
      (sum, meta) => {
        const holding = current.stocks?.[meta.id] || {};

        return sum +
          Number(holding.price || meta.initialPrice || 0) *
          Number(holding.shares || 0);
      },
      0
    );

    UI.openModal(
      "통계 센터",
      "YOUR STATISTICS",
      `
        <p class="modal-muted">저장된 플레이 기록을 기준으로 계산한 통계야.</p>

        <div class="modal-stat-grid">
          <div class="modal-stat">
            <span>총 수익</span>
            <strong>${format(earned)}<small> Q</small></strong>
          </div>

          <div class="modal-stat">
            <span>총 지출</span>
            <strong>${format(spent)}<small> Q</small></strong>
          </div>

          <div class="modal-stat">
            <span>순수익</span>
            <strong class="${earned >= spent ? "positive" : "negative"}">
              ${earned >= spent ? "+" : ""}${format(earned - spent)}<small> Q</small>
            </strong>
          </div>

          <div class="modal-stat">
            <span>평균 당첨금 / 회</span>
            <strong>${average.toFixed(1)}<small> Q</small></strong>
          </div>

          <div class="modal-stat">
            <span>뽑기 횟수</span>
            <strong>${format(draws)}<small> 회</small></strong>
          </div>

          <div class="modal-stat">
            <span>50Q 이상 비율*</span>
            <strong>${highRate.toFixed(1)}<small>%</small></strong>
          </div>

          <div class="modal-stat">
            <span>대출 잔액</span>
            <strong>${format(debt)}<small> Q</small></strong>
          </div>

          <div class="modal-stat">
            <span>주식 평가액</span>
            <strong>${format(stockValue)}<small> Q</small></strong>
          </div>
        </div>

        <div class="info-note">* 저장된 뽑기 기록 기준이야.</div>
      `
    );
  }

  function openSettingsFallback() {
    const current = state();
    if (!current) return;

    const settings = current.settings || {};
    const theme = settings.theme ||
      document.documentElement.dataset.theme ||
      "dark";

    const effects = typeof settings.effectsEnabled === "boolean"
      ? settings.effectsEnabled
      : true;

    const animations = typeof settings.animations === "boolean"
      ? settings.animations
      : true;

    UI.openModal(
      "설정",
      "PREFERENCES",
      `
        <p class="modal-muted">
          화면 환경을 설정할 수 있어. 변경 사항은 이 브라우저에 저장돼.
        </p>

        <div class="settings-row">
          <div>
            <strong>화면 테마</strong>
            <small>다크 모드와 라이트 모드를 선택해.</small>
          </div>

          <select id="setting-theme">
            <option value="dark" ${theme === "dark" ? "selected" : ""}>다크 모드</option>
            <option value="light" ${theme === "light" ? "selected" : ""}>라이트 모드</option>
          </select>
        </div>

        <div class="settings-row">
          <div>
            <strong>시각 효과</strong>
            <small>당첨 시 시각 효과를 사용해.</small>
          </div>

          <label class="switch">
            <input type="checkbox" id="setting-effects" ${effects ? "checked" : ""}>
            <span></span>
          </label>
        </div>

        <div class="settings-row">
          <div>
            <strong>뽑기 애니메이션</strong>
            <small>숫자가 빠르게 바뀌는 연출을 사용해.</small>
          </div>

          <label class="switch">
            <input type="checkbox" id="setting-animations" ${animations ? "checked" : ""}>
            <span></span>
          </label>
        </div>

        <div class="settings-actions">
          <button class="secondary-small" id="export-save" type="button">백업 파일</button>
          <button class="danger-small" id="reset-save" type="button">전체 데이터 초기화</button>
        </div>
      `
    );

    $("setting-theme")?.addEventListener("change", (e) => {
      SaveStore.update((s) => {
        s.settings.theme = e.target.value;
      });

      applySettings();
    });

    $("setting-effects")?.addEventListener("change", (e) => {
      SaveStore.update((s) => {
        s.settings.effectsEnabled = e.target.checked;
      });

      applySettings();
    });

    $("setting-animations")?.addEventListener("change", (e) => {
      SaveStore.update((s) => {
        s.settings.animations = e.target.checked;
      });

      applySettings();
    });

    $("export-save")?.addEventListener("click", exportData);

    $("reset-save")?.addEventListener("click", () => {
      if (confirm("정말 모든 데이터를 초기화할까? 이 작업은 되돌릴 수 없어.")) {
        SaveStore.reset();
        UI.closeModal();
        toast("데이터를 초기화했어.", "success");
      }
    });
  }

  function exportData() {
    const current = state();
    if (!current) return;

    const blob = new Blob(
      [JSON.stringify(current, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "violet-vault-backup.json";

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("백업 파일을 저장했어.", "success");
  }

  function openByName(name) {
    const actions = {
      codex: () => window.Codex?.open
        ? Codex.open()
        : (window.VioletCodex?.open
          ? VioletCodex.open()
          : toast("도감 패널을 불러올 수 없어.", "error")),

      bank: () => openBank(),

      stock: () => window.StockMarket?.open
        ? StockMarket.open()
        : (window.VioletStock?.open
          ? VioletStock.open()
          : toast("주식 패널을 불러올 수 없어.", "error")),

      statistics: () => window.Statistics?.open
        ? Statistics.open()
        : (window.VioletStatistics?.open
          ? VioletStatistics.open()
          : openStatisticsFallback()),

      history: () => window.HistoryPanel?.open
        ? HistoryPanel.open()
        : (window.VioletHistory?.open
          ? VioletHistory.open()
          : openHistoryFallback()),

      achievements: () => window.Achievements?.open
        ? Achievements.open()
        : (window.VioletAchievements?.open
          ? VioletAchievements.open()
          : toast("업적 패널을 불러올 수 없어.", "error")),

      settings: () => window.Settings?.open
        ? Settings.open()
        : (window.VioletSettings?.open
          ? VioletSettings.open()
          : openSettingsFallback())
    };

    if (!actions[name]) {
      toast("아직 준비 중인 메뉴야.");
      return;
    }

    safe(`${name} 패널 열기`, actions[name]);
  }

  // Use a compatible settings dialog if settings.js only exposes VioletSettings.
  if (!window.Settings?.open) {
    window.Settings = {
      open: openSettingsFallback,
      exportData
    };
  }

  function setup() {
    if (!window.SaveStore || !window.GAME_DATA) {
      console.error(
        "[Violet Vault] data.js와 save.js가 먼저 로드되어야 해."
      );
      return;
    }

    safe("저장 데이터 불러오기", () => SaveStore.load());

    const current = state();

    if (current?.lastPrize) {
      updateResult(
        Number(current.lastPrize.prize ?? current.lastPrize.amount ?? 0)
      );
    } else {
      updateResult(0);

      if ($("result-number")) {
        $("result-number").textContent = "—";
      }

      if ($("result-rarity")) {
        $("result-rarity").textContent = "READY TO DRAW";
        $("result-rarity").className = "result-rarity rarity-common";
      }

      if ($("result-caption")) {
        $("result-caption").textContent =
          "1Q부터 100Q까지, 오늘의 행운을 확인해 봐.";
      }
    }

    safe("초기 화면 렌더링", render);
    checkAchievements();
    applySettings();

    $("draw-button")?.addEventListener("click", () => draw(false));
    $("instant-button")?.addEventListener("click", () => draw(true));
    $("auto-button")?.addEventListener("click", startAuto);

    $("settings-open")?.addEventListener(
      "click",
      () => openByName("settings")
    );

    $("footer-reset")?.addEventListener(
      "click",
      () => openByName("settings")
    );

    $("modal-close")?.addEventListener(
      "click",
      () => UI.closeModal()
    );

    $("modal-backdrop")?.addEventListener("click", (e) => {
      if (e.target === $("modal-backdrop")) {
        UI.closeModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") UI.closeModal();
    });

    document.querySelectorAll("[data-open]").forEach((button) => {
      button.addEventListener(
        "click",
        () => openByName(button.dataset.open)
      );
    });

    safe("주식 데이터 초기화", () => SaveStore.update((s) => {
      (GAME_DATA.stocks || []).forEach((stock) => {
        if (!s.stocks[stock.id]) {
          s.stocks[stock.id] = {
            price: stock.initialPrice,
            previousPrice: stock.initialPrice,
            shares: 0,
            history: [stock.initialPrice]
          };
        }
      });
    }));

    if (window.StockMarket?.start) {
      safe("주식 시장 시작", () => StockMarket.start());
    } else if (window.VioletStock?.init) {
      safe("주식 시장 시작", () => VioletStock.init());
    }
  }

  window.addEventListener("game:data-changed", () => {
    safe("게임 상태 변경 렌더링", render);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }

  window.VioletVaultMain = {
    render,
    draw,
    startAuto,
    stopAuto,
    isRolling: () => rolling
  };
})();
