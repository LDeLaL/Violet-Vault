/* =========================================================
   VIOLET VAULT
   Codex System — codex.js
   Compatible with data.js, rarity.js, save.js and script.js
   ========================================================= */
(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const CONFIG = DATA.CODEX_CONFIG || {};
    const MIN_AMOUNT = Number.isInteger(Number(CONFIG.MIN_AMOUNT))
        ? Number(CONFIG.MIN_AMOUNT)
        : 1;
    const MAX_AMOUNT = Number.isInteger(Number(CONFIG.MAX_AMOUNT))
        ? Number(CONFIG.MAX_AMOUNT)
        : 100;
    const TOTAL_VARIANTS = Math.max(0, MAX_AMOUNT - MIN_AMOUNT + 1);
    const CURRENCY = String(DATA.CURRENCY || "Q");

    let currentState = null;
    let currentFilter = "all";
    let currentSort = "ascending";
    let currentSearch = "";

    const $ = (id) => document.getElementById(id);

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function amountNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : NaN;
    }

    function formatAmount(value) {
        return Number(value).toLocaleString("en-US", {
            maximumFractionDigits: 0
        });
    }

    function formatQ(value) {
        return `${formatAmount(value)} ${CURRENCY}`;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    /* ---------------------------------------------------------
       1. 게임 상태 연결
       --------------------------------------------------------- */

    function resolveState() {
        const stores = [
            window.SaveStore,
            window.VioletVaultSave,
            window.VioletVaultApp
        ];

        for (const store of stores) {
            if (store && typeof store.getState === "function") {
                try {
                    const state = store.getState();

                    if (state && typeof state === "object") {
                        return state;
                    }
                } catch (error) {
                    console.error(
                        "[Violet Vault Codex] 상태 읽기 실패:",
                        error
                    );
                }
            }

            if (store?.state && typeof store.state === "object") {
                return store.state;
            }
        }

        return currentState;
    }

    function ensureState(state) {
        if (!state || typeof state !== "object") {
            return false;
        }

        if (!Array.isArray(state.codex)) {
            state.codex = [];
        }

        const normalized = [...new Set(
            state.codex
                .map(amountNumber)
                .filter(amount =>
                    Number.isInteger(amount) &&
                    amount >= MIN_AMOUNT &&
                    amount <= MAX_AMOUNT
                )
        )].sort((a, b) => a - b);

        state.codex = normalized;

        return true;
    }

    /* ---------------------------------------------------------
       2. 수집 데이터 API
       --------------------------------------------------------- */

    function getCollectedAmounts(state = resolveState()) {
        if (!ensureState(state)) {
            return [];
        }

        return [...state.codex];
    }

    function isCollected(amount, state = resolveState()) {
        if (!ensureState(state)) {
            return false;
        }

        const value = amountNumber(amount);

        return Number.isInteger(value) &&
            state.codex.includes(value);
    }

    function getCollectedCount(state = resolveState()) {
        return getCollectedAmounts(state).length;
    }

    function getCompletion(state = resolveState()) {
        if (TOTAL_VARIANTS <= 0) {
            return 100;
        }

        return clamp(
            getCollectedCount(state) / TOTAL_VARIANTS * 100,
            0,
            100
        );
    }

    // 실제 저장은 호출하는 게임 시스템이 담당한다.
    function add(amount, state = resolveState()) {
        if (!ensureState(state)) {
            return false;
        }

        const value = amountNumber(amount);

        if (
            !Number.isInteger(value) ||
            value < MIN_AMOUNT ||
            value > MAX_AMOUNT ||
            state.codex.includes(value)
        ) {
            return false;
        }

        state.codex.push(value);
        state.codex.sort((a, b) => a - b);

        if (state === currentState) {
            render(state);
        }

        return true;
    }

    /* ---------------------------------------------------------
       3. 희귀도 처리
       --------------------------------------------------------- */

    function normalizeRarity(rarity) {
        const rawClassName = String(
            rarity?.className ||
            `rarity-${rarity?.id || "common"}`
        );

        const safeClassName = rawClassName
            .split(/\s+/)
            .filter(name => /^[a-zA-Z0-9_-]+$/.test(name))
            .join(" ");

        const rawColor = String(rarity?.color || "");

        const color = /^#[0-9a-fA-F]{3,8}$/.test(rawColor)
            ? rawColor
            : "#aaa2bb";

        return {
            id: String(rarity?.id || "common"),
            name: String(rarity?.name || "Common"),
            description: String(rarity?.description || ""),
            className: safeClassName || "rarity-common",
            color,
            symbol: String(rarity?.symbol || "◇")
        };
    }

    function getFallbackRarity(amount) {
        const value = Number(amount);

        const definitions = [
            {
                id: "common",
                name: "Common",
                min: 1,
                max: 10,
                description: "가장 기본적인 등급.",
                className: "rarity-common",
                color: "#aaa2bb",
                symbol: "◇"
            },
            {
                id: "uncommon",
                name: "Uncommon",
                min: 11,
                max: 25,
                description: "조금 더 특별한 등급.",
                className: "rarity-uncommon",
                color: "#73dca5",
                symbol: "✧"
            },
            {
                id: "rare",
                name: "Rare",
                min: 26,
                max: 45,
                description: "쉽게 만나기 어려운 등급.",
                className: "rarity-rare",
                color: "#62a9ff",
                symbol: "✦"
            },
            {
                id: "epic",
                name: "Epic",
                min: 46,
                max: 65,
                description: "높은 금액의 등급.",
                className: "rarity-epic",
                color: "#bd83ff",
                symbol: "✷"
            },
            {
                id: "legendary",
                name: "Legendary",
                min: 66,
                max: 85,
                description: "매우 특별한 당첨 등급.",
                className: "rarity-legendary",
                color: "#ffcf70",
                symbol: "♛"
            },
            {
                id: "mythic",
                name: "Mythic",
                min: 86,
                max: 99,
                description: "아주 높은 금액의 등급.",
                className: "rarity-mythic",
                color: "#ff80d0",
                symbol: "☄"
            },
            {
                id: "ultimate",
                name: "Ultimate",
                min: 100,
                max: 100,
                description: "현재 당첨 가능한 최고 금액.",
                className: "rarity-ultimate",
                color: "#f1d5ff",
                symbol: "✹"
            }
        ];

        return normalizeRarity(
            definitions.find(item =>
                value >= item.min && value <= item.max
            ) || definitions[0]
        );
    }

    function getRarityInfo(amount) {
        const raritySystem = window.VioletRarity;

        if (typeof raritySystem?.getRarityInfo === "function") {
            try {
                const result = raritySystem.getRarityInfo(amount);

                if (result && typeof result === "object") {
                    return normalizeRarity(result);
                }
            } catch (error) {
                console.error(
                    "[Violet Vault Codex] 희귀도 조회 실패:",
                    error
                );
            }
        }

        if (typeof DATA.getRarityByAmount === "function") {
            try {
                const result = DATA.getRarityByAmount(amount);

                if (result) {
                    return normalizeRarity(result);
                }
            } catch (error) {
                console.error(
                    "[Violet Vault Codex] 기본 희귀도 조회 실패:",
                    error
                );
            }
        }

        return getFallbackRarity(amount);
    }

    /* ---------------------------------------------------------
       4. 도감 화면 생성
       --------------------------------------------------------- */

    function initializeLayout() {
        const container = $("codex-content");

        if (!container) {
            return false;
        }

        if (container.dataset.codexReady === "true") {
            return true;
        }

        container.innerHTML = `
            <div class="codex-interface">

                <div class="codex-overview">

                    <div class="codex-overview-heading">

                        <span class="codex-overview-label">
                            COLLECTION PROGRESS
                        </span>

                        <strong
                            id="codex-progress-text"
                            class="codex-progress-text">
                            0 / ${TOTAL_VARIANTS}
                        </strong>

                    </div>

                    <div
                        class="codex-progress-track"
                        role="progressbar"
                        aria-label="도감 수집률"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow="0"
                        id="codex-progress-bar">

                        <div
                            id="codex-progress-fill"
                            class="codex-progress-fill">
                        </div>

                    </div>

                    <p
                        id="codex-progress-description"
                        class="codex-progress-description">
                        아직 수집을 시작하지 않았어.
                    </p>

                </div>

                <div class="codex-toolbar">

                    <div class="codex-search-wrapper">

                        <label
                            class="codex-visually-hidden"
                            for="codex-search">
                            도감 검색
                        </label>

                        <span
                            class="codex-search-icon"
                            aria-hidden="true">
                            ⌕
                        </span>

                        <input
                            id="codex-search"
                            class="codex-search"
                            type="search"
                            placeholder="금액 또는 희귀도 검색..."
                            autocomplete="off">

                    </div>

                    <div class="codex-filter-wrapper">

                        <label
                            class="codex-visually-hidden"
                            for="codex-filter">
                            수집 상태 필터
                        </label>

                        <select
                            id="codex-filter"
                            class="codex-filter">

                            <option value="all">
                                전체 도감
                            </option>

                            <option value="collected">
                                수집 완료
                            </option>

                            <option value="missing">
                                미수집
                            </option>

                        </select>

                        <label
                            class="codex-visually-hidden"
                            for="codex-sort">
                            금액 정렬
                        </label>

                        <select
                            id="codex-sort"
                            class="codex-sort">

                            <option value="ascending">
                                금액 낮은 순
                            </option>

                            <option value="descending">
                                금액 높은 순
                            </option>

                        </select>

                    </div>

                </div>

                <div
                    id="codex-grid"
                    class="codex-grid">
                </div>

                <p
                    id="codex-empty"
                    class="codex-empty"
                    hidden>
                    조건에 맞는 도감 항목이 없어.
                </p>

                <div class="codex-footer">

                    <span id="codex-visible-count">
                        0개 표시 중
                    </span>

                    <span>
                        총 ${TOTAL_VARIANTS}종
                    </span>

                </div>

            </div>
        `;

        container.dataset.codexReady = "true";

        bindLayoutEvents(container);

        return true;
    }

    /* ---------------------------------------------------------
       5. 검색·필터·정렬 이벤트
       --------------------------------------------------------- */

    function bindLayoutEvents(container) {
        const searchInput = $("codex-search");
        const filterSelect = $("codex-filter");
        const sortSelect = $("codex-sort");

        // 새로 생성된 입력 요소마다 이벤트를 한 번만 등록한다.
        if (
            searchInput &&
            searchInput.dataset.bound !== "true"
        ) {
            searchInput.dataset.bound = "true";

            searchInput.addEventListener("input", () => {
                currentSearch = searchInput.value
                    .trim()
                    .toLowerCase();

                renderEntries();
            });
        }

        if (
            filterSelect &&
            filterSelect.dataset.bound !== "true"
        ) {
            filterSelect.dataset.bound = "true";

            filterSelect.addEventListener("change", () => {
                currentFilter = filterSelect.value;
                renderEntries();
            });
        }

        if (
            sortSelect &&
            sortSelect.dataset.bound !== "true"
        ) {
            sortSelect.dataset.bound = "true";

            sortSelect.addEventListener("change", () => {
                currentSort = sortSelect.value;
                renderEntries();
            });
        }

        void container;
    }

    /* ---------------------------------------------------------
       6. 도감 항목 생성 및 필터링
       --------------------------------------------------------- */

    function getAllEntries() {
        if (!ensureState(currentState)) {
            return [];
        }

        const collected = new Set(currentState.codex);
        const entries = [];

        for (
            let amount = MIN_AMOUNT;
            amount <= MAX_AMOUNT;
            amount++
        ) {
            entries.push({
                amount,
                collected: collected.has(amount),
                rarity: getRarityInfo(amount)
            });
        }

        return entries;
    }

    function filterEntries(entries) {
        let result = [...entries];

        if (currentFilter === "collected") {
            result = result.filter(entry => entry.collected);
        } else if (currentFilter === "missing") {
            result = result.filter(entry => !entry.collected);
        }

        if (currentSearch) {
            // 미수집 금액은 검색을 통해서도 공개하지 않는다.
            result = result.filter(entry => {
                if (!entry.collected) {
                    return false;
                }

                const amountText = String(entry.amount);

                const formattedAmount = formatAmount(
                    entry.amount
                ).toLowerCase();

                const rarityText = entry.rarity.name.toLowerCase();

                return (
                    amountText.includes(currentSearch) ||
                    formattedAmount.includes(currentSearch) ||
                    rarityText.includes(currentSearch)
                );
            });
        }

        result.sort((a, b) => {
            return currentSort === "descending"
                ? b.amount - a.amount
                : a.amount - b.amount;
        });

        return result;
    }

    /* ---------------------------------------------------------
       7. 진행도 표시
       --------------------------------------------------------- */

    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = String(value);
        }
    }

    function renderProgress() {
        const collectedCount = getCollectedCount(currentState);
        const percentage = getCompletion(currentState);
        const remaining = Math.max(
            0,
            TOTAL_VARIANTS - collectedCount
        );

        setText(
            "codex-count",
            `${collectedCount} / ${TOTAL_VARIANTS}종 수집`
        );

        setText(
            "codex-completion",
            `${percentage.toFixed(1)}%`
        );

        setText(
            "codex-progress-text",
            `${collectedCount} / ${TOTAL_VARIANTS}`
        );

        setText(
            "codex-progress-description",
            collectedCount === TOTAL_VARIANTS
                ? "축하해! 모든 금액을 수집했어!"
                : collectedCount === 0
                    ? "뽑기를 진행해 도감을 채워 보자!"
                    : `아직 ${remaining}종의 금액이 남아 있어.`
        );

        const progressBar = $("codex-progress-bar");

        if (progressBar) {
            progressBar.setAttribute(
                "aria-valuenow",
                String(percentage)
            );
        }

        const progressFill = $("codex-progress-fill");

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
    }

    /* ---------------------------------------------------------
       8. 도감 카드 표시
       --------------------------------------------------------- */

    function renderEntries() {
        if (!ensureState(currentState)) {
            return;
        }

        const grid = $("codex-grid");
        const empty = $("codex-empty");
        const visibleCount = $("codex-visible-count");

        if (!grid) {
            return;
        }

        const filteredEntries = filterEntries(getAllEntries());

        if (filteredEntries.length === 0) {
            grid.innerHTML = "";

            if (empty) {
                empty.hidden = false;

                empty.textContent = currentSearch
                    ? "검색 결과가 없어. 다른 검색어를 입력해 봐."
                    : "표시할 도감 항목이 없어.";
            }

            if (visibleCount) {
                visibleCount.textContent = "0개 표시 중";
            }

            return;
        }

        if (empty) {
            empty.hidden = true;
        }

        grid.innerHTML = filteredEntries.map(entry => {
            const amount = entry.amount;
            const rarity = entry.rarity;
            const collected = entry.collected;

            const cardClass = collected
                ? "codex-item is-collected"
                : "codex-item is-locked";

            const amountLabel = collected
                ? `${formatAmount(amount)} ${CURRENCY}`
                : `??? ${CURRENCY}`;

            const rarityLabel = collected
                ? rarity.name
                : "미발견";

            const description = collected
                ? rarity.description
                : "아직 발견하지 못한 금액";

            return `
                <article
                    class="${cardClass} ${escapeHTML(rarity.className)}"
                    data-amount="${amount}"
                    aria-label="${collected
                        ? escapeHTML(amountLabel)
                        : "미발견 금액"}">

                    <div class="codex-item-top">

                        <span
                            class="codex-item-symbol"
                            aria-hidden="true">
                            ${collected
                                ? escapeHTML(rarity.symbol)
                                : "?"}
                        </span>

                        <span class="codex-item-status">
                            ${collected ? "COLLECTED" : "LOCKED"}
                        </span>

                    </div>

                    <div class="codex-item-main">

                        <strong class="codex-item-amount">
                            ${escapeHTML(amountLabel)}
                        </strong>

                        <span class="codex-item-rarity">
                            ${escapeHTML(rarityLabel)}
                        </span>

                    </div>

                    <p class="codex-item-description">
                        ${escapeHTML(description)}
                    </p>

                    <div
                        class="codex-item-accent"
                        style="--codex-rarity-color:${escapeHTML(rarity.color)}">
                    </div>

                </article>
            `;
        }).join("");

        if (visibleCount) {
            visibleCount.textContent =
                `${filteredEntries.length}개 표시 중`;
        }
    }

    /* ---------------------------------------------------------
       9. 도감 렌더링 및 필터 초기화
       --------------------------------------------------------- */

    function render(state) {
        const resolved = state && typeof state === "object"
            ? state
            : resolveState();

        if (!ensureState(resolved)) {
            return false;
        }

        currentState = resolved;

        if (!initializeLayout()) {
            return false;
        }

        renderProgress();
        renderEntries();

        return true;
    }

    function resetFilters() {
        currentFilter = "all";
        currentSort = "ascending";
        currentSearch = "";

        const searchInput = $("codex-search");
        const filterSelect = $("codex-filter");
        const sortSelect = $("codex-sort");

        if (searchInput) {
            searchInput.value = "";
        }

        if (filterSelect) {
            filterSelect.value = "all";
        }

        if (sortSelect) {
            sortSelect.value = "ascending";
        }

        renderEntries();
    }

    function refresh() {
        return render(resolveState());
    }

    /* ---------------------------------------------------------
       10. 외부 모듈용 API
       --------------------------------------------------------- */

    const VioletCodex = {
        init: render,
        render,
        refresh,

        add,
        isCollected,

        getCollectedAmounts,
        getCollectedCount,
        getCompletion,
        getRarityInfo,

        resetFilters,

        get totalVariants() {
            return TOTAL_VARIANTS;
        },

        get minAmount() {
            return MIN_AMOUNT;
        },

        get maxAmount() {
            return MAX_AMOUNT;
        }
    };

    window.VioletCodex = VioletCodex;

    console.log("[Violet Vault] 도감 시스템 로드 완료.");
})();
