```javascript
/* =========================================================
   VIOLET VAULT
   Virtual Stock Market — stock.js
   =========================================================

   담당 기능
   - 가상 기업 목록 표시
   - 주가 변동 시뮬레이션
   - 주식 매수 및 매도
   - 보유 주식 수량 관리
   - 평균 매수 가격 계산
   - 주식 평가 금액 계산
   - 확정 손익 계산
   - 가격 변동 기록 및 간단한 차트
   - 거래 기록 저장
   - 경제 및 업적 시스템 연동

   연결 파일
   - index.html
   - stock.css
   - data.js
   - economy.js
   - save.js
   - achievements.js
   - script.js

   중요
   - 모든 주식은 가상 기업의 주식이다.
   - 실제 주식시장과 연결되지 않는다.
   - 주식 거래는 게임 안의 Q를 사용한다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const CURRENCY = DATA.CURRENCY || "Q";

    // 주가 갱신 간격: 20초
    const MARKET_UPDATE_INTERVAL = 20000;

    // 가격 기록은 최근 30개까지 보관
    const PRICE_HISTORY_LIMIT = 30;

    // 한 번의 주문으로 매매할 수 있는 최대 주식 수
    const MAX_ORDER_QUANTITY = 1000000;

    let marketTimer = null;
    let eventsBound = false;


    /* =====================================================
       2. 기본 기업 데이터
       ===================================================== */

    const FALLBACK_STOCKS = [
        {
            id: "violet-tech",
            name: "Violet Technologies",
            symbol: "VLT",
            description: "차세대 기술을 연구하는 가상 기업.",
            initialPrice: 50,
            volatility: 0.04,
            color: "#bd83ff"
        },
        {
            id: "crystal-energy",
            name: "Crystal Energy",
            symbol: "CRY",
            description: "에너지 산업을 운영하는 가상 기업.",
            initialPrice: 35,
            volatility: 0.03,
            color: "#73dca5"
        },
        {
            id: "nebula-industries",
            name: "Nebula Industries",
            symbol: "NEB",
            description: "우주 산업에 투자하는 가상 기업.",
            initialPrice: 80,
            volatility: 0.06,
            color: "#62a9ff"
        },
        {
            id: "shadow-media",
            name: "Shadow Media",
            symbol: "SHD",
            description: "게임과 미디어를 제작하는 가상 기업.",
            initialPrice: 25,
            volatility: 0.05,
            color: "#ff80d0"
        },
        {
            id: "royal-finance",
            name: "Royal Finance",
            symbol: "RYF",
            description: "금융 서비스를 제공하는 가상 기업.",
            initialPrice: 100,
            volatility: 0.025,
            color: "#ffcf70"
        }
    ];


    function getStockDefinitions() {
        const source = Array.isArray(DATA.STOCKS) &&
            DATA.STOCKS.length > 0
                ? DATA.STOCKS
                : FALLBACK_STOCKS;

        return source
            .filter(stock =>
                stock &&
                typeof stock.id === "string" &&
                /^[a-zA-Z0-9_-]+$/.test(stock.id)
            )
            .map(stock => ({
                id: stock.id,
                name: String(stock.name || stock.id),
                symbol: String(stock.symbol || stock.id).toUpperCase(),
                description: String(stock.description || ""),
                initialPrice: Math.max(
                    0.01,
                    roundMoney(stock.initialPrice || 1)
                ),
                volatility: clamp(
                    safeNumber(stock.volatility, 0.03),
                    0,
                    0.5
                ),
                color: /^#[0-9a-fA-F]{3,8}$/.test(
                    String(stock.color || "")
                )
                    ? stock.color
                    : "#a855f7"
            }));
    }


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


    function roundMoney(value) {
        return Math.round(
            (safeNumber(value) + Number.EPSILON) * 100
        ) / 100;
    }


    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }


    function random(min, max) {
        return Math.random() * (max - min) + min;
    }


    function formatNumber(value) {
        return roundMoney(value).toLocaleString("en-US", {
            minimumFractionDigits: 0,
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


    /* =====================================================
       4. 게임 상태 및 모듈 연결
       ===================================================== */

    function getApp() {
        return window.VioletVaultApp || null;
    }


    function getState() {
        const app = getApp();

        return app ? app.state : null;
    }


    function getEconomy() {
        return window.VioletEconomy || null;
    }


    function ensureState(state) {
        if (!state || typeof state !== "object") {
            return false;
        }

        if (
            !state.stocks ||
            typeof state.stocks !== "object" ||
            Array.isArray(state.stocks)
        ) {
            state.stocks = {};
        }

        if (!Array.isArray(state.history)) {
            state.history = [];
        }

        if (!Number.isFinite(Number(state.balance))) {
            state.balance = 0;
        }

        if (!Number.isFinite(Number(state.stockPortfolioValue))) {
            state.stockPortfolioValue = 0;
        }

        if (!Number.isFinite(Number(state.stockRealizedProfit))) {
            state.stockRealizedProfit = 0;
        }

        return true;
    }


    function notify(title, message) {
        const app = getApp();

        if (app && typeof app.toast === "function") {
            app.toast(title, message);
        } else {
            console.log(`[Violet Vault Stock] ${title}: ${message}`);
        }
    }


    function persistState(state) {
        const app = getApp();

        if (app && typeof app.save === "function") {
            app.save();
            return;
        }

        if (
            window.VioletVaultSave &&
            typeof window.VioletVaultSave.save === "function"
        ) {
            window.VioletVaultSave.save(state);
        }
    }


    function refreshApplication() {
        const app = getApp();

        if (app && typeof app.render === "function") {
            app.render();
        } else {
            render(getState());
        }
    }


    function recordTransaction(state, entry) {
        const app = getApp();

        if (app && typeof app.addHistory === "function") {
            app.addHistory(entry);
            return;
        }

        state.history.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            ...entry
        });

        const limit = Math.max(
            1,
            Math.floor(safeNumber(DATA.HISTORY_LIMIT, 300))
        );

        if (state.history.length > limit) {
            state.history.length = limit;
        }
    }


    function checkAchievements(state) {
        const achievements = window.VioletAchievements;

        if (
            achievements &&
            typeof achievements.check === "function"
        ) {
            achievements.check(state);
        }
    }


    /* =====================================================
       5. 기업 데이터 조회
       ===================================================== */

    function getDefinition(stockId) {
        return getStockDefinitions().find(
            stock => stock.id === stockId
        ) || null;
    }


    function getStockState(stockId, state = getState()) {
        if (!ensureState(state)) {
            return null;
        }

        const definition = getDefinition(stockId);

        if (!definition) {
            return null;
        }

        const stock = state.stocks[stockId];

        if (!stock || typeof stock !== "object") {
            return null;
        }

        return stock;
    }


    function getAllStockStates(state = getState()) {
        if (!ensureState(state)) {
            return [];
        }

        return getStockDefinitions().map(definition => ({
            definition,
            stock: state.stocks[definition.id]
        })).filter(item =>
            item.stock &&
            typeof item.stock === "object"
        );
    }


    /* =====================================================
       6. 시장 초기화
       ===================================================== */

    function initializeMarkets(state) {
        if (!ensureState(state)) {
            return false;
        }

        const now = Date.now();

        const definitions = getStockDefinitions();

        definitions.forEach(definition => {
            let stock = state.stocks[definition.id];

            if (!stock || typeof stock !== "object") {
                stock = {};

                state.stocks[definition.id] = stock;
            }

            const currentPrice = Number(stock.currentPrice);

            stock.currentPrice =
                Number.isFinite(currentPrice) && currentPrice > 0
                    ? roundMoney(currentPrice)
                    : definition.initialPrice;

            const previousPrice = Number(stock.previousPrice);

            stock.previousPrice =
                Number.isFinite(previousPrice) && previousPrice > 0
                    ? roundMoney(previousPrice)
                    : stock.currentPrice;

            stock.shares = Math.max(
                0,
                Math.floor(safeNumber(stock.shares))
            );

            stock.averageCost = Math.max(
                0,
                roundMoney(stock.averageCost)
            );

            stock.priceHistory = Array.isArray(stock.priceHistory)
                ? stock.priceHistory
                    .map(value => Number(value))
                    .filter(value =>
                        Number.isFinite(value) && value > 0
                    )
                    .slice(-PRICE_HISTORY_LIMIT)
                : [];

            if (stock.priceHistory.length === 0) {
                stock.priceHistory.push(stock.currentPrice);
            }

            stock.previousPrice = Math.max(
                0.01,
                stock.previousPrice
            );

            stock.currentPrice = Math.max(
                0.01,
                stock.currentPrice
            );
        });

        if (
            !Number.isFinite(Number(state.marketLastUpdatedAt))
        ) {
            state.marketLastUpdatedAt = now;
        }

        /*
         * 사이트를 다시 열었을 때 경과한 시간에 따라
         * 일정 수의 가상 시장 변동을 처리한다.
         *
         * 지나치게 긴 공백이 있을 경우 최대 120회까지만
         * 따라잡도록 제한한다.
         */

        const elapsed = Math.max(
            0,
            now - state.marketLastUpdatedAt
        );

        const missedTicks = Math.min(
            120,
            Math.floor(elapsed / MARKET_UPDATE_INTERVAL)
        );

        if (missedTicks > 0) {
            for (let i = 0; i < missedTicks; i++) {
                updateMarketOnce(state, false);
            }

            state.marketLastUpdatedAt = now;
        }

        recalculatePortfolioValue(state);

        return true;
    }


    /* =====================================================
       7. 주가 변동
       ===================================================== */

    function updateMarketOnce(state, updateTimestamp = true) {
        if (!ensureState(state)) {
            return false;
        }

        const definitions = getStockDefinitions();

        definitions.forEach(definition => {
            const stock = state.stocks[definition.id];

            if (!stock) return;

            const oldPrice = Math.max(
                0.01,
                safeNumber(stock.currentPrice, definition.initialPrice)
            );

            stock.previousPrice = roundMoney(oldPrice);

            /*
             * 주가를 변동성 범위 안에서 무작위로 변화시킨다.
             *
             * 예:
             * 변동성 0.04 = 한 번의 변동에서 최대 약 ±4%
             *
             * 장기 상승이나 하락이 보장되지는 않는다.
             */

            const changeRate = random(
                -definition.volatility,
                definition.volatility
            );

            const newPrice = Math.max(
                0.01,
                roundMoney(oldPrice * (1 + changeRate))
            );

            stock.currentPrice = newPrice;

            stock.priceHistory.push(newPrice);

            if (stock.priceHistory.length > PRICE_HISTORY_LIMIT) {
                stock.priceHistory.splice(
                    0,
                    stock.priceHistory.length - PRICE_HISTORY_LIMIT
                );
            }
        });

        if (updateTimestamp) {
            state.marketLastUpdatedAt = Date.now();
        }

        recalculatePortfolioValue(state);

        return true;
    }


    function tickMarket() {
        const state = getState();

        if (!ensureState(state)) {
            return;
        }

        updateMarketOnce(state, true);

        persistState(state);

        updateSummaryOnly(state);

        /*
         * 주식 화면이 열려 있고 입력창에 입력 중이 아닐 때만
         * 목록을 새로 렌더링한다.
         *
         * 가격 갱신으로 입력 중인 주문 수량이 지워지는 것을
         * 방지하기 위한 처리다.
         */

        const stockPanel = getElement("stock-panel");

        const activeElement = document.activeElement;

        const inputFocusedInsidePanel =
            stockPanel &&
            activeElement &&
            stockPanel.contains(activeElement) &&
            (
                activeElement.tagName === "INPUT" ||
                activeElement.tagName === "SELECT" ||
                activeElement.tagName === "TEXTAREA"
            );

        if (
            stockPanel &&
            !stockPanel.hidden &&
            !inputFocusedInsidePanel
        ) {
            render(state);
        }
    }


    function startMarketTimer() {
        if (marketTimer !== null) {
            return;
        }

        marketTimer = window.setInterval(
            tickMarket,
            MARKET_UPDATE_INTERVAL
        );
    }


    /* =====================================================
       8. 보유 자산 계산
       ===================================================== */

    function getHoldingValue(stock) {
        if (!stock) return 0;

        const shares = Math.max(
            0,
            Math.floor(safeNumber(stock.shares))
        );

        const price = Math.max(
            0,
            safeNumber(stock.currentPrice)
        );

        return roundMoney(shares * price);
    }


    function getCostBasis(stock) {
        if (!stock) return 0;

        const shares = Math.max(
            0,
            Math.floor(safeNumber(stock.shares))
        );

        const averageCost = Math.max(
            0,
            safeNumber(stock.averageCost)
        );

        return roundMoney(shares * averageCost);
    }


    function getUnrealizedProfit(stock) {
        if (!stock) return 0;

        return roundMoney(
            getHoldingValue(stock) - getCostBasis(stock)
        );
    }


    function recalculatePortfolioValue(state = getState()) {
        if (!ensureState(state)) {
            return 0;
        }

        const totalValue = getAllStockStates(state).reduce(
            (sum, item) => sum + getHoldingValue(item.stock),
            0
        );

        state.stockPortfolioValue = roundMoney(totalValue);

        return state.stockPortfolioValue;
    }


    function getPortfolioValue(state = getState()) {
        return recalculatePortfolioValue(state);
    }


    function getTotalShares(state = getState()) {
        return getAllStockStates(state).reduce(
            (sum, item) => sum + item.stock.shares,
            0
        );
    }


    /* =====================================================
       9. 거래 수량 검증
       ===================================================== */

    function validateQuantity(value) {
        const quantity = Number(value);

        if (!Number.isSafeInteger(quantity)) {
            return {
                valid: false,
                quantity: 0,
                reason: "integer"
            };
        }

        if (quantity <= 0) {
            return {
                valid: false,
                quantity: 0,
                reason: "positive"
            };
        }

        if (quantity > MAX_ORDER_QUANTITY) {
            return {
                valid: false,
                quantity: 0,
                reason: "maximum"
            };
        }

        return {
            valid: true,
            quantity,
            reason: null
        };
    }


    /* =====================================================
       10. 주식 매수
       ===================================================== */

    function buy(stockId, requestedQuantity) {
        const state = getState();

        if (!ensureState(state)) {
            notify("오류", "게임 데이터를 불러오지 못했어.");
            return false;
        }

        initializeMarkets(state);

        const definition = getDefinition(stockId);
        const stock = getStockState(stockId, state);

        if (!definition || !stock) {
            notify("기업을 찾을 수 없어", "주식 목록을 다시 확인해 줘.");
            return false;
        }

        const validation = validateQuantity(requestedQuantity);

        if (!validation.valid) {
            const messages = {
                integer: "주식 수량은 정수로 입력해 줘.",
                positive: "매수 수량은 1주 이상이어야 해.",
                maximum: "한 번에 매수할 수 있는 최대 수량을 초과했어."
            };

            notify(
                "잘못된 수량",
                messages[validation.reason] || "수량을 다시 확인해 줘."
            );

            return false;
        }

        const quantity = validation.quantity;

        const price = stock.currentPrice;

        const totalCost = roundMoney(price * quantity);

        if (!Number.isFinite(totalCost) || totalCost <= 0) {
            notify("매수 실패", "매수 금액을 계산할 수 없어.");
            return false;
        }

        if (state.balance < totalCost) {
            notify(
                "잔액 부족",
                `필요 금액은 ${formatQ(totalCost)}이야.`
            );

            return false;
        }

        const economy = getEconomy();

        let success = false;

        if (economy && typeof economy.purchase === "function") {
            success = economy.purchase(state, totalCost);
        } else if (economy && typeof economy.spendMoney === "function") {
            success = economy.spendMoney(state, totalCost);
        } else {
            /*
             * 경제 모듈이 아직 연결되지 않은 경우의 기본 처리.
             */

            if (state.balance >= totalCost) {
                state.balance = roundMoney(
                    state.balance - totalCost
                );

                state.totalExpenses = roundMoney(
                    safeNumber(state.totalExpenses) + totalCost
                );

                success = true;
            }
        }

        if (!success) {
            notify(
                "매수 실패",
                "경제 시스템에서 거래를 처리하지 못했어."
            );

            return false;
        }

        const previousShares = stock.shares;

        const newShares = previousShares + quantity;

        const oldCost = previousShares * stock.averageCost;

        const newAverageCost = roundMoney(
            (oldCost + totalCost) / newShares
        );

        stock.shares = newShares;
        stock.averageCost = newAverageCost;

        recalculatePortfolioValue(state);

        recordTransaction(state, {
            type: "stock_buy",
            stockId: definition.id,
            stockName: definition.name,
            symbol: definition.symbol,
            shares: quantity,
            price,
            amount: totalCost
        });

        checkAchievements(state);

        persistState(state);
        refreshApplication();

        notify(
            "주식 매수 완료",
            `${definition.symbol} ${quantity}주를 ${formatQ(totalCost)}에 매수했어.`
        );

        return true;
    }


    /* =====================================================
       11. 주식 매도
       ===================================================== */

    function sell(stockId, requestedQuantity) {
        const state = getState();

        if (!ensureState(state)) {
            notify("오류", "게임 데이터를 불러오지 못했어.");
            return false;
        }

        initializeMarkets(state);

        const definition = getDefinition(stockId);
        const stock = getStockState(stockId, state);

        if (!definition || !stock) {
            notify("기업을 찾을 수 없어", "주식 목록을 다시 확인해 줘.");
            return false;
        }

        const validation = validateQuantity(requestedQuantity);

        if (!validation.valid) {
            const messages = {
                integer: "주식 수량은 정수로 입력해 줘.",
                positive: "매도 수량은 1주 이상이어야 해.",
                maximum: "매도 수량이 너무 많아."
            };

            notify(
                "잘못된 수량",
                messages[validation.reason] || "수량을 다시 확인해 줘."
            );

            return false;
        }

        const quantity = validation.quantity;

        if (quantity > stock.shares) {
            notify(
                "보유 수량 부족",
                `현재 보유한 주식은 ${formatNumber(stock.shares)}주야.`
            );

            return false;
        }

        const price = stock.currentPrice;

        const proceeds = roundMoney(price * quantity);

        if (!Number.isFinite(proceeds) || proceeds <= 0) {
            notify("매도 실패", "매도 금액을 계산할 수 없어.");
            return false;
        }

        const realizedProfit = roundMoney(
            (price - stock.averageCost) * quantity
        );

        const economy = getEconomy();

        let success = false;

        if (economy && typeof economy.addMoney === "function") {
            /*
             * 매도 대금은 현금으로 돌려받는다.
             *
             * 주식 매도 대금 전부를 새로운 수입으로 계산하면
             * 원금까지 총수입에 중복 합산될 수 있으므로
             * recordIncome은 false로 설정한다.
             */

            success = economy.addMoney(
                state,
                proceeds,
                {
                    recordIncome: false
                }
            );
        } else {
            state.balance = roundMoney(
                state.balance + proceeds
            );

            success = true;
        }

        if (!success) {
            notify(
                "매도 실패",
                "경제 시스템에서 거래를 처리하지 못했어."
            );

            return false;
        }

        stock.shares -= quantity;

        if (stock.shares <= 0) {
            stock.shares = 0;
            stock.averageCost = 0;
        }

        state.stockRealizedProfit = roundMoney(
            safeNumber(state.stockRealizedProfit) + realizedProfit
        );

        recalculatePortfolioValue(state);

        recordTransaction(state, {
            type: "stock_sell",
            stockId: definition.id,
            stockName: definition.name,
            symbol: definition.symbol,
            shares: quantity,
            price,
            amount: proceeds,
            profit: realizedProfit
        });

        checkAchievements(state);

        persistState(state);
        refreshApplication();

        const profitMessage = realizedProfit >= 0
            ? `확정 손익 +${formatQ(realizedProfit)}`
            : `확정 손익 -${formatQ(Math.abs(realizedProfit))}`;

        notify(
            "주식 매도 완료",
            `${definition.symbol} ${quantity}주를 ${formatQ(proceeds)}에 매도했어. ${profitMessage}`
        );

        return true;
    }


    /* =====================================================
       12. 기업 가격 차트
       ===================================================== */

    function createMiniChart(stock, color) {
        const history = Array.isArray(stock.priceHistory)
            ? stock.priceHistory.slice(-20)
            : [];

        if (history.length < 2) {
            return `
                <div class="stock-mini-chart" aria-label="가격 기록을 모으는 중">
                    <span class="stock-chart-placeholder">
                        가격 기록을 모으는 중
                    </span>
                </div>
            `;
        }

        const minPrice = Math.min(...history);
        const maxPrice = Math.max(...history);

        const range = Math.max(0.01, maxPrice - minPrice);

        const bars = history.map(price => {
            const height = 12 + (
                (price - minPrice) / range
            ) * 88;

            return `
                <span
                    class="stock-chart-bar"
                    style="height:${height}%;--stock-color:${color}"
                    title="${formatQ(price)}">
                </span>
            `;
        }).join("");

        return `
            <div
                class="stock-mini-chart"
                aria-label="최근 주가 변동">

                ${bars}

            </div>
        `;
    }


    /* =====================================================
       13. 시장 목록 렌더링
       ===================================================== */

    function renderMarketList(state) {
        const container = getElement("stock-list");

        if (!container) {
            return;
        }

        const items = getAllStockStates(state);

        if (items.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    표시할 가상 기업이 없어.
                </p>
            `;

            return;
        }

        container.innerHTML = items.map(({ definition, stock }) => {
            const price = stock.currentPrice;

            const change = roundMoney(
                price - stock.previousPrice
            );

            const changeRate = stock.previousPrice > 0
                ? change / stock.previousPrice * 100
                : 0;

            const direction = change > 0
                ? "up"
                : change < 0
                    ? "down"
                    : "neutral";

            const sign = change > 0
                ? "+"
                : "";

            const changeText = `${sign}${formatNumber(changeRate)}%`;

            const safeId = escapeHTML(definition.id);
            const safeSymbol = escapeHTML(definition.symbol);
            const safeName = escapeHTML(definition.name);
            const safeDescription = escapeHTML(definition.description);

            return `
                <article
                    class="stock-card"
                    data-stock-card="${safeId}"
                    style="--stock-color:${definition.color}">

                    <div class="stock-card-heading">

                        <div class="stock-company-icon">
                            ${safeSymbol.slice(0, 1)}
                        </div>

                        <div class="stock-company-info">
                            <strong class="stock-company-name">
                                ${safeName}
                            </strong>

                            <span class="stock-company-symbol">
                                ${safeSymbol}
                            </span>
                        </div>

                        <span class="stock-change stock-change-${direction}">
                            ${changeText}
                        </span>

                    </div>

                    <p class="stock-description">
                        ${safeDescription}
                    </p>

                    <div class="stock-price-row">
                        <div>
                            <span class="stock-price-label">
                                현재 주가
                            </span>

                            <strong class="stock-price">
                                ${formatQ(price)}
                            </strong>
                        </div>

                        <div class="stock-price-change">
                            <span>변동폭</span>

                            <strong class="stock-change-${direction}">
                                ${sign}${formatQ(change)}
                            </strong>
                        </div>
                    </div>

                    ${createMiniChart(stock, definition.color)}

                    <div class="stock-trade-row">

                        <label
                            class="stock-quantity-label"
                            for="stock-buy-${safeId}">
                            매수 수량
                        </label>

                        <input
                            id="stock-buy-${safeId}"
                            class="stock-quantity-input"
                            type="number"
                            min="1"
                            max="${MAX_ORDER_QUANTITY}"
                            step="1"
                            value="1"
                            inputmode="numeric"
                            data-stock-quantity="${safeId}"
                            aria-label="${safeName} 매수 수량">

                        <button
                            class="stock-buy-button"
                            type="button"
                            data-stock-action="buy"
                            data-stock-id="${safeId}">
                            매수
                        </button>

                    </div>

                    <div class="stock-card-footer">
                        <span>보유 주식</span>

                        <strong>
                            ${formatNumber(stock.shares)}주
                        </strong>

                        <span>보유 평가</span>

                        <strong>
                            ${formatQ(getHoldingValue(stock))}
                        </strong>
                    </div>

                </article>
            `;
        }).join("");
    }


    /* =====================================================
       14. 보유 주식 렌더링
       ===================================================== */

    function renderPortfolio(state) {
        const container = getElement("stock-portfolio");

        if (!container) {
            return;
        }

        const items = getAllStockStates(state).filter(
            item => item.stock.shares > 0
        );

        if (items.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    아직 보유한 주식이 없어. 위 목록에서 주식을 매수해 봐!
                </p>
            `;

            return;
        }

        container.innerHTML = items.map(({ definition, stock }) => {
            const value = getHoldingValue(stock);
            const costBasis = getCostBasis(stock);
            const unrealizedProfit = getUnrealizedProfit(stock);

            const profitClass = unrealizedProfit > 0
                ? "positive"
                : unrealizedProfit < 0
                    ? "negative"
                    : "neutral";

            const profitSign = unrealizedProfit > 0
                ? "+"
                : unrealizedProfit < 0
                    ? "-"
                    : "";

            const safeId = escapeHTML(definition.id);
            const safeName = escapeHTML(definition.name);
            const safeSymbol = escapeHTML(definition.symbol);

            return `
                <article
                    class="stock-portfolio-card"
                    data-portfolio-stock="${safeId}"
                    style="--stock-color:${definition.color}">

                    <div class="stock-portfolio-heading">

                        <div>
                            <strong>${safeName}</strong>

                            <span class="stock-company-symbol">
                                ${safeSymbol}
                            </span>
                        </div>

                        <span class="stock-holding-shares">
                            ${formatNumber(stock.shares)}주
                        </span>

                    </div>

                    <div class="stock-portfolio-stats">

                        <div>
                            <span>평균 매수가</span>
                            <strong>
                                ${formatQ(stock.averageCost)}
                            </strong>
                        </div>

                        <div>
                            <span>현재 평가 금액</span>
                            <strong>
                                ${formatQ(value)}
                            </strong>
                        </div>

                        <div>
                            <span>매수 원금</span>
                            <strong>
                                ${formatQ(costBasis)}
                            </strong>
                        </div>

                        <div>
                            <span>미실현 손익</span>
                            <strong class="stock-profit-${profitClass}">
                                ${profitSign}${formatQ(Math.abs(unrealizedProfit))}
                            </strong>
                        </div>

                    </div>

                    <div class="stock-sell-row">

                        <label
                            class="stock-quantity-label"
                            for="stock-sell-${safeId}">
                            매도 수량
                        </label>

                        <input
                            id="stock-sell-${safeId}"
                            class="stock-quantity-input"
                            type="number"
                            min="1"
                            max="${stock.shares}"
                            step="1"
                            value="1"
                            inputmode="numeric"
                            data-stock-sell-quantity="${safeId}"
                            aria-label="${safeName} 매도 수량">

                        <button
                            class="stock-sell-button"
                            type="button"
                            data-stock-action="sell"
                            data-stock-id="${safeId}">
                            매도
                        </button>

                        <button
                            class="stock-sell-all-button"
                            type="button"
                            data-stock-action="sell-all"
                            data-stock-id="${safeId}">
                            전량 매도
                        </button>

                    </div>

                </article>
            `;
        }).join("");
    }


    /* =====================================================
       15. 요약 정보 업데이트
       ===================================================== */

    function updateSummaryOnly(state) {
        if (!ensureState(state)) {
            return;
        }

        recalculatePortfolioValue(state);

        setText(
            "stock-portfolio-value",
            formatQ(state.stockPortfolioValue)
        );

        setText(
            "stock-realized-profit",
            formatQ(state.stockRealizedProfit)
        );

        const economy = getEconomy();

        let netWorth =
            safeNumber(state.balance) -
            safeNumber(state.debt) +
            safeNumber(state.stockPortfolioValue);

        if (economy && typeof economy.netWorth === "function") {
            netWorth = economy.netWorth(state);
        }

        setText("net-worth", formatQ(netWorth));
    }


    function setText(id, value) {
        const element = getElement(id);

        if (element) {
            element.textContent = String(value);
        }
    }


    /* =====================================================
       16. 전체 주식 화면 렌더링
       ===================================================== */

    function render(state = getState()) {
        if (!ensureState(state)) {
            return;
        }

        initializeMarkets(state);

        updateSummaryOnly(state);

        renderMarketList(state);

        renderPortfolio(state);
    }


    /* =====================================================
       17. 거래 버튼 이벤트
       ===================================================== */

    function getQuantityInput(stockId, action) {
        const attribute = action === "sell" || action === "sell-all"
            ? "data-stock-sell-quantity"
            : "data-stock-quantity";

        const inputs = document.querySelectorAll(
            `[${attribute}]`
        );

        return Array.from(inputs).find(input =>
            input.getAttribute(attribute) === stockId
        ) || null;
    }


    function handleStockAction(event) {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const button = target.closest("[data-stock-action]");

        if (!button) {
            return;
        }

        const action = button.dataset.stockAction;
        const stockId = button.dataset.stockId;

        if (!stockId) {
            return;
        }

        event.preventDefault();

        const input = getQuantityInput(stockId, action);

        let quantity = Number(input ? input.value : 1);

        if (action === "sell-all") {
            const stock = getStockState(stockId);

            quantity = stock
                ? stock.shares
                : 0;
        }

        if (action === "buy") {
            buy(stockId, quantity);
        } else if (action === "sell") {
            sell(stockId, quantity);
        } else if (action === "sell-all") {
            if (quantity > 0) {
                sell(stockId, quantity);
            } else {
                notify(
                    "보유 주식 없음",
                    "전량 매도할 주식이 없어."
                );
            }
        }
    }


    function bindEvents() {
        if (eventsBound) {
            return;
        }

        /*
         * 목록과 포트폴리오는 렌더링 과정에서
         * 내부 HTML이 교체되므로 상위 요소에 이벤트를 연결한다.
         */

        const panel = getElement("stock-panel");

        if (!panel) {
            return;
        }

        panel.addEventListener("click", handleStockAction);

        eventsBound = true;
    }


    /* =====================================================
       18. 주식 시스템 초기화
       ===================================================== */

    function init() {
        bindEvents();

        const state = getState();

        if (state) {
            initializeMarkets(state);
            render(state);
            persistState(state);
        }

        startMarketTimer();

        console.log(
            "[Violet Vault] 가상 주식 시스템 초기화 완료."
        );
    }


    /* =====================================================
       19. 공개 API
       ===================================================== */

    const VioletStock = {
        init,

        render,

        buy,

        sell,

        getDefinition,

        getStockState,

        getPortfolioValue,

        getTotalShares,

        getHoldingValue,

        getCostBasis,

        getUnrealizedProfit,

        recalculatePortfolioValue,

        updateMarket: tickMarket,

        getDefinitions: getStockDefinitions,

        get state() {
            return getState();
        },

        destroy() {
            if (marketTimer !== null) {
                clearInterval(marketTimer);
                marketTimer = null;
            }

            const panel = getElement("stock-panel");

            if (panel && eventsBound) {
                panel.removeEventListener(
                    "click",
                    handleStockAction
                );
            }

            eventsBound = false;
        }
    };


    /* =====================================================
       20. 전역 등록 및 시작
       ===================================================== */

    window.VioletStock = VioletStock;

    /*
     * index.html에서 stock.js는 defer로 로드된다.
     * 이 시점에는 HTML 요소들이 이미 준비되어 있으므로
     * 주식 화면에 이벤트를 연결할 수 있다.
     */

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }

    console.log(
        "[Violet Vault] 주식 시스템 로드 완료."
    );

})();
```
