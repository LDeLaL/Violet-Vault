/* =========================================================
   VIOLET VAULT
   Codex System — codex.js
   =========================================================

   담당 기능
   - 1 Q부터 100 Q까지 총 100종의 도감 관리
   - 수집한 금액과 미수집 금액 구분
   - 희귀도 표시
   - 도감 수집률 계산
   - 도감 검색
   - 수집 상태별 필터
   - 금액 정렬
   - 다른 시스템에서 사용할 수 있는 도감 API 제공

   연결 파일
   - index.html
   - codex.css
   - script.js
   - data.js
   - rarity.js

   저장 데이터
   - script.js의 state.codex 배열 사용

   중요
   - 도감 데이터는 script.js의 게임 상태와 공유한다.
   - 이 파일은 수집 데이터를 별도로 중복 저장하지 않는다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const CODEX_CONFIG = DATA.CODEX_CONFIG || {};

    const MIN_AMOUNT = Number.isInteger(CODEX_CONFIG.MIN_AMOUNT)
        ? CODEX_CONFIG.MIN_AMOUNT
        : 1;

    const MAX_AMOUNT = Number.isInteger(CODEX_CONFIG.MAX_AMOUNT)
        ? CODEX_CONFIG.MAX_AMOUNT
        : 100;

    const TOTAL_VARIANTS = Math.max(
        1,
        MAX_AMOUNT - MIN_AMOUNT + 1
    );


    /* =====================================================
       2. 내부 상태
       ===================================================== */

    let currentState = null;

    let currentFilter = "all";

    let currentSort = "ascending";

    let currentSearch = "";

    let layoutInitialized = false;


    /* =====================================================
       3. 공통 보조 함수
       ===================================================== */

    function getElement(id) {
        return document.getElementById(id);
    }


    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function formatAmount(value) {
        return Number(value).toLocaleString("en-US", {
            maximumFractionDigits: 0
        });
    }


    function formatQ(value) {
        return `${formatAmount(value)} Q`;
    }


    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }


    /* =====================================================
       4. 게임 상태 검사
       ===================================================== */

    function ensureState(state) {
        if (!state || typeof state !== "object") {
            return false;
        }

        if (!Array.isArray(state.codex)) {
            state.codex = [];
        }

        /*
         * 잘못된 값과 중복 값을 정리한다.
         *
         * 정상적인 도감 항목:
         * 1, 2, 3 ... 99, 100
         */

        state.codex = [
            ...new Set(
                state.codex
                    .map(Number)
                    .filter(amount =>
                        Number.isInteger(amount) &&
                        amount >= MIN_AMOUNT &&
                        amount <= MAX_AMOUNT
                    )
            )
        ].sort((a, b) => a - b);

        return true;
    }


    /* =====================================================
       5. 수집 데이터 조회
       ===================================================== */

    /**
     * 수집한 금액 목록을 반환한다.
     */

    function getCollectedAmounts(state = currentState) {
        if (!ensureState(state)) {
            return [];
        }

        return [...state.codex].sort((a, b) => a - b);
    }


    /**
     * 특정 금액을 수집했는지 확인한다.
     */

    function isCollected(amount, state = currentState) {
        if (!ensureState(state)) {
            return false;
        }

        const value = Number(amount);

        if (!Number.isInteger(value)) {
            return false;
        }

        return state.codex.includes(value);
    }


    /**
     * 총 수집 개수를 반환한다.
     */

    function getCollectedCount(state = currentState) {
        return getCollectedAmounts(state).length;
    }


    /**
     * 도감 수집률을 반환한다.
     */

    function getCompletion(state = currentState) {
        const count = getCollectedCount(state);

        return clamp(
            count / TOTAL_VARIANTS * 100,
            0,
            100
        );
    }


    /**
     * 특정 금액을 도감에 등록한다.
     *
     * 이미 수집한 금액은 중복 등록하지 않는다.
     *
     * 이 함수를 직접 호출한 경우 저장은 호출자가 담당한다.
     */

    function add(amount, state = currentState) {
        if (!ensureState(state)) {
            return false;
        }

        const value = Number(amount);

        if (
            !Number.isInteger(value) ||
            value < MIN_AMOUNT ||
            value > MAX_AMOUNT
        ) {
            return false;
        }

        if (state.codex.includes(value)) {
            return false;
        }

        state.codex.push(value);

        state.codex.sort((a, b) => a - b);

        return true;
    }


    /* =====================================================
       6. 희귀도 조회
       ===================================================== */

    /**
     * rarity.js가 구현되어 있다면 해당 시스템을 사용한다.
     * 아직 사용할 수 없다면 data.js의 정보를 확인한다.
     */

    function getRarityInfo(amount) {
        const raritySystem = window.VioletRarity;

        if (
            raritySystem &&
            typeof raritySystem.getRarityInfo === "function"
        ) {
            const result = raritySystem.getRarityInfo(amount);

            if (result && typeof result === "object") {
                return normalizeRarity(result);
            }
        }

        if (
            typeof DATA.getRarityByAmount === "function"
        ) {
            const result = DATA.getRarityByAmount(amount);

            if (result) {
                return normalizeRarity(result);
            }
        }

        return getFallbackRarity(amount);
    }


    /**
     * 희귀도 데이터의 프로퍼티 이름을 통일한다.
     */

    function normalizeRarity(rarity) {
        const rawClassName = String(
            rarity.className ||
            `rarity-${rarity.id || "common"}`
        );

        /*
         * HTML 클래스에 사용할 수 있는 문자만 허용한다.
         */

        const safeClassName = rawClassName
            .split(/\s+/)
            .filter(name => /^[a-zA-Z0-9_-]+$/.test(name))
            .join(" ");

        return {
            id: rarity.id || "common",

            name: rarity.name || "Common",

            description: rarity.description || "",

            className: safeClassName || "rarity-common",

            color: /^#[0-9a-fA-F]{3,8}$/.test(
                String(rarity.color || "")
            )
                ? rarity.color
                : "#aaa2bb",

            symbol: rarity.symbol || "◇"
        };
    }


    /**
     * 희귀도 시스템이 아직 없을 때 사용할 기본 데이터.
     */

    function getFallbackRarity(amount) {
        const value = Number(amount);

        const definitions = [
            {
                name: "Common",
                min: 1,
                max: 10,
                className: "rarity-common",
                color: "#aaa2bb",
                symbol: "◇"
            },
            {
                name: "Uncommon",
                min: 11,
                max: 25,
                className: "rarity-uncommon",
                color: "#73dca5",
                symbol: "✧"
            },
            {
                name: "Rare",
                min: 26,
                max: 45,
                className: "rarity-rare",
                color: "#62a9ff",
                symbol: "✦"
            },
            {
                name: "Epic",
                min: 46,
                max: 65,
                className: "rarity-epic",
                color: "#bd83ff",
                symbol: "✷"
            },
            {
                name: "Legendary",
                min: 66,
                max: 85,
                className: "rarity-legendary",
                color: "#ffcf70",
                symbol: "♛"
            },
            {
                name: "Mythic",
                min: 86,
                max: 99,
                className: "rarity-mythic",
                color: "#ff80d0",
                symbol: "☄"
            },
            {
                name: "Ultimate",
                min: 100,
                max: 100,
                className: "rarity-ultimate",
                color: "#f1d5ff",
                symbol: "✹"
            }
        ];

        const rarity = definitions.find(item =>
            value >= item.min &&
            value <= item.max
        );

        return normalizeRarity(
            rarity || definitions[0]
        );
    }


    /* =====================================================
       7. 도감 화면 초기 구조
       ===================================================== */

    function initializeLayout() {
        const container = getElement("codex-content");

        if (!container) {
            return false;
        }

        if (container.dataset.codexReady === "true") {
            layoutInitialized = true;
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

        bindLayoutEvents();

        layoutInitialized = true;

        return true;
    }


    /* =====================================================
       8. 검색 및 필터 이벤트
       ===================================================== */

    function bindLayoutEvents() {
        const searchInput = getElement("codex-search");
        const filterSelect = getElement("codex-filter");
        const sortSelect = getElement("codex-sort");

        if (searchInput) {
            searchInput.addEventListener("input", () => {
                currentSearch = searchInput.value
                    .trim()
                    .toLowerCase();

                renderEntries();
            });
        }

        if (filterSelect) {
            filterSelect.addEventListener("change", () => {
                currentFilter = filterSelect.value;

                renderEntries();
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                currentSort = sortSelect.value;

                renderEntries();
            });
        }
    }


    /* =====================================================
       9. 도감 항목 데이터 생성
       ===================================================== */

    function getAllEntries() {
        const entries = [];

        for (
            let amount = MIN_AMOUNT;
            amount <= MAX_AMOUNT;
            amount++
        ) {
            const collected = isCollected(amount);

            const rarity = getRarityInfo(amount);

            entries.push({
                amount,
                collected,
                rarity
            });
        }

        return entries;
    }


    /* =====================================================
       10. 도감 검색 및 필터
       ===================================================== */

    function filterEntries(entries) {
        let result = [...entries];

        /*
         * 수집 상태
         */

        if (currentFilter === "collected") {
            result = result.filter(
                entry => entry.collected
            );
        }

        if (currentFilter === "missing") {
            result = result.filter(
                entry => !entry.collected
            );
        }

        /*
         * 검색어
         */

        if (currentSearch) {
            result = result.filter(entry => {
                /*
                 * 아직 수집하지 않은 금액은
                 * 검색 결과에서도 숫자를 노출하지 않는다.
                 */

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

        /*
         * 정렬
         */

        result.sort((a, b) => {
            if (currentSort === "descending") {
                return b.amount - a.amount;
            }

            return a.amount - b.amount;
        });

        return result;
    }


    /* =====================================================
       11. 도감 진행도 표시
       ===================================================== */

    function renderProgress() {
        const collectedCount = getCollectedCount();

        const percentage = getCompletion();

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
                    : `아직 ${TOTAL_VARIANTS - collectedCount}종의 금액이 남아 있어.`
        );

        const progressBar = getElement("codex-progress-bar");

        if (progressBar) {
            progressBar.setAttribute(
                "aria-valuenow",
                String(percentage)
            );
        }

        const progressFill = getElement("codex-progress-fill");

        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
    }


    /* =====================================================
       12. 도감 항목 표시
       ===================================================== */

    function renderEntries() {
        if (!currentState) {
            return;
        }

        const grid = getElement("codex-grid");
        const empty = getElement("codex-empty");
        const visibleCount = getElement("codex-visible-count");

        if (!grid) {
            return;
        }

        const allEntries = getAllEntries();

        const filteredEntries = filterEntries(allEntries);

        /*
         * 결과가 없을 때 표시할 안내문
         */

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

        /*
         * 카드 생성
         */

        grid.innerHTML = filteredEntries.map(entry => {
            const amount = entry.amount;

            const rarity = entry.rarity;

            const collected = entry.collected;

            const cardClass = collected
                ? "codex-item is-collected"
                : "codex-item is-locked";

            const amountLabel = collected
                ? `${formatAmount(amount)} Q`
                : "??? Q";

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


    /* =====================================================
       13. 화면에 텍스트 표시
       ===================================================== */

    function setText(id, value) {
        const element = getElement(id);

        if (element) {
            element.textContent = String(value);
        }
    }


    /* =====================================================
       14. 도감 렌더링
       ===================================================== */

    /**
     * script.js의 renderAll()에서 호출한다.
     *
     * VioletCodex.render(state);
     */

    function render(state) {
        if (!ensureState(state)) {
            return;
        }

        currentState = state;

        if (!initializeLayout()) {
            return;
        }

        renderProgress();

        renderEntries();
    }


    /* =====================================================
       15. 도감 검색 초기화
       ===================================================== */

    function resetFilters() {
        currentFilter = "all";
        currentSort = "ascending";
        currentSearch = "";

        const searchInput = getElement("codex-search");
        const filterSelect = getElement("codex-filter");
        const sortSelect = getElement("codex-sort");

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


    /* =====================================================
       16. 공개 API
       ===================================================== */

    const VioletCodex = {
        render,

        add,

        isCollected,

        getCollectedAmounts,

        getCollectedCount,

        getCompletion,

        getRarityInfo,

        resetFilters,

        get totalVariants() {
            return TOTAL_VARIANTS;
        }
    };


    /* =====================================================
       17. 전역 등록
       ===================================================== */

    window.VioletCodex = VioletCodex;


    console.log(
        "[Violet Vault] 도감 시스템 로드 완료."
    );

})();
