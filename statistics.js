/* =========================================================
   VIOLET VAULT
   Statistics System — statistics.js
   Compatible with data.js, save.js, rarity.js, history.js,
   bank.js and stock.js
   ========================================================= */
(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const SETTINGS = DATA.SETTINGS || DATA;
    const CURRENCY = String(DATA.CURRENCY || SETTINGS.CURRENCY || "Q");
    const HISTORY_LIMIT = Math.max(1, numberValue(
        DATA.HISTORY_LIMIT ?? SETTINGS.HISTORY_LIMIT, 300
    ));
    const MIN_REWARD = numberValue(DATA.MIN_REWARD ?? SETTINGS.MIN_REWARD, 1);
    const MAX_REWARD = numberValue(DATA.MAX_REWARD ?? SETTINGS.MAX_REWARD, 100);
    const MAX_DISPLAY_DIGITS = 10;

    let currentState = null;
    let lastSummary = null;

    /* -----------------------------------------------------
       1. Utilities
       ----------------------------------------------------- */
    function numberValue(value, fallback = 0) {
        const valueAsNumber = Number(value);
        return Number.isFinite(valueAsNumber) ? valueAsNumber : fallback;
    }

    function toNumber(value, fallback = 0) {
        return numberValue(value, fallback);
    }

    function toNonNegativeInteger(value, fallback = 0) {
        return Math.max(0, Math.floor(toNumber(value, fallback)));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;",
            '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function formatNumber(value, maximumFractionDigits = 2) {
        return toNumber(value).toLocaleString("en-US", {
            maximumFractionDigits,
            minimumFractionDigits: 0
        });
    }

    function formatInteger(value) {
        return toNonNegativeInteger(value).toLocaleString("en-US");
    }

    function formatMoney(value) {
        return `${formatNumber(value)} ${CURRENCY}`;
    }

    function formatPercentage(value) {
        return `${formatNumber(value, 1)}%`;
    }

    function getPercentage(part, total) {
        return total > 0 ? part / total * 100 : 0;
    }

    function getSafeColor(color, fallback = "#b78aff") {
        const value = String(color || "").trim();
        return (/^#[0-9a-f]{3,8}$/i.test(value) ||
            /^rgba?\([\d\s.,%]+\)$/i.test(value) ||
            /^hsla?\([\d\s.,%deg]+\)$/i.test(value)) ? value : fallback;
    }

    function getSafeClassName(value, fallback = "") {
        const result = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "");
        return result || fallback;
    }

    function formatDate(timestamp) {
        if (!timestamp) return "날짜 정보 없음";
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
        return date.toLocaleDateString("ko-KR", {
            year: "numeric", month: "2-digit", day: "2-digit"
        });
    }

    function formatDateTime(timestamp) {
        if (!timestamp) return "날짜 정보 없음";
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) return "날짜 정보 없음";
        return date.toLocaleString("ko-KR", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit"
        });
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    /* -----------------------------------------------------
       2. State compatibility
       ----------------------------------------------------- */
    function resolveState(state) {
        if (state && typeof state === "object") return state;

        const stores = [window.SaveStore, window.VioletVaultSave, window.VioletVaultApp];
        for (const store of stores) {
            if (store && typeof store.getState === "function") {
                try {
                    const value = store.getState();
                    if (value && typeof value === "object") return value;
                } catch (error) {
                    console.warn("[VioletStatistics] 상태 읽기 실패:", error);
                }
            }
            if (store?.state && typeof store.state === "object") return store.state;
        }
        return currentState;
    }

    function normalizeState(state) {
        if (!state || typeof state !== "object") return null;

        if (!Array.isArray(state.history)) state.history = [];

        // Support both the current save format and older field names.
        if (!Number.isFinite(Number(state.totalIncome))) {
            state.totalIncome = numberValue(state.totalEarned, 0);
        }
        if (!Number.isFinite(Number(state.totalExpenses))) {
            state.totalExpenses = numberValue(state.totalSpent, 0);
        }
        if (!Number.isFinite(Number(state.bestWin))) {
            state.bestWin = numberValue(state.highestPrize, 0);
        }
        if (!Number.isFinite(Number(state.highestPrize))) {
            state.highestPrize = numberValue(state.bestWin, 0);
        }
        return state;
    }

    /* -----------------------------------------------------
       3. History access and transaction normalization
       ----------------------------------------------------- */
    function getHistory(state = currentState) {
        if (!state || !Array.isArray(state.history)) return [];
        return state.history.filter(entry => entry && typeof entry === "object");
    }

    function getEntryType(entry) {
        const raw = String(entry?.type || entry?.transactionType || entry?.category || "other").toLowerCase();
        const aliases = {
            drawing: "draw",
            draw_reward: "draw",
            reward: "draw",
            borrow: "loan",
            debt_repayment: "repayment",
            loan_repayment: "repayment",
            stock_purchase: "stock_buy",
            purchase_stock: "stock_buy",
            buy_stock: "stock_buy",
            "stock-buy": "stock_buy",
            stock_sale: "stock_sell",
            sale_stock: "stock_sell",
            sell_stock: "stock_sell",
            "stock-sell": "stock_sell"
        };
        return aliases[raw] || raw;
    }

    function isDrawEntry(entry) {
        return getEntryType(entry) === "draw";
    }

    function isBankEntry(entry) {
        return ["loan", "repayment", "borrow", "bank", "debt_repayment"].includes(getEntryType(entry));
    }

    function isStockEntry(entry) {
        return ["stock_buy", "stock_sell"].includes(getEntryType(entry));
    }

    function getTimestamp(entry) {
        const raw = entry?.timestamp ?? entry?.at ?? entry?.time ?? 0;
        const value = typeof raw === "string" && raw.trim() !== "" && !Number.isFinite(Number(raw))
            ? Date.parse(raw)
            : Number(raw);
        return Number.isFinite(value) && value >= 0 ? value : 0;
    }

    function getDrawReward(entry) {
        if (!entry || typeof entry !== "object") return null;
        const raw = entry.reward ?? entry.prize ?? entry.amount ?? entry.value;
        if (raw === undefined || raw === null || raw === "") return null;
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < MIN_REWARD || amount > MAX_REWARD) return null;
        return amount;
    }

    function getDrawCost(entry) {
        const configured = numberValue(DATA.DRAW_COST ?? SETTINGS.DRAW_COST, 1);
        const raw = entry?.cost;
        const cost = raw === undefined || raw === null || raw === "" ? configured : Number(raw);
        return Number.isFinite(cost) ? Math.max(0, cost) : configured;
    }

    function getDrawEntries(state = currentState) {
        return getHistory(state)
            .filter(isDrawEntry)
            .map((entry, index) => ({
                entry,
                index,
                reward: getDrawReward(entry),
                cost: getDrawCost(entry),
                timestamp: getTimestamp(entry)
            }))
            .filter(item => item.reward !== null)
            .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);
    }

    function getTransactionEntries(state = currentState) {
        return getHistory(state).filter(entry => isBankEntry(entry) || isStockEntry(entry));
    }

    /* -----------------------------------------------------
       4. Number analysis
       ----------------------------------------------------- */
    function isPrime(number) {
        const value = Math.floor(toNumber(number));
        if (value < 2) return false;
        if (value === 2) return true;
        if (value % 2 === 0) return false;
        for (let divisor = 3; divisor <= Math.sqrt(value); divisor += 2) {
            if (value % divisor === 0) return false;
        }
        return true;
    }

    function getOddEvenStats(entries) {
        const result = { odd: 0, even: 0, total: 0 };
        entries.forEach(item => {
            if (Math.floor(item.reward) % 2 === 0) result.even++;
            else result.odd++;
            result.total++;
        });
        return result;
    }

    function getPrimeCompositeStats(entries) {
        const result = { prime: 0, composite: 0, neither: 0, total: 0 };
        entries.forEach(item => {
            const amount = Math.floor(item.reward);
            if (amount < 2) result.neither++;
            else if (isPrime(amount)) result.prime++;
            else result.composite++;
            result.total++;
        });
        return result;
    }

    function getDigitStats(entries) {
        const digits = Array.from({ length: MAX_DISPLAY_DIGITS }, (_, digit) => ({
            digit, count: 0, percentage: 0
        }));
        let totalDigits = 0;
        entries.forEach(item => {
            for (const character of String(Math.floor(item.reward))) {
                const digit = Number(character);
                if (Number.isInteger(digit) && digit >= 0 && digit <= 9) {
                    digits[digit].count++;
                    totalDigits++;
                }
            }
        });
        digits.forEach(item => {
            item.percentage = getPercentage(item.count, totalDigits);
        });
        return { digits, totalDigits };
    }

    function getRewardRangeStats(entries) {
        const ranges = [];
        for (let start = MIN_REWARD; start <= MAX_REWARD; start += 10) {
            const end = Math.min(start + 9, MAX_REWARD);
            ranges.push({ start, end, label: `${start}–${end}`, count: 0, percentage: 0 });
        }
        entries.forEach(item => {
            const range = ranges.find(candidate => item.reward >= candidate.start && item.reward <= candidate.end);
            if (range) range.count++;
        });
        ranges.forEach(range => {
            range.percentage = getPercentage(range.count, entries.length);
        });
        return ranges;
    }

    /* -----------------------------------------------------
       5. Rarity analysis
       ----------------------------------------------------- */
    function getRarityDefinitions() {
        const module = window.VioletRarity;
        if (typeof module?.getAllRarities === "function") {
            try {
                const items = module.getAllRarities();
                if (Array.isArray(items) && items.length) return items;
            } catch (error) {
                console.warn("[VioletStatistics] 희귀도 목록 조회 실패:", error);
            }
        }
        if (Array.isArray(DATA.RARITIES)) return DATA.RARITIES.filter(item => item && typeof item === "object");
        if (DATA.RARITIES && typeof DATA.RARITIES === "object") {
            return Object.entries(DATA.RARITIES)
                .filter(([, item]) => item && typeof item === "object")
                .map(([id, item]) => ({ id, ...item }));
        }
        return [];
    }

    function getRarityInfo(amount) {
        if (typeof window.VioletRarity?.getRarityInfo === "function") {
            try {
                const info = window.VioletRarity.getRarityInfo(amount);
                if (info && typeof info === "object") return info;
            } catch (error) {
                console.warn("[VioletStatistics] 희귀도 계산 실패:", error);
            }
        }
        if (typeof DATA.getRarityByAmount === "function") {
            try {
                const rarity = DATA.getRarityByAmount(amount);
                if (rarity && typeof rarity === "object") return rarity;
            } catch (_) {}
        }
        const definition = getRarityDefinitions().find(item =>
            Number(amount) >= numberValue(item.min ?? item.minAmount, MIN_REWARD) &&
            Number(amount) <= numberValue(item.max ?? item.maxAmount, MAX_REWARD)
        );
        return definition || {
            id: "unknown", name: "Unknown", label: "알 수 없음",
            color: "#a59bb8", symbol: "◇"
        };
    }

    function getRarityName(info) {
        return String(info?.name || info?.label || info?.title || info?.id || "알 수 없음");
    }

    function getRarityColor(info) {
        return getSafeColor(info?.color || info?.colour, "#a59bb8");
    }

    function getRarityStats(entries) {
        const result = getRarityDefinitions().map(rarity => ({
            id: String(rarity.id || rarity.key || rarity.name || ""),
            name: getRarityName(rarity),
            color: getRarityColor(rarity),
            symbol: String(rarity.symbol || rarity.icon || "◇"),
            count: 0,
            percentage: 0
        }));

        entries.forEach(item => {
            const info = getRarityInfo(item.reward);
            const id = String(info.id || info.key || info.name || info.label || "");
            const name = getRarityName(info);
            let target = result.find(rarity => rarity.id === id || rarity.name === name);
            if (!target) {
                target = {
                    id: id || `rarity-${result.length}`,
                    name,
                    color: getRarityColor(info),
                    symbol: String(info.symbol || "◇"),
                    count: 0,
                    percentage: 0
                };
                result.push(target);
            }
            target.count++;
        });

        result.forEach(rarity => {
            rarity.percentage = getPercentage(rarity.count, entries.length);
        });
        return result;
    }

    function getRecentDraws(entries, limit = 10) {
        return entries.slice(-limit).reverse().map(item => {
            const rarity = getRarityInfo(item.reward);
            return {
                amount: item.reward,
                cost: item.cost,
                timestamp: item.timestamp,
                rarity: getRarityName(rarity),
                color: getRarityColor(rarity)
            };
        });
    }

    /* -----------------------------------------------------
       6. Bank and stock calculations
       ----------------------------------------------------- */
    function getStockPortfolioValue(state) {
        if (!state) return 0;

        let value = Math.max(0, toNumber(state.stockPortfolioValue, 0));
        if (typeof window.VioletStock?.getPortfolioValue === "function") {
            try {
                const computed = window.VioletStock.getPortfolioValue(state);
                if (Number.isFinite(Number(computed))) value = Math.max(0, Number(computed));
            } catch (_) {
                // Use stored value when the stock module cannot calculate it.
            }
        }

        if (value === 0 && state.stocks && typeof state.stocks === "object") {
            const stocks = Array.isArray(DATA.STOCKS) ? DATA.STOCKS : [];
            value = stocks.reduce((total, stock) => {
                const holding = state.stocks[stock.id] || {};
                const shares = Math.max(0, toNumber(holding.shares, 0));
                const currentPrice = Math.max(0, toNumber(
                    holding.currentPrice ?? holding.price ?? stock.initialPrice, 0
                ));
                return total + shares * currentPrice;
            }, 0);
        }
        return value;
    }

    function getBankStats(state) {
        const result = {
            loans: 0,
            repayments: 0,
            totalBorrowed: 0,
            totalRepaid: 0,
            currentDebt: Math.max(0, toNumber(state?.debt, 0))
        };
        getHistory(state).forEach(entry => {
            const type = getEntryType(entry);
            const amount = Math.max(0, toNumber(entry.amount, 0));
            if (type === "loan") {
                result.loans++;
                result.totalBorrowed += amount;
            } else if (type === "repayment") {
                result.repayments++;
                result.totalRepaid += amount;
            }
        });
        return result;
    }

    function getStockStats(state) {
        const result = {
            purchases: 0, sales: 0, sharesBought: 0, sharesSold: 0,
            totalPurchaseCost: 0, totalSaleProceeds: 0,
            realizedProfit: toNumber(state?.stockRealizedProfit, 0)
        };
        getHistory(state).forEach(entry => {
            const type = getEntryType(entry);
            const amount = Math.max(0, toNumber(entry.amount, 0));
            const shares = Math.max(0, toNumber(entry.shares, 0));
            if (type === "stock_buy") {
                result.purchases++;
                result.sharesBought += shares;
                result.totalPurchaseCost += amount;
            } else if (type === "stock_sell") {
                result.sales++;
                result.sharesSold += shares;
                result.totalSaleProceeds += amount;
            }
        });
        return result;
    }

    /* -----------------------------------------------------
       7. Complete summary
       ----------------------------------------------------- */
    function getSummary(inputState = currentState) {
        const state = normalizeState(resolveState(inputState));
        if (!state) return null;

        const drawEntries = getDrawEntries(state);
        const rewards = drawEntries.map(item => item.reward);
        const recordedDraws = rewards.length;
        const rewardSum = rewards.reduce((sum, reward) => sum + reward, 0);
        const rewardAverage = recordedDraws ? rewardSum / recordedDraws : 0;
        const rewardMinimum = recordedDraws ? Math.min(...rewards) : 0;
        const rewardMaximum = recordedDraws ? Math.max(...rewards) : 0;
        const totalDraws = Math.max(toNonNegativeInteger(state.totalDraws), recordedDraws);

        const balance = Math.max(0, toNumber(state.balance, 0));
        const debt = Math.max(0, toNumber(state.debt, 0));
        const portfolioValue = getStockPortfolioValue(state);
        const totalIncome = toNumber(state.totalIncome ?? state.totalEarned, 0);
        const totalExpenses = toNumber(state.totalExpenses ?? state.totalSpent, 0);
        const bank = getBankStats(state);
        const stock = getStockStats(state);

        return {
            totalDraws,
            recordedDraws,
            recordedHistory: getHistory(state).length,
            totalIncome,
            totalExpenses,
            balance,
            debt,
            portfolioValue,
            netWorth: balance + portfolioValue - debt,
            rewardSum,
            rewardAverage,
            rewardMinimum,
            rewardMaximum,
            lifetimeBestWin: Math.max(
                toNumber(state.bestWin ?? state.highestPrize, 0),
                rewardMaximum
            ),
            oddEven: getOddEvenStats(drawEntries),
            primeComposite: getPrimeCompositeStats(drawEntries),
            digitStats: getDigitStats(drawEntries),
            rarityStats: getRarityStats(drawEntries),
            rewardRanges: getRewardRangeStats(drawEntries),
            recentDraws: getRecentDraws(drawEntries, 10),
            bank,
            stock,
            drawsWithReward: recordedDraws,
            uniqueRewards: new Set(rewards).size,
            drawCostsInHistory: drawEntries.reduce((sum, item) => sum + item.cost, 0)
        };
    }

    /* -----------------------------------------------------
       8. Reusable HTML components
       ----------------------------------------------------- */
    function renderSectionHeader(title, eyebrow, description) {
        return `
            <div class="statistics-section-header">
                <div class="statistics-section-heading">
                    <span class="statistics-section-eyebrow">${escapeHTML(eyebrow)}</span>
                    <h3 class="statistics-section-title">${escapeHTML(title)}</h3>
                    <p class="statistics-section-description">${escapeHTML(description)}</p>
                </div>
            </div>`;
    }

    function renderNoDataMessage(message) {
        return `
            <div class="statistics-no-data">
                <span class="statistics-no-data-icon">◇</span>
                <p>${escapeHTML(message)}</p>
            </div>`;
    }

    function renderActivityCard(label, value, note, color = "purple") {
        return `
            <article class="statistics-card statistics-activity-card ${getSafeClassName(color, "purple")}">
                <div class="statistics-card-top">
                    <span class="statistics-card-label">${escapeHTML(label)}</span>
                    <span class="statistics-card-icon" aria-hidden="true">✧</span>
                </div>
                <strong class="statistics-card-value">${escapeHTML(value)}</strong>
                <span class="statistics-card-note">${escapeHTML(note)}</span>
            </article>`;
    }

    function renderNumberSummaryRow(title, description, count, percentage, color) {
        return `
            <div class="statistics-number-row">
                <span class="statistics-number-dot" style="--statistics-accent:${getSafeColor(color)}"></span>
                <div class="statistics-number-row-main">
                    <strong>${escapeHTML(title)}</strong>
                    <small>${escapeHTML(description)}</small>
                </div>
                <div class="statistics-number-row-value">
                    <strong>${formatInteger(count)}</strong>
                    <small>${formatPercentage(percentage)}</small>
                </div>
            </div>`;
    }

    function renderDistributionRow(label, count, percentage, color) {
        const width = clamp(percentage, 0, 100);
        return `
            <div class="statistics-distribution-row">
                <div class="statistics-distribution-label">
                    <span>${escapeHTML(label)}</span>
                    <strong>${formatInteger(count)} <small>회</small></strong>
                </div>
                <div class="statistics-distribution-track" role="progressbar"
                     aria-label="${escapeHTML(label)} 비율" aria-valuemin="0"
                     aria-valuemax="100" aria-valuenow="${width}">
                    <div class="statistics-distribution-fill"
                         style="width:${width}%;background:${getSafeColor(color)}"></div>
                </div>
                <div class="statistics-distribution-percent">${formatPercentage(percentage)}</div>
            </div>`;
    }

    /* -----------------------------------------------------
       9. Overview cards
       ----------------------------------------------------- */
    function renderOverview(summary) {
        const cards = [
            { label: "누적 뽑기", value: formatInteger(summary.totalDraws), note: "전체 누적 횟수", className: "purple", icon: "◇" },
            { label: "누적 수입", value: formatMoney(summary.totalIncome), note: "기록된 전체 수입", className: "green", icon: "↗" },
            { label: "누적 지출", value: formatMoney(summary.totalExpenses), note: "기록된 전체 지출", className: "pink", icon: "↘" },
            { label: "현재 자산", value: formatMoney(summary.netWorth), note: "잔액 + 주식 평가액 - 빚", className: "blue", icon: "✦" }
        ];

        return `
            <section class="statistics-section statistics-overview">
                ${renderSectionHeader("전체 기록", "FINANCIAL OVERVIEW", "Violet Vault의 현재 경제 상태를 한눈에 확인하세요.")}
                <div class="statistics-grid statistics-overview-grid">
                    ${cards.map(card => `
                        <article class="statistics-card statistics-overview-card ${card.className}">
                            <div class="statistics-card-top">
                                <span class="statistics-card-label">${escapeHTML(card.label)}</span>
                                <span class="statistics-card-icon" aria-hidden="true">${card.icon}</span>
                            </div>
                            <strong class="statistics-card-value">${escapeHTML(card.value)}</strong>
                            <span class="statistics-card-note">${escapeHTML(card.note)}</span>
                        </article>`).join("")}
                </div>
            </section>`;
    }

    function renderDrawOverview(summary) {
        const metrics = [
            { label: "최고 당첨액", value: formatMoney(summary.lifetimeBestWin), description: "전체 기록에서의 최고 금액", color: "gold" },
            { label: "기록된 평균 당첨액", value: formatMoney(summary.rewardAverage), description: `${formatInteger(summary.recordedDraws)}회 분석`, color: "purple" },
            { label: "최저 당첨액", value: summary.recordedDraws > 0 ? formatMoney(summary.rewardMinimum) : "—", description: "보관된 뽑기 기록 기준", color: "blue" },
            { label: "서로 다른 당첨액", value: formatInteger(summary.uniqueRewards), description: "중복을 제외한 금액 종류", color: "green" }
        ];

        return `
            <section class="statistics-section">
                ${renderSectionHeader("뽑기 분석", "DRAW ANALYTICS", "당첨 금액의 평균과 최고 기록을 확인하세요.")}
                <div class="statistics-grid statistics-draw-grid">
                    ${metrics.map(metric => `
                        <article class="statistics-card statistics-metric-card ${metric.color}">
                            <span class="statistics-card-label">${escapeHTML(metric.label)}</span>
                            <strong class="statistics-card-value">${escapeHTML(metric.value)}</strong>
                            <span class="statistics-card-note">${escapeHTML(metric.description)}</span>
                        </article>`).join("")}
                </div>
                <div class="statistics-insight">
                    <span class="statistics-insight-icon">✧</span>
                    <div>
                        <strong>뽑기 기록 분석</strong>
                        <p>현재 저장된 뽑기 기록 <b>${formatInteger(summary.recordedDraws)}회</b> 중 <b>${formatInteger(summary.uniqueRewards)}종류</b>의 서로 다른 당첨액이 등장했습니다.</p>
                    </div>
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       10. Odd/even and prime/composite
       ----------------------------------------------------- */
    function renderOddEvenSection(summary) {
        const stats = summary.oddEven;
        const oddPercent = getPercentage(stats.odd, stats.total);
        const evenPercent = getPercentage(stats.even, stats.total);

        return `
            <section class="statistics-section">
                ${renderSectionHeader("홀짝 비율", "ODD / EVEN", "당첨 금액의 일의 자리를 기준으로 홀수와 짝수를 분석합니다.")}
                <div class="statistics-two-column">
                    <article class="statistics-panel statistics-distribution-panel">
                        <div class="statistics-panel-heading">
                            <h4>홀수와 짝수</h4>
                            <span class="statistics-panel-tag">${formatInteger(stats.total)}회</span>
                        </div>
                        ${renderDistributionRow("홀수", stats.odd, oddPercent, "#bc91ff")}
                        ${renderDistributionRow("짝수", stats.even, evenPercent, "#7eafff")}
                        ${stats.total === 0 ? renderNoDataMessage("아직 분석할 뽑기 기록이 없습니다.") : ""}
                    </article>
                    <article class="statistics-panel statistics-number-insight">
                        <div class="statistics-panel-heading"><h4>홀짝 분석</h4></div>
                        <div class="statistics-pair">
                            <div class="statistics-pair-item">
                                <span class="statistics-pair-symbol odd">홀</span>
                                <div><strong>${formatPercentage(oddPercent)}</strong><small>${formatInteger(stats.odd)}회</small></div>
                            </div>
                            <div class="statistics-pair-item">
                                <span class="statistics-pair-symbol even">짝</span>
                                <div><strong>${formatPercentage(evenPercent)}</strong><small>${formatInteger(stats.even)}회</small></div>
                            </div>
                        </div>
                        <p class="statistics-small-note">홀짝 비율은 실제 저장된 당첨액으로 계산됩니다.</p>
                    </article>
                </div>
            </section>`;
    }

    function renderPrimeCompositeSection(summary) {
        const stats = summary.primeComposite;
        const primePercent = getPercentage(stats.prime, stats.total);
        const compositePercent = getPercentage(stats.composite, stats.total);
        const neitherPercent = getPercentage(stats.neither, stats.total);

        return `
            <section class="statistics-section">
                ${renderSectionHeader("소수와 합성수", "PRIME / COMPOSITE", "당첨 금액 자체가 소수인지 합성수인지 분석합니다.")}
                <div class="statistics-two-column">
                    <article class="statistics-panel statistics-distribution-panel">
                        <div class="statistics-panel-heading">
                            <h4>수의 종류</h4>
                            <span class="statistics-panel-tag">${formatInteger(stats.total)}회</span>
                        </div>
                        ${renderDistributionRow("소수", stats.prime, primePercent, "#7ce0b3")}
                        ${renderDistributionRow("합성수", stats.composite, compositePercent, "#ff9acb")}
                        ${renderDistributionRow("둘 다 아님", stats.neither, neitherPercent, "#9f92b6")}
                        ${stats.total === 0 ? renderNoDataMessage("아직 분석할 뽑기 기록이 없습니다.") : ""}
                    </article>
                    <article class="statistics-panel statistics-number-insight">
                        <div class="statistics-panel-heading"><h4>수학적 분류</h4></div>
                        <div class="statistics-number-list">
                            ${renderNumberSummaryRow("소수", "약수가 1과 자기 자신뿐인 수", stats.prime, primePercent, "#7ce0b3")}
                            ${renderNumberSummaryRow("합성수", "1과 자기 자신 외의 약수가 있는 수", stats.composite, compositePercent, "#ff9acb")}
                            ${renderNumberSummaryRow("둘 다 아님", "현재 범위에서는 1이 해당", stats.neither, neitherPercent, "#9f92b6")}
                        </div>
                    </article>
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       11. Digit occurrence
       ----------------------------------------------------- */
    function renderDigitSection(summary) {
        const digitStats = summary.digitStats;
        const digits = digitStats.digits;
        const maximumCount = Math.max(1, ...digits.map(item => item.count));

        return `
            <section class="statistics-section">
                ${renderSectionHeader("숫자 출현 빈도", "DIGIT FREQUENCY", "당첨 금액을 구성하는 각 숫자 0~9가 몇 번 등장했는지 확인합니다.")}
                <div class="statistics-panel statistics-digit-panel">
                    <div class="statistics-panel-heading"><h4>숫자별 출현 횟수</h4><span class="statistics-panel-tag">총 ${formatInteger(digitStats.totalDigits)}자리</span></div>
                    <div class="statistics-digit-grid">
                        ${digits.map(item => {
                            const height = item.count > 0 ? Math.max(5, item.count / maximumCount * 100) : 0;
                            return `
                                <div class="statistics-digit-card" title="${item.digit}: ${formatInteger(item.count)}회">
                                    <span class="statistics-digit-number">${item.digit}</span>
                                    <div class="statistics-digit-chart"><div class="statistics-digit-bar" style="height:${height}%;"></div></div>
                                    <strong class="statistics-digit-count">${formatInteger(item.count)}</strong>
                                    <small class="statistics-digit-percent">${formatPercentage(item.percentage)}</small>
                                </div>`;
                        }).join("")}
                    </div>
                    ${digitStats.totalDigits === 0 ? renderNoDataMessage("당첨 기록이 쌓이면 숫자별 빈도가 표시됩니다.") : ""}
                    <p class="statistics-small-note">예: 77 Q가 당첨되면 숫자 7이 두 번 집계됩니다. 각 숫자의 비율은 전체 자릿수 중 해당 숫자가 차지하는 비율입니다.</p>
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       12. Rarity distribution
       ----------------------------------------------------- */
    function renderRaritySection(summary) {
        const sorted = summary.rarityStats.slice().sort((a, b) => b.count - a.count);
        const maximumCount = Math.max(1, ...sorted.map(item => item.count));

        return `
            <section class="statistics-section">
                ${renderSectionHeader("희귀도 출현 통계", "RARITY DISTRIBUTION", "각 희귀도 등급이 지금까지 얼마나 자주 등장했는지 확인합니다.")}
                <div class="statistics-panel statistics-rarity-panel">
                    <div class="statistics-panel-heading"><h4>등급별 출현 횟수</h4><span class="statistics-panel-tag">${formatInteger(summary.recordedDraws)}회 분석</span></div>
                    ${sorted.map(rarity => {
                        const width = rarity.count > 0 ? Math.max(2, rarity.count / maximumCount * 100) : 0;
                        const color = getSafeColor(rarity.color);
                        return `
                            <div class="statistics-bar-row statistics-rarity-row">
                                <div class="statistics-bar-label statistics-rarity-label">
                                    <span class="statistics-rarity-symbol" style="color:${color}">${escapeHTML(rarity.symbol)}</span>
                                    <span class="statistics-rarity-name">${escapeHTML(rarity.name)}</span>
                                </div>
                                <div class="statistics-bar-track"><div class="statistics-bar-fill" style="width:${width}%;background:${color};box-shadow:0 0 10px ${color}30"></div></div>
                                <div class="statistics-bar-value"><strong>${formatInteger(rarity.count)}</strong><small>${formatPercentage(rarity.percentage)}</small></div>
                            </div>`;
                    }).join("")}
                    ${summary.recordedDraws === 0 ? renderNoDataMessage("뽑기를 진행하면 희귀도별 통계가 나타납니다.") : ""}
                    <p class="statistics-small-note">이 표는 저장된 당첨 기록에서 계산한 실제 출현 비율입니다. 게임에 설정된 확률과 실제 출현 비율은 다를 수 있습니다.</p>
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       13. Reward range distribution
       ----------------------------------------------------- */
    function renderRewardRangeSection(summary) {
        const ranges = summary.rewardRanges;
        const maximumCount = Math.max(1, ...ranges.map(range => range.count));

        return `
            <section class="statistics-section">
                ${renderSectionHeader("당첨 금액 분포", "REWARD DISTRIBUTION", "당첨 금액이 어느 구간에 많이 모여 있는지 확인합니다.")}
                <div class="statistics-panel statistics-range-panel">
                    <div class="statistics-panel-heading"><h4>금액 구간별 출현 횟수</h4><span class="statistics-panel-tag">${formatInteger(summary.recordedDraws)}회 분석</span></div>
                    <div class="statistics-range-grid">
                        ${ranges.map((range, index) => {
                            const height = range.count > 0 ? Math.max(4, range.count / maximumCount * 100) : 0;
                            return `
                                <div class="statistics-range-item" title="${escapeHTML(range.label)} Q: ${formatInteger(range.count)}회">
                                    <div class="statistics-range-chart"><div class="statistics-range-bar" style="height:${height}%;--statistics-range-index:${index};"></div></div>
                                    <strong class="statistics-range-count">${formatInteger(range.count)}</strong>
                                    <span class="statistics-range-label">${escapeHTML(range.label)} Q</span>
                                </div>`;
                        }).join("")}
                    </div>
                    ${summary.recordedDraws === 0 ? renderNoDataMessage("아직 분석할 당첨 금액이 없습니다.") : ""}
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       14. Recent draws
       ----------------------------------------------------- */
    function renderRecentSection(summary) {
        const recent = summary.recentDraws;
        return `
            <section class="statistics-section">
                ${renderSectionHeader("최근 뽑기 기록", "RECENT DRAWS", "최근 10회의 당첨 금액을 시간 역순으로 확인합니다.")}
                <div class="statistics-panel statistics-recent-panel">
                    <div class="statistics-panel-heading"><h4>최근 결과</h4><span class="statistics-panel-tag">${formatInteger(recent.length)}회</span></div>
                    ${recent.length ? `
                        <div class="statistics-recent-list">
                            ${recent.map((item, index) => {
                                const width = Math.max(5, item.amount / Math.max(1, MAX_REWARD) * 100);
                                return `
                                    <div class="statistics-recent-item">
                                        <div class="statistics-recent-info">
                                            <span class="statistics-recent-index">#${index + 1}</span>
                                            <div class="statistics-recent-main">
                                                <strong>${escapeHTML(formatMoney(item.amount))}</strong>
                                                <small>${escapeHTML(item.rarity)} · ${escapeHTML(formatDateTime(item.timestamp))}</small>
                                            </div>
                                        </div>
                                        <div class="statistics-recent-chart"><div class="statistics-recent-bar" style="width:${width}%;background:${getSafeColor(item.color)}"></div></div>
                                    </div>`;
                            }).join("")}
                        </div>` : renderNoDataMessage("첫 번째 뽑기를 완료하면 여기에 결과가 나타납니다.")}
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       15. Bank activity
       ----------------------------------------------------- */
    function renderBankSection(summary) {
        const bank = summary.bank;
        return `
            <section class="statistics-section">
                ${renderSectionHeader("은행 이용 통계", "BANK ACTIVITY", "대출과 상환 내역을 확인합니다.")}
                <div class="statistics-grid statistics-activity-grid">
                    ${renderActivityCard("대출 횟수", formatInteger(bank.loans), "기록된 대출 거래", "blue")}
                    ${renderActivityCard("누적 대출액", formatMoney(bank.totalBorrowed), "보관된 대출 기록 기준", "purple")}
                    ${renderActivityCard("상환 횟수", formatInteger(bank.repayments), "기록된 상환 거래", "green")}
                    ${renderActivityCard("누적 상환액", formatMoney(bank.totalRepaid), "보관된 상환 기록 기준", "gold")}
                </div>
                <div class="statistics-insight statistics-bank-insight">
                    <span class="statistics-insight-icon">⌂</span>
                    <div><strong>현재 남은 빚</strong><p>현재 대출 잔액은 <b>${escapeHTML(formatMoney(bank.currentDebt))}</b>입니다. 상환하면 남은 빚이 줄어듭니다.</p></div>
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       16. Stock activity
       ----------------------------------------------------- */
    function renderStockSection(summary) {
        const stock = summary.stock;
        return `
            <section class="statistics-section">
                ${renderSectionHeader("주식 거래 통계", "STOCK MARKET", "주식 매수·매도 내역과 실현 손익을 확인합니다.")}
                <div class="statistics-grid statistics-activity-grid">
                    ${renderActivityCard("매수 횟수", formatInteger(stock.purchases), "기록된 매수 거래", "blue")}
                    ${renderActivityCard("누적 매수액", formatMoney(stock.totalPurchaseCost), "보관된 매수 기록 기준", "purple")}
                    ${renderActivityCard("매도 횟수", formatInteger(stock.sales), "기록된 매도 거래", "green")}
                    ${renderActivityCard("누적 매도액", formatMoney(stock.totalSaleProceeds), "보관된 매도 기록 기준", "gold")}
                </div>
                <div class="statistics-insight statistics-stock-insight">
                    <span class="statistics-insight-icon">↗</span>
                    <div>
                        <strong>현재 주식 평가액</strong>
                        <p>보유 주식의 평가액은 <b>${escapeHTML(formatMoney(summary.portfolioValue))}</b>이고, 저장된 실현 손익은 <b>${escapeHTML(formatMoney(stock.realizedProfit))}</b>입니다.</p>
                    </div>
                </div>
            </section>`;
    }

    /* -----------------------------------------------------
       17. Data note
       ----------------------------------------------------- */
    function renderDataNote(summary) {
        return `
            <div class="statistics-data-note">
                <span class="statistics-data-note-icon">ⓘ</span>
                <p>
                    누적 수입·지출과 총 뽑기 횟수는 저장된 누적값을 사용합니다.
                    평균, 숫자 빈도, 홀짝 비율, 소수·합성수 비율과 희귀도 분포는
                    현재 저장된 뽑기 내역을 기준으로 계산합니다.
                    거래 기록은 최대 ${formatInteger(HISTORY_LIMIT)}건까지 보관하도록 설정되어 있으며,
                    현재 저장된 거래 기록은 ${formatInteger(summary.recordedHistory)}건입니다.
                </p>
            </div>`;
    }

    /* -----------------------------------------------------
       18. Main render
       ----------------------------------------------------- */
    function getRoot() {
        return getElement("statistics-content");
    }

    function render(state) {
        if (state && typeof state === "object") currentState = state;
        else currentState = resolveState(currentState);

        currentState = normalizeState(currentState);
        const root = getRoot();
        if (!root) return false;

        if (!currentState) {
            root.innerHTML = `
                <div class="statistics-empty">
                    <div class="statistics-empty-icon">◇</div>
                    <h3>통계를 불러올 수 없습니다</h3>
                    <p>게임 상태가 준비되면 이곳에 통계가 표시됩니다.</p>
                </div>`;
            return false;
        }

        lastSummary = getSummary(currentState);
        if (!lastSummary) {
            root.innerHTML = `
                <div class="statistics-empty">
                    <div class="statistics-empty-icon">◇</div>
                    <h3>통계 데이터가 없습니다</h3>
                    <p>데이터를 불러온 뒤 다시 확인해 주세요.</p>
                </div>`;
            return false;
        }

        root.innerHTML = `
            <div class="statistics-dashboard">
                ${renderOverview(lastSummary)}
                ${renderDrawOverview(lastSummary)}
                ${renderOddEvenSection(lastSummary)}
                ${renderPrimeCompositeSection(lastSummary)}
                ${renderDigitSection(lastSummary)}
                ${renderRaritySection(lastSummary)}
                ${renderRewardRangeSection(lastSummary)}
                ${renderRecentSection(lastSummary)}
                ${renderBankSection(lastSummary)}
                ${renderStockSection(lastSummary)}
                ${renderDataNote(lastSummary)}
            </div>`;
        return true;
    }

    function renderHome() {
        // Compatibility hook for older script.js versions.
        const state = resolveState();
        return state ? render(state) : false;
    }

    /* -----------------------------------------------------
       19. Public API
       ----------------------------------------------------- */
    window.VioletStatistics = {
        init(state) {
            if (state && typeof state === "object") currentState = state;
            else currentState = resolveState(currentState);
            return render(currentState);
        },
        render,
        renderHome,
        getSummary,
        getDrawEntries,
        getTransactionEntries,
        getOddEvenStats,
        getPrimeCompositeStats,
        getDigitStats,
        getRewardRangeStats,
        getRarityStats,
        getBankStats,
        getStockStats,
        getStockPortfolioValue,
        getRarityInfo,
        getRarityDefinitions,
        isPrime,
        formatMoney,
        formatPercentage,
        getLastSummary: () => lastSummary,
        getState: () => currentState,
        reset() {
            // Statistics are derived from saved data. Do not erase any history.
            lastSummary = null;
            return true;
        }
    };

    window.addEventListener("game:data-changed", event => {
        const latest = event?.detail?.state || resolveState();
        if (latest) currentState = latest;
        if (getRoot()) render(currentState);
    });

    document.addEventListener("violetvault:ready", () => {
        currentState = resolveState(currentState);
        if (currentState && getRoot()) render(currentState);
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            currentState = resolveState(currentState);
            if (currentState && getRoot()) render(currentState);
        }, { once: true });
    } else {
        currentState = resolveState(currentState);
        if (currentState && getRoot()) render(currentState);
    }

    console.log("[Violet Vault] 통계 시스템 로드 완료.");
})();
