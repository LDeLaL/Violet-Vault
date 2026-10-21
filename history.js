/* =========================================================
   VIOLET VAULT
   Transaction History System — history.js
   ========================================================= */
(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const CURRENCY = DATA.CURRENCY || DATA.SETTINGS?.CURRENCY || "Q";
    const PAGE_SIZE = 25;

    let currentState = null;
    let currentFilter = "all";
    let currentSort = "newest";
    let currentSearch = "";
    let currentPage = 1;

    const $ = (id) => document.getElementById(id);

    function number(value, fallback = 0) {
        const result = Number(value);
        return Number.isFinite(result) ? result : fallback;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function fmt(value) {
        return number(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }

    function money(value) {
        return `${fmt(value)} ${CURRENCY}`;
    }

    function signedMoney(value) {
        const amount = number(value);
        return amount > 0
            ? `+${money(amount)}`
            : amount < 0
                ? `-${money(Math.abs(amount))}`
                : money(0);
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[char]);
    }

    function dateObject(timestamp) {
        const value = number(timestamp, NaN);
        if (!Number.isFinite(value) || value <= 0) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(timestamp) {
        const date = dateObject(timestamp);
        if (!date) return "날짜 정보 없음";
        return date.toLocaleString("ko-KR", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit",
            hour12: false
        });
    }

    function setText(id, value) {
        const element = $(id);
        if (element) element.textContent = String(value);
    }

    /* 게임 상태 및 저장 시스템 연결 */
    function resolveState(inputState) {
        if (inputState && typeof inputState === "object") return inputState;

        for (const store of [
            window.SaveStore,
            window.VioletVaultSave,
            window.VioletVaultApp
        ]) {
            if (store && typeof store.getState === "function") {
                try {
                    const state = store.getState();
                    if (state && typeof state === "object") return state;
                } catch (error) {
                    console.error(
                        "[Violet Vault History] 상태 읽기 실패:",
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

    function ensureState(inputState) {
        const state = resolveState(inputState);
        if (!state || typeof state !== "object") return false;
        if (!Array.isArray(state.history)) state.history = [];
        return true;
    }

    /* 이전 저장 파일의 거래 종류 이름과 호환 */
    function normalizeType(type) {
        const value = String(type || "other").trim();
        const aliases = {
            stockBuy: "stock_buy",
            stockSell: "stock_sell",
            "stock-buy": "stock_buy",
            "stock-sell": "stock_sell",
            buy_stock: "stock_buy",
            sell_stock: "stock_sell",
            purchase_stock: "stock_buy",
            sale_stock: "stock_sell",
            draw_money: "draw",
            loan_repayment: "repayment"
        };
        return aliases[value] || value;
    }

    const TYPES = {
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
        return TYPES[normalizeType(type)] || {
            label: "기타 거래",
            category: "other",
            symbol: "◇",
            className: "history-other"
        };
    }

    /* 거래 기록을 복사해 최신순으로 가져온다. */
    function getEntries(inputState = currentState) {
        const state = resolveState(inputState);
        if (!ensureState(state)) return [];

        return state.history
            .filter((entry) => entry && typeof entry === "object")
            .map((entry, index) => ({
                ...entry,
                type: normalizeType(entry.type),
                _originalIndex: index,
                timestamp: number(entry.timestamp, 0)
            }))
            .sort((a, b) =>
                b.timestamp - a.timestamp ||
                b._originalIndex - a._originalIndex
            );
    }

    /* 각 거래의 금액과 상세 정보를 계산한다. */
    function getTransactionDetails(entry) {
        const amount = number(entry.amount);
        const cost = number(entry.cost);
        const profit = number(entry.profit);

        switch (normalizeType(entry.type)) {
            case "draw": {
                const drawCost = cost > 0
                    ? cost
                    : number(DATA.DRAW_COST, 1);

                return {
                    title: "돈 뽑기",
                    description: `${money(amount)} 당첨 · ${money(drawCost)} 사용`,
                    amountLabel: "당첨금",
                    amountText: `+${money(amount)}`,
                    detailLabel: "잔액 순변화",
                    detailText: signedMoney(amount - drawCost),
                    resultClass: "history-amount-positive"
                };
            }

            case "loan":
                return {
                    title: "대출",
                    description: "대출 원금이 잔액에 추가됨",
                    amountLabel: "대출금",
                    amountText: `+${money(amount)}`,
                    detailLabel: "부채 증가",
                    detailText: `+${money(amount)}`,
                    resultClass: "history-amount-neutral"
                };

            case "repayment":
                return {
                    title: "대출 상환",
                    description: "대출 원금을 상환함",
                    amountLabel: "상환금",
                    amountText: `-${money(amount)}`,
                    detailLabel: "부채 감소",
                    detailText: `-${money(amount)}`,
                    resultClass: "history-amount-negative"
                };

            case "stock_buy": {
                const shares = Math.max(
                    0,
                    Math.floor(number(entry.shares))
                );
                const price = number(entry.price);

                return {
                    title: "주식 매수",
                    description: `${fmt(shares)}주 · 매수가 ${money(price)}`,
                    amountLabel: "매수 금액",
                    amountText: `-${money(amount)}`,
                    detailLabel: "매수 수량",
                    detailText: `${fmt(shares)}주`,
                    resultClass: "history-amount-negative"
                };
            }

            case "stock_sell": {
                const shares = Math.max(
                    0,
                    Math.floor(number(entry.shares))
                );
                const price = number(entry.price);

                const hasProfit =
                    entry.profit !== undefined &&
                    entry.profit !== null &&
                    Number.isFinite(Number(entry.profit));

                return {
                    title: "주식 매도",
                    description: `${fmt(shares)}주 · 매도가 ${money(price)}`,
                    amountLabel: "매도 금액",
                    amountText: `+${money(amount)}`,
                    detailLabel: "확정 손익",
                    detailText: hasProfit
                        ? signedMoney(profit)
                        : "손익 정보 없음",
                    resultClass: !hasProfit || profit === 0
                        ? "history-amount-neutral"
                        : profit > 0
                            ? "history-amount-positive"
                            : "history-amount-negative"
                };
            }

            default:
                return {
                    title: getTransactionType(entry.type).label,
                    description: "거래 기록",
                    amountLabel: "금액",
                    amountText: money(amount),
                    detailLabel: "상세 정보",
                    detailText: "추가 정보 없음",
                    resultClass: "history-amount-neutral"
                };
        }
    }

    /* 검색 */
    function matchesSearch(entry, search) {
        if (!search) return true;

        const type = getTransactionType(entry.type);
        const values = [
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

        return values
            .filter((value) => value !== undefined && value !== null)
            .join(" ")
            .toLowerCase()
            .includes(search);
    }

    /* 거래 종류 필터 */
    function matchesFilter(entry, filter) {
        return filter === "all" ||
            getTransactionType(entry.type).category === filter;
    }

    function getFilteredEntries() {
        const entries = getEntries(currentState)
            .filter((entry) =>
                matchesFilter(entry, currentFilter)
            )
            .filter((entry) =>
                matchesSearch(entry, currentSearch)
            );

        entries.sort((a, b) =>
            currentSort === "oldest"
                ? a.timestamp - b.timestamp ||
                  a._originalIndex - b._originalIndex
                : b.timestamp - a.timestamp ||
                  b._originalIndex - a._originalIndex
        );

        return entries;
    }

    function sum(entries) {
        return entries.reduce(
            (total, entry) => total + number(entry.amount),
            0
        );
    }

    /* 거래 요약 */
    function getSummary(inputState = currentState) {
        const entries = getEntries(resolveState(inputState));
        const draws = entries.filter((entry) => entry.type === "draw");
        const loans = entries.filter((entry) => entry.type === "loan");
        const repayments = entries.filter((entry) => entry.type === "repayment");
        const buys = entries.filter((entry) => entry.type === "stock_buy");
        const sells = entries.filter((entry) => entry.type === "stock_sell");

        return {
            totalTransactions: entries.length,
            totalDraws: draws.length,
            totalLoans: loans.length,
            totalRepayments: repayments.length,
            totalStockBuys: buys.length,
            totalStockSells: sells.length,
            totalLoanAmount: sum(loans),
            totalRepaidAmount: sum(repayments),
            totalStockBuyAmount: sum(buys),
            totalStockSellAmount: sum(sells)
        };
    }

    /* 거래 기록 화면 */
    function initializeLayout() {
        const container = $("history-content");
        if (!container) return false;
        if (container.dataset.historyReady === "true") return true;

        container.innerHTML = `
            <div class="history-interface">

                <div class="history-overview">
                    <div class="history-overview-card">
                        <span>전체 거래</span>
                        <strong id="history-total-count">0</strong>
                    </div>
                    <div class="history-overview-card">
                        <span>돈 뽑기</span>
                        <strong id="history-draw-count">0</strong>
                    </div>
                    <div class="history-overview-card">
                        <span>대출 · 상환</span>
                        <strong id="history-bank-count">0</strong>
                    </div>
                    <div class="history-overview-card">
                        <span>주식 거래</span>
                        <strong id="history-stock-count">0</strong>
                    </div>
                </div>

                <div class="history-toolbar">
                    <div class="history-search-wrapper">
                        <label class="history-visually-hidden" for="history-search">
                            거래 기록 검색
                        </label>
                        <span class="history-search-icon" aria-hidden="true">⌕</span>
                        <input
                            id="history-search"
                            class="history-search"
                            type="search"
                            placeholder="거래, 기업 이름, 금액 검색..."
                            autocomplete="off">
                    </div>

                    <div class="history-filter-row">
                        <label class="history-visually-hidden" for="history-filter">
                            거래 종류
                        </label>
                        <select id="history-filter" class="history-filter">
                            <option value="all">전체 거래</option>
                            <option value="draw">돈 뽑기</option>
                            <option value="bank">대출 · 상환</option>
                            <option value="stock">주식 거래</option>
                            <option value="other">기타 거래</option>
                        </select>

                        <label class="history-visually-hidden" for="history-sort">
                            거래 정렬
                        </label>
                        <select id="history-sort" class="history-sort">
                            <option value="newest">최신순</option>
                            <option value="oldest">과거순</option>
                        </select>
                    </div>
                </div>

                <div class="history-list-wrapper">
                    <div class="history-list-heading">
                        <h3>거래 내역</h3>
                        <span id="history-visible-count">0건</span>
                    </div>

                    <div id="history-list" class="history-list"></div>

                    <div id="history-empty" class="history-empty" hidden>
                        아직 거래 기록이 없어.
                    </div>
                </div>

                <div class="history-pagination">
                    <button
                        id="history-prev-page"
                        class="history-page-button"
                        type="button">
                        ← 이전
                    </button>
                    <span id="history-page-info">1 / 1</span>
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
            </div>`;

        container.dataset.historyReady = "true";
        bindEvents();
        return true;
    }

    /* 이벤트가 중복 등록되지 않도록 처리 */
    function bindOne(id, eventName, handler) {
        const element = $(id);
        if (!element || element.dataset.historyBound === "true") return;

        element.dataset.historyBound = "true";
        element.addEventListener(eventName, handler);
    }

    function bindEvents() {
        bindOne("history-search", "input", () => {
            currentSearch = $("history-search").value.trim().toLowerCase();
            currentPage = 1;
            renderEntries();
        });

        bindOne("history-filter", "change", () => {
            currentFilter = $("history-filter").value;
            currentPage = 1;
            renderEntries();
        });

        bindOne("history-sort", "change", () => {
            currentSort = $("history-sort").value;
            currentPage = 1;
            renderEntries();
        });

        bindOne("history-prev-page", "click", () => {
            currentPage = Math.max(1, currentPage - 1);
            renderEntries();
        });

        bindOne("history-next-page", "click", () => {
            currentPage += 1;
            renderEntries();
        });
    }

    /* 거래 카드 */
    function createEntryCard(entry) {
        const type = getTransactionType(entry.type);
        const details = getTransactionDetails(entry);
        const stockName = entry.stockName ? String(entry.stockName) : "";
        const symbol = entry.symbol ? String(entry.symbol) : "";
        const heading = stockName
            ? `${details.title} · ${stockName}`
            : details.title;

        const metadata = [
            symbol,
            entry.id ? `거래 ID: ${String(entry.id).slice(0, 18)}` : ""
        ].filter(Boolean).join(" · ");

        const date = dateObject(entry.timestamp);
        const dateTime = date ? date.toISOString() : "";

        return `
            <article
                class="history-entry ${escapeHTML(type.className)}"
                data-history-type="${escapeHTML(entry.type || "other")}">

                <div class="history-entry-icon">
                    ${escapeHTML(type.symbol)}
                </div>

                <div class="history-entry-content">
                    <div class="history-entry-heading">
                        <h4>${escapeHTML(heading)}</h4>
                        <span class="history-entry-type">
                            ${escapeHTML(type.label)}
                        </span>
                    </div>

                    <p class="history-entry-description">
                        ${escapeHTML(details.description)}
                    </p>

                    <div class="history-entry-details">
                        <div class="history-detail-item">
                            <span>${escapeHTML(details.amountLabel)}</span>
                            <strong class="${escapeHTML(details.resultClass)}">
                                ${escapeHTML(details.amountText)}
                            </strong>
                        </div>

                        <div class="history-detail-item">
                            <span>${escapeHTML(details.detailLabel)}</span>
                            <strong>${escapeHTML(details.detailText)}</strong>
                        </div>
                    </div>

                    <div class="history-entry-footer">
                        <time${dateTime ? ` datetime="${escapeHTML(dateTime)}"` : ""}>
                            ${escapeHTML(formatDate(entry.timestamp))}
                        </time>
                        ${metadata
                            ? `<span>${escapeHTML(metadata)}</span>`
                            : ""}
                    </div>
                </div>
            </article>`;
    }

    function renderSummary() {
        const summary = getSummary(currentState);

        setText("history-total-count", fmt(summary.totalTransactions));
        setText("history-draw-count", fmt(summary.totalDraws));
        setText(
            "history-bank-count",
            fmt(summary.totalLoans + summary.totalRepayments)
        );
        setText(
            "history-stock-count",
            fmt(summary.totalStockBuys + summary.totalStockSells)
        );
    }

    function updatePagination(totalPages) {
        const previous = $("history-prev-page");
        const next = $("history-next-page");

        setText("history-page-info", `${currentPage} / ${totalPages}`);

        if (previous) previous.disabled = currentPage <= 1;
        if (next) next.disabled = currentPage >= totalPages;
    }

    function renderEntries() {
        const list = $("history-list");
        const empty = $("history-empty");
        const visibleCount = $("history-visible-count");

        if (!list) return;

        const entries = getFilteredEntries();
        const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));

        currentPage = clamp(currentPage, 1, totalPages);

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageEntries = entries.slice(
            startIndex,
            startIndex + PAGE_SIZE
        );

        if (visibleCount) {
            visibleCount.textContent = `${fmt(entries.length)}건`;
        }

        if (entries.length === 0) {
            list.innerHTML = "";

            if (empty) {
                empty.hidden = false;
                empty.textContent = currentSearch || currentFilter !== "all"
                    ? "조건에 맞는 거래 기록이 없어."
                    : "아직 거래 기록이 없어. 첫 뽑기를 진행해 봐!";
            }
        } else {
            if (empty) empty.hidden = true;
            list.innerHTML = pageEntries.map(createEntryCard).join("");
        }

        updatePagination(totalPages);
    }

    function render(inputState = currentState) {
        const state = resolveState(inputState);
        if (!ensureState(state)) return false;

        currentState = state;

        if (!initializeLayout()) return false;

        renderSummary();
        renderEntries();
        return true;
    }

    function resetFilters() {
        currentFilter = "all";
        currentSort = "newest";
        currentSearch = "";
        currentPage = 1;

        const search = $("history-search");
        const filter = $("history-filter");
        const sort = $("history-sort");

        if (search) search.value = "";
        if (filter) filter.value = "all";
        if (sort) sort.value = "newest";

        renderEntries();
    }

    const VioletHistory = {
        init: render,
        render,
        refresh: () => render(resolveState()),
        getEntries,
        getFilteredEntries,
        getTransactionType,
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

    window.VioletHistory = VioletHistory;

    /* 거래 기록 화면이 준비된 경우 데이터 변경을 반영한다. */
    window.addEventListener("game:data-changed", (event) => {
        const container = $("history-content");

        if (!container || container.dataset.historyReady !== "true") {
            return;
        }

        const state = resolveState(event?.detail?.state);
        if (state) render(state);
    });

    console.log("[Violet Vault] 거래 기록 시스템 로드 완료.");
})();
