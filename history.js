/* =========================================================
   VIOLET VAULT
   Transaction History System — history.js
   =========================================================

   담당 기능
   - 전체 거래 기록 표시
   - 뽑기, 대출, 상환, 주식 매매 기록 구분
   - 거래 종류별 필터
   - 기록 검색
   - 최신순 및 과거순 정렬
   - 거래 시간 표시
   - 거래별 상세 금액 표시
   - 거래 내역 통계
   - 검색 결과 개수 표시

   연결 파일
   - index.html
   - history.css
   - script.js
   - economy.js
   - bank.js
   - stock.js
   - save.js

   저장 데이터
   - script.js의 state.history 배열 사용

   중요
   - 이 파일은 기존 기록을 화면에 표시한다.
   - 거래를 발생시키는 기능은 bank.js, stock.js,
     script.js 등 각 시스템이 담당한다.
   - 거래 기록을 별도로 중복 저장하지 않는다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const CURRENCY = DATA.CURRENCY || "Q";

    const DEFAULT_HISTORY_LIMIT = 300;

    const PAGE_SIZE = 25;


    /* =====================================================
       2. 내부 상태
       ===================================================== */

    let currentState = null;

    let currentFilter = "all";

    let currentSort = "newest";

    let currentSearch = "";

    let currentPage = 1;

    let initialized = false;


    /* =====================================================
       3. 공통 유틸리티
       ===================================================== */

    function getElement(id) {
        return document.getElementById(id);
    }


    function safeNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    function formatNumber(value) {
        return safeNumber(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }


    function formatQ(value) {
        return `${formatNumber(value)} ${CURRENCY}`;
    }


    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function formatDate(timestamp) {
        const date = new Date(
            safeNumber(timestamp, Date.now())
        );

        if (Number.isNaN(date.getTime())) {
            return "날짜 정보 없음";
        }

        return date.toLocaleString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
    }


    function formatSignedQ(value) {
        const amount = safeNumber(value);

        if (amount > 0) {
            return `+${formatQ(amount)}`;
        }

        if (amount < 0) {
            return `-${formatQ(Math.abs(amount))}`;
        }

        return formatQ(0);
    }


    function setText(id, value) {
        const element = getElement(id);

        if (element) {
            element.textContent = String(value);
        }
    }


    /* =====================================================
       4. 게임 상태 검사
       ===================================================== */

    function ensureState(state) {
        if (!state || typeof state !== "object") {
            return false;
        }

        if (!Array.isArray(state.history)) {
            state.history = [];
        }

        return true;
    }


    /* =====================================================
       5. 거래 종류 정의
       ===================================================== */

    const TRANSACTION_TYPES = {
        draw: {
            label: "돈 뽑기",
            category: "draw",
            symbol: "✦",
            className: "history-draw"
        },

        loan: {
            label: "대출",
            category: "bank",
            symbol: "⌂",
            className: "history-loan"
        },

        repayment: {
            label: "대출 상환",
            category: "bank",
            symbol: "↗",
            className: "history-repayment"
        },

        stock_buy: {
            label: "주식 매수",
            category: "stock",
            symbol: "↗",
            className: "history-stock-buy"
        },

        stock_sell: {
            label: "주식 매도",
            category: "stock",
            symbol: "↘",
            className: "history-stock-sell"
        }
    };


    function getTransactionType(type) {
        return TRANSACTION_TYPES[type] || {
            label: "기타 거래",
            category: "other",
            symbol: "◇",
            className: "history-other"
        };
    }


    /* =====================================================
       6. 거래 기록 조회
       ===================================================== */

    /**
     * 저장된 거래 기록을 최신순으로 반환한다.
     *
     * 기록을 직접 수정하지 않고 복사본을 반환한다.
     */

    function getEntries(state = currentState) {
        if (!ensureState(state)) {
            return [];
        }

        return state.history
            .filter(entry =>
                entry &&
                typeof entry === "object"
            )
            .map((entry, index) => ({
                ...entry,

                _originalIndex: index,

                timestamp: safeNumber(
                    entry.timestamp,
                    0
                )
            }))
            .sort((a, b) => {
                return (
                    b.timestamp - a.timestamp ||
                    b._originalIndex - a._originalIndex
                );
            });
    }


    /* =====================================================
       7. 거래 검색
       ===================================================== */

    function matchesSearch(entry, search) {
        if (!search) {
            return true;
        }

        const type = getTransactionType(entry.type);

        const searchableValues = [
            type.label,
            entry.type,
            entry.id,
            entry.stockId,
            entry.stockName,
            entry.symbol,
            entry.amount,
            entry.cost,
            entry.profit,
            entry.shares,
            entry.price,
            formatDate(entry.timestamp)
        ];

        const text = searchableValues
            .filter(value => value !== undefined && value !== null)
            .join(" ")
            .toLowerCase();

        return text.includes(search);
    }


    /* =====================================================
       8. 거래 종류별 필터
       ===================================================== */

    function matchesFilter(entry, filter) {
        if (filter === "all") {
            return true;
        }

        const type = getTransactionType(entry.type);

        return type.category === filter;
    }


    /* =====================================================
       9. 정렬
       ===================================================== */

    function sortEntries(entries) {
        const result = [...entries];

        if (currentSort === "oldest") {
            return result.sort((a, b) =>
                a.timestamp - b.timestamp ||
                a._originalIndex - b._originalIndex
            );
        }

        return result.sort((a, b) =>
            b.timestamp - a.timestamp ||
            b._originalIndex - a._originalIndex
        );
    }


    /* =====================================================
       10. 필터 적용
       ===================================================== */

    function getFilteredEntries() {
        let entries = getEntries(currentState);

        entries = entries.filter(entry =>
            matchesFilter(entry, currentFilter)
        );

        entries = entries.filter(entry =>
            matchesSearch(entry, currentSearch)
        );

        return sortEntries(entries);
    }


    /* =====================================================
       11. 거래 금액 정보
       ===================================================== */

    /**
     * 거래 기록에 표시할 금액을 생성한다.
     *
     * 뽑기:
     *   당첨금과 비용, 순증가 금액을 표시한다.
     *
     * 대출:
     *   대출받은 원금을 표시한다.
     *
     * 상환:
     *   실제 상환한 원금을 표시한다.
     *
     * 주식 매수:
     *   매수 수량, 당시 주가, 매수 대금을 표시한다.
     *
     * 주식 매도:
     *   매도 수량, 당시 주가, 매도 대금, 확정 손익을 표시한다.
     */

    function getTransactionDetails(entry) {
        const amount = safeNumber(entry.amount);
        const cost = safeNumber(entry.cost);
        const profit = safeNumber(entry.profit);

        switch (entry.type) {

            case "draw": {
                const drawCost = cost > 0
                    ? cost
                    : safeNumber(
                        DATA.DRAW_COST,
                        1
                    );

                const netChange = amount - drawCost;

                return {
                    title: "돈 뽑기",
                    description:
                        `${formatQ(amount)} 당첨 · ` +
                        `${formatQ(drawCost)} 사용`,

                    amountLabel: "당첨금",
                    amountText: `+${formatQ(amount)}`,

                    detailLabel: "잔액 순변화",
                    detailText: formatSignedQ(netChange),

                    resultClass: "history-amount-positive"
                };
            }


            case "loan": {
                return {
                    title: "대출",
                    description:
                        "대출 원금이 잔액에 추가됨",

                    amountLabel: "대출금",
                    amountText: `+${formatQ(amount)}`,

                    detailLabel: "부채 증가",
                    detailText: `+${formatQ(amount)}`,

                    resultClass: "history-amount-neutral"
                };
            }


            case "repayment": {
                return {
                    title: "대출 상환",
                    description:
                        "대출 원금을 상환함",

                    amountLabel: "상환금",
                    amountText: `-${formatQ(amount)}`,

                    detailLabel: "부채 감소",
                    detailText: `-${formatQ(amount)}`,

                    resultClass: "history-amount-negative"
                };
            }


            case "stock_buy": {
                const shares = Math.max(
                    0,
                    Math.floor(safeNumber(entry.shares))
                );

                const price = safeNumber(entry.price);

                return {
                    title: "주식 매수",
                    description:
                        `${shares.toLocaleString("en-US")}주 · ` +
                        `매수가 ${formatQ(price)}`,

                    amountLabel: "매수 금액",
                    amountText: `-${formatQ(amount)}`,

                    detailLabel: "매수 수량",
                    detailText:
                        `${shares.toLocaleString("en-US")}주`,

                    resultClass: "history-amount-negative"
                };
            }


            case "stock_sell": {
                const shares = Math.max(
                    0,
                    Math.floor(safeNumber(entry.shares))
                );

                const price = safeNumber(entry.price);

                const hasProfit = Number.isFinite(
                    Number(entry.profit)
                );

                const resultText = hasProfit
                    ? formatSignedQ(profit)
                    : "손익 정보 없음";

                const profitClass = hasProfit
                    ? profit > 0
                        ? "history-amount-positive"
                        : profit < 0
                            ? "history-amount-negative"
                            : "history-amount-neutral"
                    : "history-amount-neutral";

                return {
                    title: "주식 매도",

                    description:
                        `${shares.toLocaleString("en-US")}주 · ` +
                        `매도가 ${formatQ(price)}`,

                    amountLabel: "매도 금액",
                    amountText: `+${formatQ(amount)}`,

                    detailLabel: "확정 손익",
                    detailText: resultText,

                    resultClass: profitClass
                };
            }


            default: {
                return {
                    title: getTransactionType(entry.type).label,

                    description: "거래 기록",

                    amountLabel: "금액",
                    amountText: formatQ(amount),

                    detailLabel: "상세 정보",
                    detailText: "추가 정보 없음",

                    resultClass: "history-amount-neutral"
                };
            }
        }
    }


    /* =====================================================
       12. 거래 요약 통계
       ===================================================== */

    function getSummary(state = currentState) {
        const entries = getEntries(state);

        const drawEntries = entries.filter(
            entry => entry.type === "draw"
        );

        const loanEntries = entries.filter(
            entry => entry.type === "loan"
        );

        const repaymentEntries = entries.filter(
            entry => entry.type === "repayment"
        );

        const stockBuyEntries = entries.filter(
            entry => entry.type === "stock_buy"
        );

        const stockSellEntries = entries.filter(
            entry => entry.type === "stock_sell"
        );

        return {
            totalTransactions: entries.length,

            totalDraws: drawEntries.length,

            totalLoans: loanEntries.length,

            totalRepayments: repaymentEntries.length,

            totalStockBuys: stockBuyEntries.length,

            totalStockSells: stockSellEntries.length,

            totalLoanAmount: roundSum(
                loanEntries.map(entry => entry.amount)
            ),

            totalRepaidAmount: roundSum(
                repaymentEntries.map(entry => entry.amount)
            ),

            totalStockBuyAmount: roundSum(
                stockBuyEntries.map(entry => entry.amount)
            ),

            totalStockSellAmount: roundSum(
                stockSellEntries.map(entry => entry.amount)
            )
        };
    }


    function roundSum(values) {
        return values.reduce(
            (total, value) =>
                total + safeNumber(value),
            0
        );
    }


    /* =====================================================
       13. 거래 기록 화면 기본 구조
       ===================================================== */

    function initializeLayout() {
        const container = getElement("history-content");

        if (!container) {
            return false;
        }

        if (container.dataset.historyReady === "true") {
            initialized = true;
            return true;
        }

        container.innerHTML = `
            <div class="history-interface">

                <!-- 거래 요약 -->

                <div class="history-overview">

                    <div class="history-overview-card">
                        <span>전체 거래</span>

                        <strong id="history-total-count">
                            0
                        </strong>
                    </div>

                    <div class="history-overview-card">
                        <span>돈 뽑기</span>

                        <strong id="history-draw-count">
                            0
                        </strong>
                    </div>

                    <div class="history-overview-card">
                        <span>대출 · 상환</span>

                        <strong id="history-bank-count">
                            0
                        </strong>
                    </div>

                    <div class="history-overview-card">
                        <span>주식 거래</span>

                        <strong id="history-stock-count">
                            0
                        </strong>
                    </div>

                </div>


                <!-- 검색 -->

                <div class="history-toolbar">

                    <div class="history-search-wrapper">

                        <label
                            class="history-visually-hidden"
                            for="history-search">
                            거래 기록 검색
                        </label>

                        <span
                            class="history-search-icon"
                            aria-hidden="true">
                            ⌕
                        </span>

                        <input
                            id="history-search"
                            class="history-search"
                            type="search"
                            placeholder="거래, 기업 이름, 금액 검색..."
                            autocomplete="off">

                    </div>


                    <div class="history-filter-row">

                        <label
                            class="history-visually-hidden"
                            for="history-filter">
                            거래 종류
                        </label>

                        <select
                            id="history-filter"
                            class="history-filter">

                            <option value="all">
                                전체 거래
                            </option>

                            <option value="draw">
                                돈 뽑기
                            </option>

                            <option value="bank">
                                대출 · 상환
                            </option>

                            <option value="stock">
                                주식 거래
                            </option>

                            <option value="other">
                                기타 거래
                            </option>

                        </select>


                        <label
                            class="history-visually-hidden"
                            for="history-sort">
                            거래 정렬
                        </label>

                        <select
                            id="history-sort"
                            class="history-sort">

                            <option value="newest">
                                최신순
                            </option>

                            <option value="oldest">
                                과거순
                            </option>

                        </select>

                    </div>

                </div>


                <!-- 거래 결과 -->

                <div class="history-list-wrapper">

                    <div class="history-list-heading">

                        <h3>거래 내역</h3>

                        <span id="history-visible-count">
                            0건
                        </span>

                    </div>


                    <div
                        id="history-list"
                        class="history-list">
                    </div>


                    <div
                        id="history-empty"
                        class="history-empty"
                        hidden>
                        아직 거래 기록이 없어.
                    </div>

                </div>


                <!-- 페이지 이동 -->

                <div class="history-pagination">

                    <button
                        id="history-prev-page"
                        class="history-page-button"
                        type="button">
                        ← 이전
                    </button>

                    <span id="history-page-info">
                        1 / 1
                    </span>

                    <button
                        id="history-next-page"
                        class="history-page-button"
                        type="button">
                        다음 →
                    </button>

                </div>


                <p class="history-footer-note">
                    거래 내역은 이 브라우저에 저장된 게임 기록을 기준으로 표시돼.
                </p>

            </div>
        `;

        container.dataset.historyReady = "true";

        bindEvents();

        initialized = true;

        return true;
    }


    /* =====================================================
       14. 화면 이벤트 연결
       ===================================================== */

    function bindEvents() {
        const searchInput = getElement("history-search");

        const filterSelect = getElement("history-filter");

        const sortSelect = getElement("history-sort");

        const previousButton = getElement("history-prev-page");

        const nextButton = getElement("history-next-page");


        if (searchInput) {
            searchInput.addEventListener("input", () => {
                currentSearch = searchInput.value
                    .trim()
                    .toLowerCase();

                currentPage = 1;

                renderEntries();
            });
        }


        if (filterSelect) {
            filterSelect.addEventListener("change", () => {
                currentFilter = filterSelect.value;

                currentPage = 1;

                renderEntries();
            });
        }


        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                currentSort = sortSelect.value;

                currentPage = 1;

                renderEntries();
            });
        }


        if (previousButton) {
            previousButton.addEventListener("click", () => {
                currentPage = Math.max(1, currentPage - 1);

                renderEntries();
            });
        }


        if (nextButton) {
            nextButton.addEventListener("click", () => {
                currentPage += 1;

                renderEntries();
            });
        }
    }


    /* =====================================================
       15. 거래 카드 생성
       ===================================================== */

    function createEntryCard(entry) {
        const type = getTransactionType(entry.type);

        const details = getTransactionDetails(entry);

        const stockName = entry.stockName
            ? String(entry.stockName)
            : "";

        const symbol = entry.symbol
            ? String(entry.symbol)
            : "";

        const heading = stockName
            ? `${details.title} · ${stockName}`
            : details.title;

        const metadata = [
            symbol,
            entry.id
                ? `거래 ID: ${String(entry.id).slice(0, 18)}`
                : ""
        ].filter(Boolean).join(" · ");

        return `
            <article
                class="history-entry ${escapeHTML(type.className)}"
                data-history-type="${escapeHTML(entry.type || "other")}">

                <div class="history-entry-icon">
                    ${escapeHTML(type.symbol)}
                </div>


                <div class="history-entry-content">

                    <div class="history-entry-heading">

                        <h4>
                            ${escapeHTML(heading)}
                        </h4>

                        <span class="history-entry-type">
                            ${escapeHTML(type.label)}
                        </span>

                    </div>


                    <p class="history-entry-description">
                        ${escapeHTML(details.description)}
                    </p>


                    <div class="history-entry-details">

                        <div class="history-detail-item">
                            <span>
                                ${escapeHTML(details.amountLabel)}
                            </span>

                            <strong class="${escapeHTML(details.resultClass)}">
                                ${escapeHTML(details.amountText)}
                            </strong>
                        </div>

                        <div class="history-detail-item">
                            <span>
                                ${escapeHTML(details.detailLabel)}
                            </span>

                            <strong>
                                ${escapeHTML(details.detailText)}
                            </strong>
                        </div>

                    </div>


                    <div class="history-entry-footer">

                        <time datetime="${new Date(
                            entry.timestamp || 0
                        ).toISOString()}">
                            ${escapeHTML(formatDate(entry.timestamp))}
                        </time>

                        ${metadata
                            ? `<span>${escapeHTML(metadata)}</span>`
                            : ""}

                    </div>

                </div>

            </article>
        `;
    }


    /* =====================================================
       16. 요약 통계 표시
       ===================================================== */

    function renderSummary() {
        const summary = getSummary(currentState);

        setText(
            "history-total-count",
            formatNumber(summary.totalTransactions)
        );

        setText(
            "history-draw-count",
            formatNumber(summary.totalDraws)
        );

        setText(
            "history-bank-count",
            formatNumber(
                summary.totalLoans +
                summary.totalRepayments
            )
        );

        setText(
            "history-stock-count",
            formatNumber(
                summary.totalStockBuys +
                summary.totalStockSells
            )
        );
    }


    /* =====================================================
       17. 거래 목록 표시
       ===================================================== */

    function renderEntries() {
        const list = getElement("history-list");

        const empty = getElement("history-empty");

        const visibleCount = getElement(
            "history-visible-count"
        );

        if (!list) {
            return;
        }

        const entries = getFilteredEntries();

        const totalPages = Math.max(
            1,
            Math.ceil(entries.length / PAGE_SIZE)
        );

        currentPage = clamp(
            currentPage,
            1,
            totalPages
        );

        const startIndex = (currentPage - 1) * PAGE_SIZE;

        const pageEntries = entries.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );


        if (visibleCount) {
            visibleCount.textContent =
                `${formatNumber(entries.length)}건`;
        }


        if (entries.length === 0) {
            list.innerHTML = "";

            if (empty) {
                empty.hidden = false;

                empty.textContent =
                    currentSearch || currentFilter !== "all"
                        ? "조건에 맞는 거래 기록이 없어."
                        : "아직 거래 기록이 없어. 첫 뽑기를 진행해 봐!";
            }

        } else {
            if (empty) {
                empty.hidden = true;
            }

            list.innerHTML = pageEntries
                .map(createEntryCard)
                .join("");
        }


        updatePagination(totalPages);
    }


    /* =====================================================
       18. 페이지 이동 정보
       ===================================================== */

    function updatePagination(totalPages) {
        const previousButton = getElement(
            "history-prev-page"
        );

        const nextButton = getElement(
            "history-next-page"
        );

        setText(
            "history-page-info",
            `${currentPage} / ${totalPages}`
        );

        if (previousButton) {
            previousButton.disabled = currentPage <= 1;
        }

        if (nextButton) {
            nextButton.disabled = currentPage >= totalPages;
        }
    }


    /* =====================================================
       19. 전체 렌더링
       ===================================================== */

    /**
     * script.js에서 호출:
     *
     * VioletHistory.render(state)
     */

    function render(state = currentState) {
        if (!ensureState(state)) {
            return;
        }

        currentState = state;

        if (!initializeLayout()) {
            return;
        }

        renderSummary();

        renderEntries();
    }


    /* =====================================================
       20. 필터 초기화
       ===================================================== */

    function resetFilters() {
        currentFilter = "all";

        currentSort = "newest";

        currentSearch = "";

        currentPage = 1;

        const searchInput = getElement("history-search");

        const filterSelect = getElement("history-filter");

        const sortSelect = getElement("history-sort");


        if (searchInput) {
            searchInput.value = "";
        }

        if (filterSelect) {
            filterSelect.value = "all";
        }

        if (sortSelect) {
            sortSelect.value = "newest";
        }

        renderEntries();
    }


    /* =====================================================
       21. 공개 API
       ===================================================== */

    const VioletHistory = {
        render,

        getEntries,

        getFilteredEntries,

        getTransactionDetails,

        getSummary,

        resetFilters,

        get totalEntries() {
            return getEntries().length;
        },

        get currentFilter() {
            return currentFilter;
        },

        get currentSort() {
            return currentSort;
        },

        get currentSearch() {
            return currentSearch;
        },

        get currentPage() {
            return currentPage;
        }
    };


    /* =====================================================
       22. 전역 등록
       ===================================================== */

    window.VioletHistory = VioletHistory;

    console.log(
        "[Violet Vault] 거래 기록 시스템 로드 완료."
    );

})();
