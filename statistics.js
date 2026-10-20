/* =========================================================
   Violet Vault - Statistics System
   File: statistics.js

   Features:
   - Financial overview
   - Draw statistics
   - Average, minimum, maximum rewards
   - Odd / even distribution
   - Prime / composite distribution
   - Digit occurrence statistics
   - Rarity distribution
   - Reward range distribution
   - Recent draw chart
   - Bank and stock activity
   - Compatible with Violet Vault's existing state
   ========================================================= */

(function () {
    "use strict";

    /* -----------------------------------------------------
       1. Configuration
       ----------------------------------------------------- */

    const DATA = window.VioletVaultData || {};

    const SETTINGS = DATA.SETTINGS || {};

    const CURRENCY = SETTINGS.CURRENCY || "Q";

    const HISTORY_LIMIT = Number.isFinite(
        Number(SETTINGS.HISTORY_LIMIT)
    )
        ? Number(SETTINGS.HISTORY_LIMIT)
        : 300;

    const MIN_REWARD = Number.isFinite(
        Number(SETTINGS.MIN_REWARD)
    )
        ? Number(SETTINGS.MIN_REWARD)
        : 1;

    const MAX_REWARD = Number.isFinite(
        Number(SETTINGS.MAX_REWARD)
    )
        ? Number(SETTINGS.MAX_REWARD)
        : 100;

    const MAX_DISPLAY_DIGITS = 10;

    let currentState = null;
    let lastSummary = null;


    /* -----------------------------------------------------
       2. Basic Utilities
       ----------------------------------------------------- */

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    function toNonNegativeInteger(value, fallback = 0) {
        const number = toNumber(value, fallback);

        return Math.max(
            0,
            Math.floor(number)
        );
    }


    function clamp(value, min, max) {
        return Math.min(
            max,
            Math.max(min, value)
        );
    }


    function escapeHTML(value) {
        return String(value ?? "").replace(
            /[&<>"']/g,
            function (character) {
                const entities = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;"
                };

                return entities[character];
            }
        );
    }


    function formatNumber(value, maximumFractionDigits = 2) {
        const number = toNumber(value);

        return number.toLocaleString("en-US", {
            maximumFractionDigits,
            minimumFractionDigits: 0
        });
    }


    function formatInteger(value) {
        return toNonNegativeInteger(value).toLocaleString("en-US");
    }


    function formatMoney(value) {
        return `${formatNumber(value)}${CURRENCY}`;
    }


    function formatPercentage(value) {
        return `${formatNumber(value, 1)}%`;
    }


    function getPercentage(part, total) {
        if (total <= 0) {
            return 0;
        }

        return (part / total) * 100;
    }


    function getSafeColor(color, fallback = "#b78aff") {
        const value = String(color || "").trim();

        if (
            /^#[0-9a-f]{3,8}$/i.test(value) ||
            /^rgba?\([\d\s.,%]+\)$/i.test(value) ||
            /^hsla?\([\d\s.,%deg]+\)$/i.test(value)
        ) {
            return value;
        }

        return fallback;
    }


    function getSafeClassName(value, fallback = "") {
        const result = String(value || "")
            .replace(/[^a-zA-Z0-9_-]/g, "");

        return result || fallback;
    }


    function getTimestamp(entry) {
        const timestamp = toNumber(
            entry && entry.timestamp,
            0
        );

        return timestamp >= 0 ? timestamp : 0;
    }


    function formatDate(timestamp) {
        if (!timestamp) {
            return "날짜 정보 없음";
        }

        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "날짜 정보 없음";
        }

        return date.toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        });
    }


    function formatDateTime(timestamp) {
        if (!timestamp) {
            return "날짜 정보 없음";
        }

        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "날짜 정보 없음";
        }

        return date.toLocaleString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }


    /* -----------------------------------------------------
       3. History Access
       ----------------------------------------------------- */

    function getHistory(state = currentState) {
        if (
            !state ||
            !Array.isArray(state.history)
        ) {
            return [];
        }

        return state.history.filter(function (entry) {
            return entry && typeof entry === "object";
        });
    }


    function getEntryType(entry) {
        return String(
            entry && (
                entry.type ||
                entry.transactionType ||
                entry.category
            )
            || "other"
        ).toLowerCase();
    }


    function isDrawEntry(entry) {
        const type = getEntryType(entry);

        return (
            type === "draw" ||
            type === "drawing" ||
            type === "draw_reward" ||
            type === "reward"
        );
    }


    function isBankEntry(entry) {
        const type = getEntryType(entry);

        return (
            type === "loan" ||
            type === "repayment" ||
            type === "borrow" ||
            type === "bank" ||
            type === "debt_repayment"
        );
    }


    function isStockEntry(entry) {
        const type = getEntryType(entry);

        return (
            type === "stock_buy" ||
            type === "stock_sell" ||
            type === "stock_purchase" ||
            type === "stock_sale"
        );
    }


    function getDrawReward(entry) {
        if (!entry || typeof entry !== "object") {
            return null;
        }

        let amount;

        if (entry.reward !== undefined && entry.reward !== null) {
            amount = Number(entry.reward);
        } else if (
            entry.amount !== undefined &&
            entry.amount !== null
        ) {
            amount = Number(entry.amount);
        } else if (
            entry.value !== undefined &&
            entry.value !== null
        ) {
            amount = Number(entry.value);
        } else {
            return null;
        }

        if (!Number.isFinite(amount)) {
            return null;
        }

        if (
            amount < MIN_REWARD ||
            amount > MAX_REWARD
        ) {
            return null;
        }

        return amount;
    }


    function getDrawCost(entry) {
        const configuredCost = Number.isFinite(
            Number(SETTINGS.DRAW_COST)
        )
            ? Number(SETTINGS.DRAW_COST)
            : 1;

        const rawCost = entry && entry.cost !== undefined
            ? Number(entry.cost)
            : configuredCost;

        if (!Number.isFinite(rawCost)) {
            return configuredCost;
        }

        return Math.max(0, rawCost);
    }


    function getDrawEntries(state = currentState) {
        return getHistory(state)
            .filter(isDrawEntry)
            .map(function (entry, index) {
                return {
                    entry,
                    index,
                    reward: getDrawReward(entry),
                    cost: getDrawCost(entry),
                    timestamp: getTimestamp(entry)
                };
            })
            .filter(function (item) {
                return item.reward !== null;
            })
            .sort(function (a, b) {
                return a.timestamp - b.timestamp;
            });
    }


    function getTransactionEntries(state = currentState) {
        return getHistory(state).filter(function (entry) {
            return (
                isBankEntry(entry) ||
                isStockEntry(entry)
            );
        });
    }


    /* -----------------------------------------------------
       4. Number Analysis
       ----------------------------------------------------- */

    function isPrime(number) {
        const value = Math.floor(toNumber(number));

        if (value < 2) {
            return false;
        }

        if (value === 2) {
            return true;
        }

        if (value % 2 === 0) {
            return false;
        }

        const limit = Math.sqrt(value);

        for (
            let divisor = 3;
            divisor <= limit;
            divisor += 2
        ) {
            if (value % divisor === 0) {
                return false;
            }
        }

        return true;
    }


    function getOddEvenStats(entries) {
        const result = {
            odd: 0,
            even: 0,
            total: 0
        };

        entries.forEach(function (item) {
            const amount = Math.floor(item.reward);

            if (amount % 2 === 0) {
                result.even += 1;
            } else {
                result.odd += 1;
            }

            result.total += 1;
        });

        return result;
    }


    function getPrimeCompositeStats(entries) {
        const result = {
            prime: 0,
            composite: 0,
            neither: 0,
            total: 0
        };

        entries.forEach(function (item) {
            const amount = Math.floor(item.reward);

            if (amount < 2) {
                result.neither += 1;
            } else if (isPrime(amount)) {
                result.prime += 1;
            } else {
                result.composite += 1;
            }

            result.total += 1;
        });

        return result;
    }


    function getDigitStats(entries) {
        const digits = Array.from(
            { length: MAX_DISPLAY_DIGITS },
            function (_, digit) {
                return {
                    digit,
                    count: 0,
                    percentage: 0
                };
            }
        );

        let totalDigits = 0;

        entries.forEach(function (item) {
            const amount = Math.floor(item.reward);
            const text = String(amount);

            for (const character of text) {
                const digit = Number(character);

                if (
                    Number.isInteger(digit) &&
                    digit >= 0 &&
                    digit <= 9
                ) {
                    digits[digit].count += 1;
                    totalDigits += 1;
                }
            }
        });

        digits.forEach(function (item) {
            item.percentage = getPercentage(
                item.count,
                totalDigits
            );
        });

        return {
            digits,
            totalDigits
        };
    }


    function getRewardRangeStats(entries) {
        const ranges = [];

        for (let start = MIN_REWARD; start <= MAX_REWARD; start += 10) {
            const end = Math.min(
                start + 9,
                MAX_REWARD
            );

            ranges.push({
                start,
                end,
                label: `${start}–${end}`,
                count: 0,
                percentage: 0
            });
        }

        entries.forEach(function (item) {
            const amount = item.reward;

            const range = ranges.find(function (candidate) {
                return (
                    amount >= candidate.start &&
                    amount <= candidate.end
                );
            });

            if (range) {
                range.count += 1;
            }
        });

        ranges.forEach(function (range) {
            range.percentage = getPercentage(
                range.count,
                entries.length
            );
        });

        return ranges;
    }


    /* -----------------------------------------------------
       5. Rarity Analysis
       ----------------------------------------------------- */

    function getRarityInfo(amount) {
        if (
            window.VioletRarity &&
            typeof window.VioletRarity.getRarityInfo === "function"
        ) {
            try {
                const info = window.VioletRarity.getRarityInfo(amount);

                if (info && typeof info === "object") {
                    return info;
                }
            } catch (error) {
                console.warn(
                    "[VioletStatistics] Rarity lookup failed:",
                    error
                );
            }
        }

        if (typeof DATA.getRarityByAmount === "function") {
            try {
                const rarity = DATA.getRarityByAmount(amount);

                if (rarity && typeof rarity === "object") {
                    return rarity;
                }
            } catch (error) {
                console.warn(
                    "[VioletStatistics] Data rarity lookup failed:",
                    error
                );
            }
        }

        const definitions = getRarityDefinitions();

        return definitions.find(function (rarity) {
            const min = toNumber(
                rarity.min ?? rarity.minAmount,
                MIN_REWARD
            );

            const max = toNumber(
                rarity.max ?? rarity.maxAmount,
                MAX_REWARD
            );

            return amount >= min && amount <= max;
        }) || {
            id: "unknown",
            name: "Unknown",
            label: "알 수 없음",
            color: "#a59bb8",
            symbol: "◇"
        };
    }


    function getRarityDefinitions() {
        const rarities = DATA.RARITIES;

        if (Array.isArray(rarities)) {
            return rarities.filter(function (item) {
                return item && typeof item === "object";
            });
        }

        if (rarities && typeof rarities === "object") {
            return Object.keys(rarities).map(function (key) {
                const item = rarities[key];

                if (
                    !item ||
                    typeof item !== "object"
                ) {
                    return null;
                }

                return Object.assign(
                    { id: key },
                    item
                );
            }).filter(Boolean);
        }

        if (
            window.VioletRarity &&
            typeof window.VioletRarity.getAllRarities === "function"
        ) {
            try {
                const result = window.VioletRarity.getAllRarities();

                if (Array.isArray(result)) {
                    return result;
                }
            } catch (error) {
                console.warn(
                    "[VioletStatistics] Unable to read rarity definitions:",
                    error
                );
            }
        }

        return [];
    }


    function getRarityName(info) {
        if (!info || typeof info !== "object") {
            return "알 수 없음";
        }

        return String(
            info.name ||
            info.label ||
            info.title ||
            info.id ||
            "알 수 없음"
        );
    }


    function getRarityColor(info) {
        if (!info || typeof info !== "object") {
            return "#a59bb8";
        }

        return getSafeColor(
            info.color || info.colour,
            "#a59bb8"
        );
    }


    function getRarityStats(entries) {
        const definitions = getRarityDefinitions();

        const result = definitions.map(function (rarity) {
            return {
                id: String(rarity.id || rarity.key || rarity.name || ""),
                name: getRarityName(rarity),
                color: getRarityColor(rarity),
                symbol: String(rarity.symbol || rarity.icon || "◇"),
                count: 0,
                percentage: 0
            };
        });

        entries.forEach(function (item) {
            const info = getRarityInfo(item.reward);
            const id = String(
                info.id ||
                info.key ||
                info.name ||
                info.label ||
                ""
            );

            const name = getRarityName(info);

            let target = result.find(function (rarity) {
                return (
                    rarity.id === id ||
                    rarity.name === name
                );
            });

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

            target.count += 1;
        });

        result.forEach(function (rarity) {
            rarity.percentage = getPercentage(
                rarity.count,
                entries.length
            );
        });

        return result;
    }


    /* -----------------------------------------------------
       6. Recent Draw Data
       ----------------------------------------------------- */

    function getRecentDraws(entries, limit = 10) {
        return entries
            .slice(-limit)
            .reverse()
            .map(function (item) {
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
       7. Financial and Transaction Statistics
       ----------------------------------------------------- */

    function getStockPortfolioValue(state) {
        if (!state) {
            return 0;
        }

        let value = toNumber(
            state.stockPortfolioValue,
            0
        );

        if (
            window.VioletStock &&
            typeof window.VioletStock.getPortfolioValue === "function"
        ) {
            try {
                const computedValue =
                    window.VioletStock.getPortfolioValue(state);

                if (Number.isFinite(Number(computedValue))) {
                    value = Number(computedValue);
                }
            } catch (error) {
                // Keep the stored portfolio value if calculation fails.
            }
        }

        return Math.max(0, value);
    }


    function getBankStats(state) {
        const history = getHistory(state);

        const result = {
            loans: 0,
            repayments: 0,
            totalBorrowed: 0,
            totalRepaid: 0,
            currentDebt: toNumber(state && state.debt, 0)
        };

        history.forEach(function (entry) {
            const type = getEntryType(entry);
            const amount = Math.max(
                0,
                toNumber(entry.amount, 0)
            );

            if (
                type === "loan" ||
                type === "borrow"
            ) {
                result.loans += 1;
                result.totalBorrowed += amount;
            }

            if (
                type === "repayment" ||
                type === "debt_repayment"
            ) {
                result.repayments += 1;
                result.totalRepaid += amount;
            }
        });

        return result;
    }


    function getStockStats(state) {
        const history = getHistory(state);

        const result = {
            purchases: 0,
            sales: 0,
            sharesBought: 0,
            sharesSold: 0,
            totalPurchaseCost: 0,
            totalSaleProceeds: 0,
            realizedProfit: toNumber(
                state && state.stockRealizedProfit,
                0
            )
        };

        history.forEach(function (entry) {
            const type = getEntryType(entry);
            const amount = Math.max(
                0,
                toNumber(entry.amount, 0)
            );

            const shares = Math.max(
                0,
                toNumber(entry.shares, 0)
            );

            if (
                type === "stock_buy" ||
                type === "stock_purchase"
            ) {
                result.purchases += 1;
                result.sharesBought += shares;
                result.totalPurchaseCost += amount;
            }

            if (
                type === "stock_sell" ||
                type === "stock_sale"
            ) {
                result.sales += 1;
                result.sharesSold += shares;
                result.totalSaleProceeds += amount;
            }
        });

        return result;
    }


    /* -----------------------------------------------------
       8. Build the Full Summary
       ----------------------------------------------------- */

    function getSummary(state = currentState) {
        if (!state || typeof state !== "object") {
            return null;
        }

        const drawEntries = getDrawEntries(state);
        const rewards = drawEntries.map(function (item) {
            return item.reward;
        });

        const sampleCount = rewards.length;

        const rewardSum = rewards.reduce(
            function (sum, reward) {
                return sum + reward;
            },
            0
        );

        const rewardAverage = sampleCount > 0
            ? rewardSum / sampleCount
            : 0;

        const rewardMinimum = sampleCount > 0
            ? Math.min(...rewards)
            : 0;

        const rewardMaximum = sampleCount > 0
            ? Math.max(...rewards)
            : 0;

        const cumulativeDraws = Math.max(
            toNonNegativeInteger(state.totalDraws),
            sampleCount
        );

        const oddEven = getOddEvenStats(drawEntries);
        const primeComposite = getPrimeCompositeStats(drawEntries);
        const digitStats = getDigitStats(drawEntries);
        const rarityStats = getRarityStats(drawEntries);
        const rewardRanges = getRewardRangeStats(drawEntries);

        const balance = Math.max(
            0,
            toNumber(state.balance, 0)
        );

        const debt = Math.max(
            0,
            toNumber(state.debt, 0)
        );

        const portfolioValue = getStockPortfolioValue(state);

        const totalIncome = toNumber(
            state.totalIncome,
            0
        );

        const totalExpenses = toNumber(
            state.totalExpenses,
            0
        );

        const netWorth = balance + portfolioValue - debt;

        const bank = getBankStats(state);
        const stock = getStockStats(state);

        const summary = {
            totalDraws: cumulativeDraws,
            recordedDraws: sampleCount,
            recordedHistory: getHistory(state).length,

            totalIncome,
            totalExpenses,
            balance,
            debt,
            portfolioValue,
            netWorth,

            rewardSum,
            rewardAverage,
            rewardMinimum,
            rewardMaximum,

            lifetimeBestWin: Math.max(
                toNumber(state.bestWin, 0),
                rewardMaximum
            ),

            oddEven,
            primeComposite,
            digitStats,
            rarityStats,
            rewardRanges,

            recentDraws: getRecentDraws(drawEntries, 10),

            bank,
            stock,

            drawsWithReward: sampleCount,

            uniqueRewards: new Set(rewards).size,

            drawCostsInHistory: drawEntries.reduce(
                function (sum, item) {
                    return sum + item.cost;
                },
                0
            )
        };

        return summary;
    }


    /* -----------------------------------------------------
       9. Statistics Panel Layout
       ----------------------------------------------------- */

    function getRoot() {
        return document.getElementById("statistics-content");
    }


    function render(state) {
        if (state && typeof state === "object") {
            currentState = state;
        }

        const root = getRoot();

        if (!root) {
            return;
        }

        if (!currentState) {
            root.innerHTML = `
                <div class="statistics-empty">
                    <div class="statistics-empty-icon">◇</div>
                    <h3>통계를 불러올 수 없습니다</h3>
                    <p>게임 상태가 준비되면 이곳에 통계가 표시됩니다.</p>
                </div>
            `;

            return;
        }

        lastSummary = getSummary(currentState);

        if (!lastSummary) {
            root.innerHTML = `
                <div class="statistics-empty">
                    <div class="statistics-empty-icon">◇</div>
                    <h3>통계 데이터가 없습니다</h3>
                    <p>데이터를 불러온 뒤 다시 확인해 주세요.</p>
                </div>
            `;

            return;
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

            </div>
        `;
    }


    /* -----------------------------------------------------
       10. Financial Overview
       ----------------------------------------------------- */

    function renderOverview(summary) {
        const cards = [
            {
                label: "누적 뽑기",
                value: formatInteger(summary.totalDraws),
                note: "전체 기록 기준",
                className: "purple",
                icon: "◇"
            },
            {
                label: "누적 수입",
                value: formatMoney(summary.totalIncome),
                note: "기록된 전체 수입",
                className: "green",
                icon: "↗"
            },
            {
                label: "누적 지출",
                value: formatMoney(summary.totalExpenses),
                note: "기록된 전체 지출",
                className: "pink",
                icon: "↘"
            },
            {
                label: "현재 자산",
                value: formatMoney(summary.netWorth),
                note: "잔액 + 주식 평가액 - 빚",
                className: "blue",
                icon: "✦"
            }
        ];

        return `
            <section class="statistics-section statistics-overview">

                ${renderSectionHeader(
                    "전체 기록",
                    "FINANCIAL OVERVIEW",
                    "Violet Vault의 현재 경제 상태를 한눈에 확인하세요."
                )}

                <div class="statistics-grid statistics-overview-grid">

                    ${cards.map(function (card) {
                        return `
                            <article class="statistics-card statistics-overview-card ${card.className}">
                                <div class="statistics-card-top">
                                    <span class="statistics-card-label">
                                        ${escapeHTML(card.label)}
                                    </span>

                                    <span class="statistics-card-icon" aria-hidden="true">
                                        ${escapeHTML(card.icon)}
                                    </span>
                                </div>

                                <strong class="statistics-card-value">
                                    ${escapeHTML(card.value)}
                                </strong>

                                <span class="statistics-card-note">
                                    ${escapeHTML(card.note)}
                                </span>
                            </article>
                        `;
                    }).join("")}

                </div>

                <div class="statistics-inline-metrics">

                    <div class="statistics-inline-metric">
                        <span>현재 잔액</span>
                        <strong>${escapeHTML(formatMoney(summary.balance))}</strong>
                    </div>

                    <div class="statistics-inline-metric">
                        <span>현재 빚</span>
                        <strong>${escapeHTML(formatMoney(summary.debt))}</strong>
                    </div>

                    <div class="statistics-inline-metric">
                        <span>주식 평가액</span>
                        <strong>${escapeHTML(formatMoney(summary.portfolioValue))}</strong>
                    </div>

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       11. Draw Overview
       ----------------------------------------------------- */

    function renderDrawOverview(summary) {
        const metrics = [
            {
                label: "최고 당첨액",
                value: formatMoney(summary.lifetimeBestWin),
                description: "전체 기록에서의 최고 금액",
                color: "gold"
            },
            {
                label: "기록된 평균 당첨액",
                value: formatMoney(summary.rewardAverage),
                description: `${formatInteger(summary.recordedDraws)}회 분석`,
                color: "purple"
            },
            {
                label: "최저 당첨액",
                value: summary.recordedDraws > 0
                    ? formatMoney(summary.rewardMinimum)
                    : "—",
                description: "보관된 뽑기 기록 기준",
                color: "blue"
            },
            {
                label: "서로 다른 당첨액",
                value: formatInteger(summary.uniqueRewards),
                description: "중복을 제외한 금액 종류",
                color: "green"
            }
        ];

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "뽑기 분석",
                    "DRAW ANALYTICS",
                    "당첨 금액의 평균과 최고 기록을 확인하세요."
                )}

                <div class="statistics-grid statistics-draw-grid">

                    ${metrics.map(function (metric) {
                        return `
                            <article class="statistics-card statistics-metric-card ${metric.color}">
                                <span class="statistics-card-label">
                                    ${escapeHTML(metric.label)}
                                </span>

                                <strong class="statistics-card-value">
                                    ${escapeHTML(metric.value)}
                                </strong>

                                <span class="statistics-card-note">
                                    ${escapeHTML(metric.description)}
                                </span>
                            </article>
                        `;
                    }).join("")}

                </div>

                <div class="statistics-insight">
                    <span class="statistics-insight-icon">✧</span>

                    <div>
                        <strong>뽑기 기록 분석</strong>

                        <p>
                            현재 저장된 뽑기 기록
                            <b>${formatInteger(summary.recordedDraws)}회</b>
                            중
                            <b>${formatInteger(summary.uniqueRewards)}종류</b>의
                            서로 다른 당첨액이 등장했습니다.
                        </p>
                    </div>
                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       12. Section Header
       ----------------------------------------------------- */

    function renderSectionHeader(title, subtitle, description) {
        return `
            <div class="statistics-section-header">

                <div class="statistics-section-heading">

                    <span class="statistics-section-eyebrow">
                        ${escapeHTML(subtitle)}
                    </span>

                    <h3 class="statistics-section-title">
                        ${escapeHTML(title)}
                    </h3>

                    <p class="statistics-section-description">
                        ${escapeHTML(description)}
                    </p>

                </div>

            </div>
        `;
    }


    /* -----------------------------------------------------
       13. Odd / Even Statistics
       ----------------------------------------------------- */

    function renderOddEvenSection(summary) {
        const stats = summary.oddEven;
        const total = stats.total;

        const oddPercent = getPercentage(
            stats.odd,
            total
        );

        const evenPercent = getPercentage(
            stats.even,
            total
        );

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "홀짝 비율",
                    "ODD / EVEN",
                    "당첨 금액의 일의 자리를 기준으로 홀수와 짝수를 분석합니다."
                )}

                <div class="statistics-two-column">

                    <article class="statistics-panel statistics-distribution-panel">

                        <div class="statistics-panel-heading">
                            <h4>홀수와 짝수</h4>
                            <span class="statistics-panel-tag">
                                ${formatInteger(total)}회
                            </span>
                        </div>

                        ${renderDistributionBar(
                            "홀수",
                            stats.odd,
                            total,
                            "#bc91ff",
                            oddPercent
                        )}

                        ${renderDistributionBar(
                            "짝수",
                            stats.even,
                            total,
                            "#7eafff",
                            evenPercent
                        )}

                        ${total === 0
                            ? renderNoDataMessage("아직 분석할 뽑기 기록이 없습니다.")
                            : ""
                        }

                    </article>

                    <article class="statistics-panel statistics-number-insight">

                        <div class="statistics-panel-heading">
                            <h4>홀짝 분석</h4>
                        </div>

                        <div class="statistics-pair">

                            <div class="statistics-pair-item">
                                <span class="statistics-pair-symbol odd">홀</span>

                                <div>
                                    <strong>${formatPercentage(oddPercent)}</strong>
                                    <small>${formatInteger(stats.odd)}회</small>
                                </div>
                            </div>

                            <div class="statistics-pair">
                                <span class="statistics-pair-symbol even">짝</span>

                                <div>
                                    <strong>${formatPercentage(evenPercent)}</strong>
                                    <small>${formatInteger(stats.even)}회</small>
                                </div>
                            </div>

                        </div>

                        <p class="statistics-small-note">
                            홀짝 비율은 실제 저장된 당첨액으로 계산됩니다.
                        </p>

                    </article>

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       14. Prime / Composite Statistics
       ----------------------------------------------------- */

    function renderPrimeCompositeSection(summary) {
        const stats = summary.primeComposite;
        const total = stats.total;

        const primePercent = getPercentage(
            stats.prime,
            total
        );

        const compositePercent = getPercentage(
            stats.composite,
            total
        );

        const neitherPercent = getPercentage(
            stats.neither,
            total
        );

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "소수와 합성수",
                    "PRIME / COMPOSITE",
                    "당첨 금액 자체가 소수인지 합성수인지 분석합니다."
                )}

                <div class="statistics-two-column">

                    <article class="statistics-panel statistics-distribution-panel">

                        <div class="statistics-panel-heading">
                            <h4>수의 종류</h4>

                            <span class="statistics-panel-tag">
                                ${formatInteger(total)}회
                            </span>
                        </div>

                        ${renderDistributionBar(
                            "소수",
                            stats.prime,
                            total,
                            "#7ce0b3",
                            primePercent
                        )}

                        ${renderDistributionBar(
                            "합성수",
                            stats.composite,
                            total,
                            "#ff9acb",
                            compositePercent
                        )}

                        ${renderDistributionBar(
                            "둘 다 아님",
                            stats.neither,
                            total,
                            "#9f92b6",
                            neitherPercent
                        )}

                        ${total === 0
                            ? renderNoDataMessage("아직 분석할 뽑기 기록이 없습니다.")
                            : ""
                        }

                    </article>

                    <article class="statistics-panel statistics-number-insight">

                        <div class="statistics-panel-heading">
                            <h4>수학적 분류</h4>
                        </div>

                        <div class="statistics-number-list">

                            ${renderNumberSummaryRow(
                                "소수",
                                "약수가 1과 자기 자신뿐인 수",
                                stats.prime,
                                primePercent,
                                "#7ce0b3"
                            )}

                            ${renderNumberSummaryRow(
                                "합성수",
                                "1과 자기 자신 외의 약수가 있는 수",
                                stats.composite,
                                compositePercent,
                                "#ff9acb"
                            )}

                            ${renderNumberSummaryRow(
                                "둘 다 아님",
                                "현재 범위에서는 1이 해당",
                                stats.neither,
                                neitherPercent,
                                "#9f92b6"
                            )}

                        </div>

                    </article>

                </div>

            </section>
        `;
    }


    function renderNumberSummaryRow(
        title,
        description,
        count,
        percentage,
        color
    ) {
        return `
            <div class="statistics-number-row">

                <span
                    class="statistics-number-dot"
                    style="--statistics-accent: ${getSafeColor(color)}"
                ></span>

                <div class="statistics-number-row-main">
                    <strong>${escapeHTML(title)}</strong>
                    <small>${escapeHTML(description)}</small>
                </div>

                <div class="statistics-number-row-value">
                    <strong>${formatInteger(count)}</strong>
                    <small>${formatPercentage(percentage)}</small>
                </div>

            </div>
        `;
    }


    /* -----------------------------------------------------
       15. Digit Occurrence Statistics
       ----------------------------------------------------- */

    function renderDigitSection(summary) {
        const digitStats = summary.digitStats;
        const digits = digitStats.digits;

        const maximumCount = Math.max(
            1,
            ...digits.map(function (item) {
                return item.count;
            })
        );

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "숫자 출현 빈도",
                    "DIGIT FREQUENCY",
                    "당첨 금액을 구성하는 각 숫자 0~9가 몇 번 등장했는지 확인합니다."
                )}

                <div class="statistics-panel statistics-digit-panel">

                    <div class="statistics-panel-heading">

                        <h4>숫자별 출현 횟수</h4>

                        <span class="statistics-panel-tag">
                            총 ${formatInteger(digitStats.totalDigits)}자리
                        </span>

                    </div>

                    <div class="statistics-digit-grid">

                        ${digits.map(function (item) {
                            const height = item.count > 0
                                ? Math.max(
                                    5,
                                    (item.count / maximumCount) * 100
                                )
                                : 0;

                            return `
                                <div
                                    class="statistics-digit-card"
                                    title="${item.digit}: ${formatInteger(item.count)}회"
                                >

                                    <span class="statistics-digit-number">
                                        ${item.digit}
                                    </span>

                                    <div class="statistics-digit-chart">
                                        <div
                                            class="statistics-digit-bar"
                                            style="height: ${height}%;"
                                        ></div>
                                    </div>

                                    <strong class="statistics-digit-count">
                                        ${formatInteger(item.count)}
                                    </strong>

                                    <small class="statistics-digit-percent">
                                        ${formatPercentage(item.percentage)}
                                    </small>

                                </div>
                            `;
                        }).join("")}

                    </div>

                    ${digitStats.totalDigits === 0
                        ? renderNoDataMessage("당첨 기록이 쌓이면 숫자별 빈도가 표시됩니다.")
                        : ""
                    }

                    <p class="statistics-small-note">
                        예: 77Q가 당첨되면 숫자 7이 두 번 집계됩니다.
                        숫자별 비율은 전체 자릿수 중 해당 숫자가 차지하는 비율입니다.
                    </p>

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       16. Rarity Statistics
       ----------------------------------------------------- */

    function renderRaritySection(summary) {
        const rarities = summary.rarityStats;

        const sorted = rarities.slice().sort(function (a, b) {
            return b.count - a.count;
        });

        const maximumCount = Math.max(
            1,
            ...sorted.map(function (item) {
                return item.count;
            })
        );

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "희귀도 출현 통계",
                    "RARITY DISTRIBUTION",
                    "각 희귀도 등급이 지금까지 얼마나 자주 등장했는지 확인합니다."
                )}

                <div class="statistics-panel statistics-rarity-panel">

                    <div class="statistics-panel-heading">

                        <h4>등급별 출현 횟수</h4>

                        <span class="statistics-panel-tag">
                            ${formatInteger(summary.recordedDraws)}회 분석
                        </span>

                    </div>

                    ${sorted.map(function (rarity) {
                        const width = rarity.count > 0
                            ? Math.max(
                                2,
                                (rarity.count / maximumCount) * 100
                            )
                            : 0;

                        const color = getSafeColor(rarity.color);

                        return `
                            <div class="statistics-bar-row statistics-rarity-row">

                                <div class="statistics-bar-label statistics-rarity-label">

                                    <span
                                        class="statistics-rarity-symbol"
                                        style="color: ${color};"
                                    >
                                        ${escapeHTML(rarity.symbol)}
                                    </span>

                                    <span class="statistics-rarity-name">
                                        ${escapeHTML(rarity.name)}
                                    </span>

                                </div>

                                <div class="statistics-bar-track">
                                    <div
                                        class="statistics-bar-fill"
                                        style="
                                            width: ${width}%;
                                            background: ${color};
                                            box-shadow: 0 0 10px ${color}30;
                                        "
                                    ></div>
                                </div>

                                <div class="statistics-bar-value">
                                    <strong>${formatInteger(rarity.count)}</strong>
                                    <small>${formatPercentage(rarity.percentage)}</small>
                                </div>

                            </div>
                        `;
                    }).join("")}

                    ${summary.recordedDraws === 0
                        ? renderNoDataMessage("뽑기를 진행하면 희귀도별 통계가 나타납니다.")
                        : ""
                    }

                    <p class="statistics-small-note">
                        이 표는 저장된 당첨 기록에서 계산한 실제 출현 비율입니다.
                        게임에 설정된 확률과 실제 출현 비율은 다를 수 있습니다.
                    </p>

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       17. Reward Range Statistics
       ----------------------------------------------------- */

    function renderRewardRangeSection(summary) {
        const ranges = summary.rewardRanges;

        const maximumCount = Math.max(
            1,
            ...ranges.map(function (range) {
                return range.count;
            })
        );

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "당첨 금액 분포",
                    "REWARD DISTRIBUTION",
                    "당첨 금액이 어느 구간에 많이 모여 있는지 확인합니다."
                )}

                <div class="statistics-panel statistics-range-panel">

                    <div class="statistics-panel-heading">

                        <h4>금액 구간별 출현 횟수</h4>

                        <span class="statistics-panel-tag">
                            ${formatInteger(summary.recordedDraws)}회 분석
                        </span>

                    </div>

                    <div class="statistics-range-grid">

                        ${ranges.map(function (range, index) {
                            const barHeight = range.count > 0
                                ? Math.max(
                                    4,
                                    (range.count / maximumCount) * 100
                                )
                                : 0;

                            return `
                                <div
                                    class="statistics-range-item"
                                    title="${range.label}Q: ${formatInteger(range.count)}회"
                                >

                                    <div class="statistics-range-chart">
                                        <div
                                            class="statistics-range-bar"
                                            style="
                                                height: ${barHeight}%;
                                                --statistics-range-index: ${index};
                                            "
                                        ></div>
                                    </div>

                                    <strong class="statistics-range-count">
                                        ${formatInteger(range.count)}
                                    </strong>

                                    <span class="statistics-range-label">
                                        ${escapeHTML(range.label)}Q
                                    </span>

                                </div>
                            `;
                        }).join("")}

                    </div>

                    ${summary.recordedDraws === 0
                        ? renderNoDataMessage("아직 분석할 당첨 금액이 없습니다.")
                        : ""
                    }

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       18. Recent Draws
       ----------------------------------------------------- */

    function renderRecentSection(summary) {
        const recent = summary.recentDraws;

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "최근 뽑기 기록",
                    "RECENT DRAWS",
                    "최근 10회의 당첨 금액을 시간 역순으로 확인합니다."
                )}

                <div class="statistics-panel statistics-recent-panel">

                    <div class="statistics-panel-heading">

                        <h4>최근 결과</h4>

                        <span class="statistics-panel-tag">
                            ${formatInteger(recent.length)}회
                        </span>

                    </div>

                    ${recent.length > 0
                        ? `
                            <div class="statistics-recent-list">

                                ${recent.map(function (item, index) {
                                    const height = Math.max(
                                        5,
                                        (item.amount / Math.max(1, MAX_REWARD)) * 100
                                    );

                                    return `
                                        <div class="statistics-recent-item">

                                            <div class="statistics-recent-info">

                                                <span class="statistics-recent-index">
                                                    #${index + 1}
                                                </span>

                                                <div class="statistics-recent-main">
                                                    <strong>
                                                        ${escapeHTML(formatMoney(item.amount))}
                                                    </strong>

                                                    <small>
                                                        ${escapeHTML(item.rarity)}
                                                        ·
                                                        ${escapeHTML(formatDateTime(item.timestamp))}
                                                    </small>
                                                </div>

                                            </div>

                                            <div class="statistics-recent-chart">
                                                <div
                                                    class="statistics-recent-bar"
                                                    style="
                                                        width: ${height}%;
                                                        background: ${getSafeColor(item.color)};
                                                    "
                                                ></div>
                                            </div>

                                        </div>
                                    `;
                                }).join("")}

                            </div>
                        `
                        : renderNoDataMessage("첫 번째 뽑기를 완료하면 여기에 결과가 나타납니다.")
                    }

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       19. Bank Statistics
       ----------------------------------------------------- */

    function renderBankSection(summary) {
        const bank = summary.bank;

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "은행 이용 통계",
                    "BANK ACTIVITY",
                    "대출과 상환 내역을 확인합니다."
                )}

                <div class="statistics-grid statistics-activity-grid">

                    ${renderActivityCard(
                        "대출 횟수",
                        formatInteger(bank.loans),
                        "기록된 대출 거래",
                        "blue"
                    )}

                    ${renderActivityCard(
                        "누적 대출액",
                        formatMoney(bank.totalBorrowed),
                        "보관된 대출 거래 기준",
                        "purple"
                    )}

                    ${renderActivityCard(
                        "상환 횟수",
                        formatInteger(bank.repayments),
                        "기록된 상환 거래",
                        "green"
                    )}

                    ${renderActivityCard(
                        "누적 상환액",
                        formatMoney(bank.totalRepaid),
                        "보관된 상환 거래 기준",
                        "gold"
                    )}

                </div>

                <div class="statistics-insight statistics-bank-insight">

                    <span class="statistics-insight-icon">⌂</span>

                    <div>
                        <strong>현재 남은 빚</strong>

                        <p>
                            현재 대출 잔액은
                            <b>${escapeHTML(formatMoney(bank.currentDebt))}</b>입니다.
                            상환하면 남은 빚이 줄어듭니다.
                        </p>
                    </div>

                </div>

            </section>
        `;
    }


    /* -----------------------------------------------------
       20. Stock Statistics
       ----------------------------------------------------- */

    function renderStockSection(summary) {
        const stock = summary.stock;

        return `
            <section class="statistics-section">

                ${renderSectionHeader(
                    "주식 거래 통계",
                    "STOCK MARKET",
                    "주식 매수·매도 내역과 실현 손익을 확인합니다."
                )}

                <div class="statistics-grid statistics-activity-grid">

                    ${renderActivityCard(
                        "매수 횟수",
                        formatInteger(stock.purchases),
                        "기록된 매수 거래",
                        "pink"
                    )}

                    ${renderActivityCard(
                        "누적 매수 금액",
                        formatMoney(stock.totalPurchaseCost),
                        "보관된 매수 거래 기준",
                        "purple"
                    )}

                    ${renderActivityCard(
                        "매도 횟수",
                        formatInteger(stock.sales),
                        "기록된 매도 거래",
                        "green"
                    )}

                    ${renderActivityCard(
                        "누적 매도 금액",
                        formatMoney(stock.totalSaleProceeds),
                        "보관된 매도 거래 기준",
                        "blue"
                    )}

                </div>

                <div class="statistics-insight statistics-stock-insight">

                    <span class="statistics-insight-icon">↗</span>

                    <div>
                        <strong>누적 실현 손익</strong>

                        <p>
                            주식을 매도해서 확정된 손익은
                            <b class="${stock.realizedProfit > 0
                                ? "statistics-positive"
                                : stock.realizedProfit < 0
                                    ? "statistics-negative"
                                    : ""
                            }">
                                ${escapeHTML(formatMoney(stock.realizedProfit))}
                            </b>입니다.
                            보유 중인 주식의 평가 손익과는 별개입니다.
                        </p>
                    </div>

                </div>

            </section>
        `;
    }


    function renderActivityCard(
        label,
        value,
        note,
        color
    ) {
        return `
            <article class="statistics-card statistics-activity-card ${getSafeClassName(color, "purple")}">

                <span class="statistics-card-label">
                    ${escapeHTML(label)}
                </span>

                <strong class="statistics-card-value">
                    ${escapeHTML(value)}
                </strong>

                <span class="statistics-card-note">
                    ${escapeHTML(note)}
                </span>

            </article>
        `;
    }


    /* -----------------------------------------------------
       21. Common Distribution Bar
       ----------------------------------------------------- */

    function renderDistributionBar(
        label,
        count,
        total,
        color,
