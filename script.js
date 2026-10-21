/* =========================================================
   VIOLET VAULT — Main Application (script.js)
   Works with the supplied index.html, save.js and economy.js
   ========================================================= */
(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);
    const DATA = window.VioletVaultData || {};
    const GAME_DATA = window.GAME_DATA || {
        minPrize: DATA.MIN_REWARD ?? 1,
        maxPrize: DATA.MAX_REWARD ?? 100,
        drawCost: DATA.DRAW_COST ?? 1,
        autoDrawInterval: DATA.AUTO_DRAW_DELAY ?? 1000,
        rarities: DATA.RARITIES || [],
        achievements: DATA.ACHIEVEMENTS || [],
        stocks: DATA.STOCKS || []
    };

    let rolling = false;
    let autoTimer = null;
    let animationTimer = null;
    let animationFallbackTimer = null;
    let drawToken = 0;
    let modalPanel = null;
    let setupDone = false;

    function safe(label, callback, fallback = null) {
        try {
            return callback();
        } catch (error) {
            console.error(`[Violet Vault] ${label} 오류:`, error);
            return fallback;
        }
    }

    function state() {
        if (window.SaveStore?.getState) {
            return safe("상태 읽기", () => window.SaveStore.getState());
        }
        if (window.VioletVaultSave?.getState) {
            return safe("상태 읽기", () => window.VioletVaultSave.getState());
        }
        return window.VioletVaultApp?.state || null;
    }

    function fmt(value) {
        const number = Number(value);
        return (Number.isFinite(number) ? number : 0).toLocaleString("ko-KR");
    }

    function q(value) {
        return `${fmt(value)} Q`;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[c]);
    }

    function saveState() {
        const current = state();
        if (!current) return false;
        if (window.SaveStore?.save) return window.SaveStore.save(current);
        if (window.VioletVaultSave?.save) return window.VioletVaultSave.save(current);
        return false;
    }

    function changed() {
        try {
            window.dispatchEvent(new CustomEvent("game:data-changed", {
                detail: { state: state() }
            }));
        } catch (error) {
            console.warn("[Violet Vault] 상태 변경 알림 실패:", error);
        }
    }

    function styleToastStack(stack) {
        if (!stack) return;
        Object.assign(stack.style, {
            position: "fixed",
            right: "22px",
            bottom: "22px",
            zIndex: "20000",
            width: "min(340px, calc(100vw - 32px))",
            display: "flex",
            flexDirection: "column",
            gap: "9px",
            pointerEvents: "none"
        });
    }

    function toast(title, message = "", type = "") {
        const stack = $("toast-stack");
        styleToastStack(stack);

        if (!stack) {
            console.log(`[Violet Vault] ${title} ${message}`);
            return;
        }

        const item = document.createElement("div");
        item.className = `toast ${type}`.trim();

        Object.assign(item.style, {
            padding: "13px 16px",
            border: "1px solid rgba(192,132,252,.42)",
            borderRadius: "11px",
            background: "rgba(22,13,35,.97)",
            color: "#f5efff",
            boxShadow: "0 8px 30px rgba(0,0,0,.28)",
            fontSize: "12px",
            lineHeight: "1.65",
            overflowWrap: "anywhere"
        });

        if (message) {
            const heading = document.createElement("strong");
            heading.textContent = String(title || "Violet Vault");
            heading.style.cssText = "display:block;color:#c084fc;margin-bottom:3px";

            const body = document.createElement("div");
            body.textContent = String(message);

            item.append(heading, body);
        } else {
            item.textContent = String(title);
        }

        stack.appendChild(item);
        window.setTimeout(() => item.remove(), 3800);
    }

    function rarityFor(amount) {
        if (window.VioletRarity?.getRarityInfo) {
            const result = safe(
                "희귀도 확인",
                () => window.VioletRarity.getRarityInfo(Number(amount))
            );
            if (result) return result;
        }

        if (typeof DATA.getRarityByAmount === "function") {
            const result = DATA.getRarityByAmount(Number(amount));
            if (result) return result;
        }

        const rarities = Array.isArray(GAME_DATA.rarities)
            ? GAME_DATA.rarities
            : [];

        return rarities.find((r) =>
            Number(amount) >= Number(r.min) &&
            Number(amount) <= Number(r.max)
        ) || {
            id: "common",
            name: "Common",
            label: "일반",
            description: "오늘의 행운을 확인해 봐.",
            className: "rarity-common",
            color: "#aaa2bb"
        };
    }

    function rarityClass(rarity) {
        return String(rarity?.id || rarity?.key || "common")
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "") || "common";
    }

    function applyTheme(theme) {
        const value = theme === "light" ? "light" : "dark";

        document.documentElement.dataset.theme = value;
        document.documentElement.dataset.violetTheme = value;
        document.documentElement.style.colorScheme = value;

        document.documentElement.classList.toggle(
            "vv-theme-light", value === "light"
        );
        document.documentElement.classList.toggle(
            "vv-theme-dark", value === "dark"
        );

        document.body?.classList.toggle(
            "light-theme", value === "light"
        );
        document.body?.classList.toggle(
            "vv-theme-light", value === "light"
        );
        document.body?.classList.toggle(
            "vv-theme-dark", value === "dark"
        );
        document.body?.classList.toggle(
            "violet-theme-light", value === "light"
        );
        document.body?.classList.toggle(
            "violet-theme-dark", value === "dark"
        );
    }

    function animationsEnabled() {
        const settings = state()?.settings || {};

        if (typeof settings.animationsEnabled === "boolean") {
            return settings.animationsEnabled;
        }
        if (typeof settings.animations === "boolean") {
            return settings.animations;
        }

        return true;
    }

    function applySettings() {
        const settings = state()?.settings || {};

        applyTheme(settings.theme || "dark");

        const effects = typeof settings.effectsEnabled === "boolean"
            ? settings.effectsEnabled
            : true;

        const animations = animationsEnabled();

        document.documentElement.classList.toggle(
            "vv-effects-disabled", !effects
        );
        document.body?.classList.toggle(
            "vv-effects-disabled", !effects
        );
        document.documentElement.classList.toggle(
            "vv-animations-disabled", !animations
        );
        document.body?.classList.toggle(
            "vv-animations-disabled", !animations
        );

        if (window.VioletEffects?.setEnabled) {
            safe(
                "효과 설정",
                () => window.VioletEffects.setEnabled(effects)
            );
        }
    }

    /* ------------------------ Main modal ------------------------ */

    function styleModal() {
        const backdrop = $("modal-backdrop");
        const panel = backdrop?.querySelector(".modal-window");

        if (!backdrop) return;

        Object.assign(backdrop.style, {
            position: "fixed",
            inset: "0",
            zIndex: "9998",
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(3,1,7,.82)",
            backdropFilter: "blur(8px)",
            webkitBackdropFilter: "blur(8px)",
            overflowY: "auto"
        });

        if (panel) {
            Object.assign(panel.style, {
                position: "relative",
                zIndex: "1",
                width: "min(100%, 920px)",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "24px",
                border: "1px solid rgba(192,132,252,.48)",
                borderRadius: "18px",
                background: "linear-gradient(145deg,#1a102a,#0d0815)",
                color: "#f5efff",
                boxShadow: "0 25px 80px rgba(0,0,0,.5),0 0 45px rgba(126,34,206,.18)"
            });
        }

        const header = backdrop.querySelector(".modal-header");

        if (header) {
            Object.assign(header.style, {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                marginBottom: "20px"
            });
        }

        if ($("modal-title")) {
            Object.assign($("modal-title").style, {
                margin: "0",
                fontSize: "24px",
                fontWeight: "900"
            });
        }

        if ($("modal-content")) {
            $("modal-content").style.minWidth = "0";
            $("modal-content").style.overflowWrap = "anywhere";
        }
    }

    const UI = {
        openModal(title, kicker, content) {
            const backdrop = $("modal-backdrop");

            if (!backdrop || !$("modal-title") || !$("modal-content")) {
                toast("패널을 열 수 없어. HTML의 모달 요소를 확인해 줘.");
                return;
            }

            if (modalPanel === "stock" && window.VioletStock?.destroy) {
                safe(
                    "주식 화면 정리",
                    () => window.VioletStock.destroy()
                );
            }

            styleModal();

            $("modal-title").textContent = title || "패널";

            if ($("modal-kicker")) {
                $("modal-kicker").textContent = kicker || "VIOLET VAULT";
            }

            $("modal-content").innerHTML = content || "";

            backdrop.style.display = "flex";
            backdrop.classList.add("open");
            backdrop.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";

            modalPanel = null;
            $("modal-close")?.focus();
        },

        closeModal() {
            const backdrop = $("modal-backdrop");

            if (backdrop) {
                backdrop.classList.remove("open");
                backdrop.setAttribute("aria-hidden", "true");
                backdrop.style.display = "none";
            }

            if (modalPanel === "stock" && window.VioletStock?.destroy) {
                safe(
                    "주식 화면 정리",
                    () => window.VioletStock.destroy()
                );
            }

            modalPanel = null;
            document.body.style.overflow = "";
        },

        toast: (message, type) => toast(message, "", type)
    };

    window.UI = Object.assign(window.UI || {}, UI);

    /* ------------------------ Main dashboard ------------------------ */

    function updateDrawButtons() {
        if ($("draw-button")) $("draw-button").disabled = rolling;
        if ($("instant-button")) $("instant-button").disabled = rolling;
        if ($("auto-button")) $("auto-button").disabled = false;
    }

    function renderRecentHistory(current) {
        const list = $("history-list");
        if (!list) return;

        const records = Array.isArray(current.history)
            ? current.history.filter((r) => r.type === "draw").slice(0, 5)
            : [];

        if (!records.length) {
            list.innerHTML =
                '<div class="history-empty"><span>◷</span> 뽑기를 시작하면 기록이 여기에 쌓여.</div>';
            return;
        }

        list.innerHTML = records.map((record) => {
            const prize = Number(
                record.prize ?? record.reward ?? record.amount ?? 0
            );
            const rarity = rarityFor(prize);
            const date = new Date(
                record.timestamp ?? record.at ?? Date.now()
            );

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
                        <strong>${fmt(prize)}Q 당첨</strong>
                        <small>${escapeHTML(time)} · 뽑기 비용 ${fmt(GAME_DATA.drawCost ?? 1)}Q</small>
                    </div>
                    <span class="history-amount">+${fmt(prize)}<small> Q</small></span>
                    <span class="history-chip rarity-${escapeHTML(rarityClass(rarity))}">${escapeHTML(rarity.name || "Common")}</span>
                </div>
            `;
        }).join("");
    }

    function renderRarityList() {
        if (window.VioletRarity?.renderList) {
            safe(
                "희귀도 목록",
                () => window.VioletRarity.renderList()
            );
            return;
        }

        const list = $("rarity-list");
        if (!list) return;

        list.innerHTML = (GAME_DATA.rarities || []).map((r) => `
            <div class="rarity-row ${escapeHTML(r.className || `rarity-${rarityClass(r)}`)}">
                <span class="rarity-dot"></span>
                <span>${escapeHTML(r.name || r.id)}</span>
                <span class="rarity-range">${fmt(r.min)}–${fmt(r.max)} Q</span>
            </div>
        `).join("");
    }

    function render(current = state()) {
        if (!current) return;

        const balance = Number(current.balance || 0);
        const earned = Number(current.totalIncome ?? current.totalEarned ?? 0);
        const spent = Number(current.totalExpenses ?? current.totalSpent ?? 0);
        const draws = Number(current.totalDraws || 0);
        const best = Number(current.bestWin ?? current.highestPrize ?? 0);
        const net = earned - spent;

        const codex = Array.isArray(current.codex) ? current.codex : [];
        const unlocked = Array.isArray(current.unlockedAchievements)
            ? current.unlockedAchievements
            : [];

        const definitions =
            window.VioletAchievements?.definitions ||
            GAME_DATA.achievements ||
            [];

        if ($("balance-value")) {
            $("balance-value").textContent = fmt(balance);
        }

        if ($("earned-value")) {
            $("earned-value").innerHTML = `${fmt(earned)} <small>Q</small>`;
        }

        if ($("spent-value")) {
            $("spent-value").innerHTML = `${fmt(spent)} <small>Q</small>`;
        }

        if ($("profit-value")) {
            $("profit-value").innerHTML =
                `${net > 0 ? "+" : ""}${fmt(net)} <small>Q</small>`;

            $("profit-value").classList.toggle("positive", net >= 0);
            $("profit-value").classList.toggle("negative", net < 0);
        }

        if ($("draw-count")) {
            $("draw-count").textContent = `${fmt(draws)}회`;
        }

        if ($("best-prize")) {
            $("best-prize").textContent = best > 0 ? `${fmt(best)}Q` : "—";
        }

        if ($("record-best")) {
            $("record-best").innerHTML = best > 0
                ? `${fmt(best)} <small>Q</small>`
                : "— <small>Q</small>";
        }

        if ($("record-codex")) {
            $("record-codex").innerHTML =
                `${codex.length} <small>/ ${Number(DATA.CODEX_CONFIG?.TOTAL_VARIANTS || 100)}</small>`;
        }

        if ($("codex-progress")) {
            $("codex-progress").style.width =
                `${Math.min(100, codex.length)}%`;
        }

        if ($("record-achievements")) {
            $("record-achievements").innerHTML =
                `${unlocked.length} <small>/ ${definitions.length}</small>`;
        }

        if ($("achievement-progress")) {
            $("achievement-progress").style.width =
                `${definitions.length ? Math.min(100, unlocked.length / definitions.length * 100) : 0}%`;
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
                        <strong class="last-win-value">${fmt(prize)}Q</strong>
                        <span class="last-win-rarity rarity-${escapeHTML(rarityClass(rarity))}">
                            ${escapeHTML(rarity.name || "Common")}
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

        updateDrawButtons();
        renderRecentHistory(current);
        renderRarityList();

        if (modalPanel === "bank") renderBankPanel(current);

        if (modalPanel === "stock" && window.VioletStock?.render) {
            safe("주식 패널 갱신", () => window.VioletStock.render(current));
        }

        if (modalPanel === "codex" && window.VioletCodex?.render) {
            safe("도감 패널 갱신", () => window.VioletCodex.render(current));
        }

        if (modalPanel === "achievements" && window.VioletAchievements?.renderAll) {
            safe("업적 패널 갱신", () => window.VioletAchievements.renderAll(current));
        }

        if (modalPanel === "history" && window.VioletHistory?.render) {
            safe("기록 패널 갱신", () => window.VioletHistory.render(current));
        }

        if (modalPanel === "statistics" && window.VioletStatistics?.render) {
            safe("통계 패널 갱신", () => window.VioletStatistics.render(current));
        }
    }

    function updateResult(prize) {
        const rarity = rarityFor(prize);

        if ($("result-overline")) {
            $("result-overline").textContent = "YOUR NEXT FORTUNE";
        }

        if ($("result-number")) {
            $("result-number").textContent = fmt(prize);
        }

        if ($("result-rarity")) {
            $("result-rarity").textContent =
                `${String(rarity.name || "Common").toUpperCase()} · ${rarity.label || rarity.name || "일반"}`;

            $("result-rarity").className =
                `result-rarity rarity-${rarityClass(rarity)}`;
        }

        if ($("result-caption")) {
            $("result-caption").textContent =
                rarity.description || "오늘의 행운을 확인해 봐.";
        }

        const number = $("result-number");

        if (number && animationsEnabled()) {
            number.classList.remove("is-revealing");
            void number.offsetWidth;
            number.classList.add("is-revealing");
        }
    }

    /* ------------------------ Draw mechanics ------------------------ */

    function clearAnimationTimers() {
        if (animationTimer !== null) clearTimeout(animationTimer);
        if (animationFallbackTimer !== null) clearTimeout(animationFallbackTimer);

        animationTimer = null;
        animationFallbackTimer = null;
    }

    function checkAchievements() {
        const current = state();

        if (!current || !window.VioletAchievements?.check) return;

        safe(
            "업적 확인",
            () => window.VioletAchievements.check(current)
        );

        saveState();
    }

    function openInsufficientBalance() {
        toast(
            "잔액이 부족해",
            "보라 은행에서 가상 대출을 이용할 수 있어."
        );

        openByName("bank");
    }

    function finishDraw(prize, token) {
        if (token !== drawToken || !rolling) return;

        let result = null;

        try {
            if (!window.Economy?.draw) {
                throw new Error("Economy.draw 함수를 찾을 수 없습니다.");
            }

            result = window.Economy.draw(prize);
        } catch (error) {
            console.error("[Violet Vault] 뽑기 처리 실패:", error);
            toast("뽑기 처리 중 오류가 발생했어. economy.js를 확인해 줘.");
        } finally {
            rolling = false;
            clearAnimationTimers();
            $("draw-card")?.classList.remove("is-rolling");
            updateDrawButtons();
        }

        if (!result?.ok) {
            if (result?.reason === "funds") {
                stopAuto();
                openInsufficientBalance();
            } else {
                toast("뽑기 결과를 처리하지 못했어. economy.js를 확인해 줘.");
            }

            render();
            return;
        }

        updateResult(prize);
        render();
        checkAchievements();

        if (animationsEnabled() && window.VioletEffects?.playWin) {
            safe("당첨 효과", () =>
                window.VioletEffects.playWin({
                    amount: prize,
                    rarity: rarityFor(prize)
                })
            );
        }

        toast(
            prize >= 90 ? "대박!" : "당첨!",
            `${fmt(prize)}Q를 뽑았어!`
        );
    }

    function draw(instant = false) {
        if (rolling) return;

        if (!window.Economy?.canAfford || !window.Economy?.draw) {
            toast("경제 시스템을 불러올 수 없어. economy.js를 확인해 줘.");
            return;
        }

        const minimum = Number(GAME_DATA.minPrize ?? DATA.MIN_REWARD ?? 1);
        const maximum = Number(GAME_DATA.maxPrize ?? DATA.MAX_REWARD ?? 100);
        const cost = Number(GAME_DATA.drawCost ?? DATA.DRAW_COST ?? 1);

        if (!window.Economy.canAfford(cost)) {
            stopAuto();
            openInsufficientBalance();
            return;
        }

        const low = Math.min(minimum, maximum);
        const high = Math.max(minimum, maximum);

        const prize =
            Math.floor(Math.random() * (high - low + 1)) + low;

        const token = ++drawToken;
        const animate = !instant && animationsEnabled();

        rolling = true;
        updateDrawButtons();

        if (!animate) {
            finishDraw(prize, token);
            return;
        }

        $("draw-card")?.classList.add("is-rolling");

        const started = performance.now();
        const duration = Math.max(
            250,
            Number(DATA.DRAW_ANIMATION_DURATION || 750)
        );

        let finished = false;

        const finishOnce = () => {
            if (finished) return;
            finished = true;
            finishDraw(prize, token);
        };

        animationFallbackTimer = window.setTimeout(
            finishOnce,
            duration + 1800
        );

        function tick(now) {
            if (finished || token !== drawToken || !rolling) return;

            const progress = Math.min(1, (now - started) / duration);
            const delay = progress < 0.7 ? 65 : progress < 0.9 ? 110 : 180;

            if ($("result-number")) {
                $("result-number").textContent = fmt(
                    Math.floor(Math.random() * (high - low + 1)) + low
                );
            }

            if (progress < 1) {
                animationTimer = window.setTimeout(() => {
                    if (!finished && token === drawToken && rolling) {
                        requestAnimationFrame(tick);
                    }
                }, delay);
            } else {
                finishOnce();
            }
        }

        requestAnimationFrame(tick);
    }

    function startAuto() {
        if (autoTimer !== null) {
            stopAuto();
            return;
        }

        const interval = Math.max(
            500,
            Number(GAME_DATA.autoDrawInterval ?? DATA.AUTO_DRAW_DELAY ?? 1000)
        );

        const cost = Number(GAME_DATA.drawCost ?? DATA.DRAW_COST ?? 1);

        if (!window.Economy?.canAfford || !window.Economy.canAfford(cost)) {
            openInsufficientBalance();
            return;
        }

        autoTimer = window.setInterval(() => {
            if (rolling) return;

            if (!window.Economy?.canAfford || !window.Economy.canAfford(cost)) {
                stopAuto();
                toast("잔액이 부족해서 자동 뽑기를 멈췄어.");
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
        if (autoTimer !== null) clearInterval(autoTimer);
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

    /* ------------------------ Panels ------------------------ */

    function bankTemplate() {
        return `
            <section class="panel" id="bank-panel">
                <div class="content-panel-heading">
                    <div>
                        <p class="eyebrow">VIOLET BANK</p>
                        <h2>무이자 가상 대출</h2>
                    </div>
                    <span class="bank-status" id="bank-status">무이자</span>
                </div>

                <p class="section-description">
                    실제 돈이 아닌 게임 안의 Q를 빌리고 상환하는 기능이야.
                </p>

                <div class="bank-balance-card">
                    <p>현재 보유 금액</p>
                    <strong id="bank-current-balance">100 Q</strong>
                    <p>현재 대출 잔액</p>
                    <strong id="bank-debt">0 Q</strong>
                </div>

                <div id="bank-account-summary"></div>

                <div class="form-group">
                    <label for="loan-amount">대출 금액 (정수 Q)</label>
                    <input id="loan-amount" type="number" min="1" step="1" placeholder="대출할 금액 입력">
                    <button class="primary-button" id="borrow-button" type="button" data-bank-action="borrow">대출받기</button>
                </div>

                <div class="form-group">
                    <label for="repay-amount">상환 금액 (정수 Q)</label>
                    <input id="repay-amount" type="number" min="1" step="1" placeholder="상환할 금액 입력">
                    <button class="secondary-button" id="repay-button" type="button" data-bank-action="repay">상환하기</button>
                </div>

                <p class="section-description">
                    이자율 0% · 상환 기한 없음 · 보유 잔액과 부채를 초과해서 상환할 수 없어.
                </p>
            </section>
        `;
    }

    function stockTemplate() {
        return `
            <section class="panel" id="stock-panel">
                <div class="content-panel-heading">
                    <div>
                        <p class="eyebrow">VIRTUAL STOCK MARKET</p>
                        <h2>가상 주식 시장</h2>
                    </div>
                    <span class="market-status">시장 운영 중</span>
                </div>

                <p class="section-description">
                    주가는 가상으로 변동해. 실제 주식시장과 연결되지 않아.
                </p>

                <div class="stock-summary">
                    <div><p>보유 주식 평가액</p><strong id="stock-portfolio-value">0 Q</strong></div>
                    <div><p>확정 손익</p><strong id="stock-realized-profit">0 Q</strong></div>
                    <div><p>순자산</p><strong id="net-worth">0 Q</strong></div>
                </div>

                <h3 class="subsection-title">가상 기업 목록</h3>
                <div id="stock-list" class="stock-list"></div>

                <h3 class="subsection-title">내 포트폴리오</h3>
                <div id="stock-portfolio" class="stock-portfolio"></div>
            </section>
        `;
    }

    function openByName(name) {
        if (name === "settings") {
            if (window.VioletSettings?.open) {
                safe("설정 열기", () => window.VioletSettings.open());
            } else {
                openSettingsFallback();
            }
            return;
        }

        const panels = {
            codex: [
                "돈 도감",
                "COLLECTION CODEX",
                '<div id="codex-content" class="codex-content"></div>'
            ],
            achievements: [
                "업적",
                "ACHIEVEMENT COLLECTION",
                '<div id="achievements-content"></div>'
            ],
            bank: ["보라 은행", "VIOLET BANK", bankTemplate()],
            stock: ["가상 주식", "VIRTUAL STOCK MARKET", stockTemplate()],
            statistics: [
                "통계 센터",
                "YOUR STATISTICS",
                '<div id="statistics-content"></div>'
            ],
            history: [
                "전체 기록",
                "TRANSACTION HISTORY",
                '<div id="history-content" class="history-content"></div>'
            ]
        };

        const panel = panels[name];

        if (!panel) {
            toast("아직 준비 중인 메뉴야.");
            return;
        }

        UI.openModal(panel[0], panel[1], panel[2]);
        modalPanel = name;

        bindModalActions();
        renderPanel(name);
    }

    function renderPanel(name) {
        const current = state();
        if (!current) return;

        if (name === "codex") {
            if (window.VioletCodex?.render) {
                safe("도감 렌더링", () => window.VioletCodex.render(current));
            } else {
                renderCodexFallback(current);
            }
        } else if (name === "achievements") {
            if (window.VioletAchievements?.renderAll) {
                safe(
                    "업적 렌더링",
                    () => window.VioletAchievements.renderAll(current)
                );
            } else {
                renderAchievementsFallback(current);
            }
        } else if (name === "bank") {
            renderBankPanel(current);
        } else if (name === "stock") {
            if (window.VioletStock?.init && window.VioletStock?.render) {
                safe("주식 초기화", () => window.VioletStock.init());
                safe("주식 렌더링", () => window.VioletStock.render(current));
            } else {
                renderStockFallback(current);
            }
        } else if (name === "history") {
            if (window.VioletHistory?.render) {
                safe("기록 렌더링", () => window.VioletHistory.render(current));
            } else {
                renderHistoryFallback(current);
            }
        } else if (name === "statistics") {
            if (window.VioletStatistics?.render) {
                safe(
                    "통계 렌더링",
                    () => window.VioletStatistics.render(current)
                );
            } else {
                renderStatisticsFallback(current);
            }
        }
    }

    function bindModalActions() {
        const root = $("modal-content");
        if (!root || root.dataset.actionsBound === "true") return;

        root.addEventListener("click", (event) => {
            const button = event.target.closest("[data-bank-action]");
            if (!button) return;

            event.preventDefault();

            if (button.dataset.bankAction === "borrow") {
                processBankBorrow();
            }

            if (button.dataset.bankAction === "repay") {
                processBankRepayment();
            }
        });

        root.dataset.actionsBound = "true";
    }

    function recordTransaction(current, entry) {
        if (!Array.isArray(current.history)) current.history = [];

        current.history.unshift({
            ...entry,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now()
        });

        const limit = Math.max(
            1,
            Math.floor(Number(DATA.HISTORY_LIMIT) || 300)
        );

        if (current.history.length > limit) {
            current.history.length = limit;
        }
    }

    function completeStateChange() {
        saveState();
        changed();
        checkAchievements();
        render();
    }

    function processBankBorrow() {
        const current = state();
        const input = $("loan-amount");
        const amount = Number(input?.value);

        if (!current || !Number.isSafeInteger(amount) || amount <= 0) {
            toast("대출 금액은 1 이상의 정수로 입력해 줘.");
            return;
        }

        const result = window.VioletEconomy?.borrowMoney?.(current, amount);

        if (!result?.success) {
            toast("대출을 처리하지 못했어. 금액과 한도를 확인해 줘.");
            return;
        }

        recordTransaction(current, {
            type: "loan",
            amount: result.amount
        });

        completeStateChange();

        if (input) input.value = "";

        toast("대출 완료", `${q(result.amount)}을 빌렸어. 이자는 없어.`);
    }

    function processBankRepayment() {
        const current = state();
        const input = $("repay-amount");
        const amount = Number(input?.value);

        if (!current || !Number.isSafeInteger(amount) || amount <= 0) {
            toast("상환 금액은 1 이상의 정수로 입력해 줘.");
            return;
        }

        const result = window.VioletEconomy?.repayDebt?.(current, amount);

        if (!result?.success) {
            const messages = {
                no_debt: "현재 갚아야 할 대출이 없어.",
                no_balance: "상환할 잔액이 부족해.",
                invalid_amount: "상환 금액을 다시 확인해 줘."
            };

            toast(messages[result?.reason] || "상환을 처리하지 못했어.");
            return;
        }

        recordTransaction(current, {
            type: "repayment",
            amount: result.amount
        });

        completeStateChange();

        if (input) input.value = "";

        toast(
            "상환 완료",
            `${q(result.amount)}을 갚았어. 남은 부채는 ${q(current.debt)}야.`
        );
    }

    function renderBankPanel(current) {
        if (!$("bank-panel")) return;

        if ($("bank-current-balance")) {
            $("bank-current-balance").textContent = q(current.balance);
        }

        if ($("bank-debt")) {
            $("bank-debt").textContent = q(current.debt);
        }

        if ($("bank-status")) {
            $("bank-status").textContent =
                Number(current.debt) > 0 ? "대출 이용 중" : "무이자";
        }

        if ($("repay-button")) {
            $("repay-button").disabled =
                Number(current.debt) <= 0 ||
                Number(current.balance) <= 0;
        }

        if ($("bank-account-summary")) {
            $("bank-account-summary").innerHTML = `
                <div class="bank-policy-grid">
                    <div class="bank-policy-item">
                        <span>이자율</span><strong>0%</strong>
                    </div>
                    <div class="bank-policy-item">
                        <span>상환 기한</span><strong>없음</strong>
                    </div>
                </div>
            `;
        }
    }

    function renderCodexFallback(current) {
        const root = $("codex-content");
        if (!root) return;

        const collected = new Set((current.codex || []).map(Number));

        root.innerHTML = `
            <div class="codex-interface">
                <div class="codex-overview">
                    <strong>${collected.size} / 100</strong>
                    <p>수집 진행도</p>
                </div>
                <div class="codex-grid">
                    ${Array.from({ length: 100 }, (_, index) => index + 1).map((amount) => {
                        const found = collected.has(amount);
                        const rarity = rarityFor(amount);

                        return `
                            <article class="codex-item ${found ? "is-collected" : "is-locked"}">
                                <strong>${found ? `${amount} Q` : "??? Q"}</strong>
                                <span>${found ? escapeHTML(rarity.name) : "미발견"}</span>
                            </article>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }

    function renderAchievementsFallback(current) {
        const root = $("achievements-content");
        if (!root) return;

        const definitions =
            window.VioletAchievements?.definitions ||
            GAME_DATA.achievements ||
            [];

        const unlocked = new Set(current.unlockedAchievements || []);

        root.innerHTML = `
            <div class="achievement-system">
                <div class="achievement-overview">
                    <h3>나의 업적</h3>
                    <strong>${unlocked.size} / ${definitions.length}</strong>
                </div>
                <div class="achievement-list">
                    ${definitions.map((item) => `
                        <article class="achievement-card ${unlocked.has(item.id) ? "unlocked" : "locked"}">
                            <span class="achievement-symbol">${escapeHTML(item.icon || "✧")}</span>
                            <div>
                                <strong>${escapeHTML(item.name || "업적")}</strong>
                                <p>${escapeHTML(item.description || "계속 도전해 봐!")}</p>
                            </div>
                        </article>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderHistoryFallback(current) {
        const root = $("history-content");
        if (!root) return;

        const records = Array.isArray(current.history) ? current.history : [];

        root.innerHTML = `
            <div class="history-interface">
                <div class="history-summary">
                    <div class="history-summary-card">
                        <span>전체 기록</span><strong>${records.length}</strong>
                    </div>
                    <div class="history-summary-card">
                        <span>뽑기 횟수</span><strong>${fmt(current.totalDraws)}</strong>
                    </div>
                </div>

                <div class="history-entry-list">
                    ${records.length ? records.map((entry) => {
                        const date = new Date(entry.timestamp || Date.now());
                        const amount = Number(entry.amount ?? entry.prize ?? 0);

                        const label = ({
                            draw: "뽑기",
                            loan: "대출",
                            repayment: "상환",
                            stock_buy: "주식 매수",
                            stock_sell: "주식 매도"
                        })[entry.type] || "거래";

                        return `
                            <article class="history-entry">
                                <div class="history-entry-main">
                                    <strong>${escapeHTML(label)}</strong>
                                    <p>${escapeHTML(date.toLocaleString("ko-KR"))}</p>
                                </div>
                                <strong>${q(amount)}</strong>
                            </article>
                        `;
                    }).join("") : '<p class="empty-message">아직 저장된 거래 기록이 없어.</p>'}
                </div>
            </div>
        `;
    }

    function renderStatisticsFallback(current) {
        const root = $("statistics-content");
        if (!root) return;

        const draws = (current.history || []).filter((r) => r.type === "draw");

        const prizes = draws.map((r) =>
            Number(r.prize ?? r.reward ?? r.amount ?? 0)
        ).filter(Number.isFinite);

        const average = prizes.length
            ? prizes.reduce((sum, value) => sum + value, 0) / prizes.length
            : 0;

        const best = prizes.length ? Math.max(...prizes) : 0;

        const netWorth =
            Number(current.balance || 0) +
            Number(current.stockPortfolioValue || 0) -
            Number(current.debt || 0);

        root.innerHTML = `
            <div class="statistics-dashboard">
                <div class="statistics-grid">
                    ${[
                        ["누적 뽑기", fmt(current.totalDraws)],
                        ["누적 수입", q(current.totalIncome)],
                        ["누적 지출", q(current.totalExpenses)],
                        ["평균 당첨금", q(average)],
                        ["기록상 최고 당첨", q(best)],
                        ["대출 잔액", q(current.debt)],
                        ["주식 평가액", q(current.stockPortfolioValue)],
                        ["순자산", q(netWorth)]
                    ].map(([label, value]) => `
                        <article class="statistics-card">
                            <span>${label}</span>
                            <strong>${value}</strong>
                        </article>
                    `).join("")}
                </div>
            </div>
        `;
    }

    function renderStockFallback(current) {
        if ($("stock-list")) {
            $("stock-list").innerHTML =
                '<p class="empty-message">주식 모듈을 불러올 수 없어. stock.js를 확인해 줘.</p>';
        }

        if ($("stock-portfolio")) {
            $("stock-portfolio").innerHTML =
                '<p class="empty-message">포트폴리오를 표시할 수 없어.</p>';
        }

        if ($("stock-portfolio-value")) {
            $("stock-portfolio-value").textContent =
                q(current.stockPortfolioValue || 0);
        }

        if ($("stock-realized-profit")) {
            $("stock-realized-profit").textContent =
                q(current.stockRealizedProfit || 0);
        }
    }

    function openSettingsFallback() {
        const current = state();
        if (!current) return;

        const settings = current.settings || {};

        UI.openModal("설정", "PREFERENCES", `
            <div class="settings-row">
                <div><strong>화면 테마</strong><small>다크 모드와 라이트 모드</small></div>
                <select id="setting-theme">
                    <option value="dark" ${settings.theme !== "light" ? "selected" : ""}>다크 모드</option>
                    <option value="light" ${settings.theme === "light" ? "selected" : ""}>라이트 모드</option>
                </select>
            </div>

            <div class="settings-row">
                <div><strong>시각 효과</strong><small>당첨 시 시각 효과 사용</small></div>
                <input id="setting-effects" type="checkbox" ${settings.effectsEnabled !== false ? "checked" : ""}>
            </div>

            <div class="settings-row">
                <div><strong>뽑기 애니메이션</strong><small>숫자가 바뀌는 연출 사용</small></div>
                <input id="setting-animations" type="checkbox" ${settings.animationsEnabled !== false ? "checked" : ""}>
            </div>

            <div class="settings-actions">
                <button class="secondary-button" id="export-save" type="button">백업 파일</button>
                <button class="danger-button" id="reset-save" type="button">전체 데이터 초기화</button>
            </div>
        `);

        modalPanel = "settings-fallback";
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

        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("백업 파일을 저장했어.");
    }

    function handleClick(event) {
        const target = event.target;
        const open = target.closest?.("[data-open]");

        if (open) {
            event.preventDefault();
            openByName(open.dataset.open);
            return;
        }

        if (target.closest?.("#settings-open, #footer-reset")) {
            event.preventDefault();
            openByName("settings");
            return;
        }

        if (target.closest?.("#modal-close")) {
            event.preventDefault();
            UI.closeModal();
            return;
        }

        if (target === $("modal-backdrop")) {
            UI.closeModal();
            return;
        }

        if (target.closest?.("#export-save")) {
            exportData();
            return;
        }

        if (target.closest?.("#reset-save")) {
            if (window.confirm("정말 모든 데이터를 초기화할까? 이 작업은 되돌릴 수 없어.")) {
                window.SaveStore?.reset?.();
                UI.closeModal();
                render();
                toast("전체 데이터를 초기화했어.");
            }
        }
    }

    function handleChange(event) {
        const target = event.target;
        const current = state();

        if (!target || !current) return;

        if (target.id === "setting-theme") {
            current.settings.theme =
                target.value === "light" ? "light" : "dark";
        } else if (target.id === "setting-effects") {
            current.settings.effectsEnabled = target.checked;
        } else if (target.id === "setting-animations") {
            current.settings.animationsEnabled = target.checked;
            current.settings.animations = target.checked;
        } else {
            return;
        }

        saveState();
        applySettings();
    }

    /* ------------------------ Startup ------------------------ */

    function setup() {
        if (setupDone) return;
        setupDone = true;

        styleModal();

        if (window.SaveStore?.load) {
            safe("저장 데이터 불러오기", () => window.SaveStore.load());
        }

        const current = state();

        if (current?.lastPrize) {
            updateResult(
                Number(current.lastPrize.prize ?? current.lastPrize.amount ?? 0)
            );
        } else {
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

        render(current);
        applySettings();

        $("draw-button")?.addEventListener("click", () => draw(false));
        $("instant-button")?.addEventListener("click", () => draw(true));
        $("auto-button")?.addEventListener("click", startAuto);

        document.addEventListener("click", handleClick);
        document.addEventListener("change", handleChange);

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") UI.closeModal();
        });

        if (window.VioletSettings?.init) {
            safe(
                "설정 시스템 연결",
                () => window.VioletSettings.init(window.VioletVaultApp)
            );
        }

        if (window.VioletEffects?.init) {
            safe("효과 시스템 연결", () => window.VioletEffects.init());
        }

        if (window.VioletStock?.init) {
            safe("주식 시스템 연결", () => window.VioletStock.init());
        }

        window.dispatchEvent(new CustomEvent("violetvault:ready", {
            detail: { state: current }
        }));

        console.log("[Violet Vault] 메인 애플리케이션 초기화 완료.");
    }

    window.addEventListener("game:data-changed", () =>
        safe("상태 변경 렌더링", () => render(state()))
    );

    window.VioletVaultMain = {
        render,
        draw,
        startAuto,
        stopAuto,
        openByName,
        isRolling: () => rolling
    };

    if (!window.Settings) {
        window.Settings = {
            open: () => openByName("settings"),
            exportData
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", setup, { once: true });
    } else {
        setup();
    }
})();
