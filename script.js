/* =========================================================
   VIOLET VAULT
   Main Controller — script.js
   =========================================================

   담당 기능
   - 돈 뽑기
   - 자동 뽑기
   - 즉각 뽑기
   - 자산 및 통계 표시
   - 도감과 업적 표시
   - 메뉴 전환
   - 은행 및 대출 기본 기능
   - 설정 및 데이터 백업
   - 저장 시스템 연결

   다른 파일과의 연결
   - data.js
   - save.js
   - economy.js
   - effect.js
   - rarity.js
   - codex.js
   - achievements.js
   - bank.js
   - stock.js
   - history.js
   - statistics.js
   - settings.js
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const STORAGE_KEY = "violet-vault-save-v1";

    const DEFAULT_BALANCE = 100;
    const DEFAULT_DRAW_COST = 1;
    const MIN_REWARD = 1;
    const MAX_REWARD = 100;

    const HISTORY_LIMIT = 300;

    const AUTO_DRAW_DELAY = 1000;
    const DRAW_ANIMATION_DURATION = 750;
    const DRAW_ANIMATION_SPEED = 65;


    /* =====================================================
       2. 기본 게임 데이터
       ===================================================== */

    const DEFAULT_ACHIEVEMENTS = [
        {
            id: "first-draw",
            name: "첫걸음",
            description: "첫 번째 뽑기를 진행하세요.",
            goal: 1,
            getProgress: state => state.totalDraws
        },
        {
            id: "lucky-hit",
            name: "행운의 시작",
            description: "10 Q 이상 당첨되세요.",
            goal: 1,
            getProgress: state => state.bestWin >= 10 ? 1 : 0
        },
        {
            id: "small-rich",
            name: "작은 부자",
            description: "누적 수익 100 Q를 달성하세요.",
            goal: 100,
            getProgress: state => state.totalIncome
        },
        {
            id: "collector",
            name: "수집가",
            description: "서로 다른 금액 10종을 수집하세요.",
            goal: 10,
            getProgress: state => state.codex.length
        },
        {
            id: "veteran",
            name: "뽑기의 달인",
            description: "총 100회 뽑기를 진행하세요.",
            goal: 100,
            getProgress: state => state.totalDraws
        },
        {
            id: "ultimate",
            name: "궁극의 행운",
            description: "100 Q에 당첨되세요.",
            goal: 1,
            getProgress: state =>
                state.history.some(
                    item => item.type === "draw" && item.amount === 100
                ) ? 1 : 0
        }
    ];

    const DEFAULT_RARITIES = [
        {
            name: "Common",
            min: 1,
            max: 10,
            className: "rarity-common"
        },
        {
            name: "Uncommon",
            min: 11,
            max: 25,
            className: "rarity-uncommon"
        },
        {
            name: "Rare",
            min: 26,
            max: 45,
            className: "rarity-rare"
        },
        {
            name: "Epic",
            min: 46,
            max: 65,
            className: "rarity-epic"
        },
        {
            name: "Legendary",
            min: 66,
            max: 85,
            className: "rarity-legendary"
        },
        {
            name: "Mythic",
            min: 86,
            max: 99,
            className: "rarity-mythic"
        },
        {
            name: "Ultimate",
            min: 100,
            max: 100,
            className: "rarity-ultimate"
        }
    ];


    /* =====================================================
       3. 기본 상태
       ===================================================== */

    function createDefaultState() {
        return {
            version: 1,

            balance: DEFAULT_BALANCE,
            totalIncome: 0,
            totalExpenses: 0,
            debt: 0,

            totalDraws: 0,
            bestWin: 0,

            sessionDraws: 0,
            sessionProfit: 0,

            codex: [],
            unlockedAchievements: [],

            history: [],

            settings: {
                effectsEnabled: true,
                animationsEnabled: true,
                theme: "dark"
            },

            stocks: {},
            stockPortfolioValue: 0,
            stockRealizedProfit: 0
        };
    }


    /* =====================================================
       4. 공통 보조 함수
       ===================================================== */

    function safeNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    function formatAmount(value) {
        return safeNumber(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }


    function formatQ(value) {
        return `${formatAmount(value)} Q`;
    }


    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }


    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    function getElement(id) {
        return document.getElementById(id);
    }


    function setText(id, value) {
        const element = getElement(id);

        if (element) {
            element.textContent = value;
        }
    }


    function setHidden(element, hidden) {
        if (!element) return;

        element.hidden = hidden;
        element.classList.toggle("hidden", hidden);
    }


    /* =====================================================
       5. 저장 및 불러오기
       ===================================================== */

    function loadFallbackState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return null;
            }

            return JSON.parse(raw);
        } catch (error) {
            console.warn(
                "[Violet Vault] 저장 데이터 불러오기 실패:",
                error
            );

            return null;
        }
    }


    function normalizeState(savedState) {
        const defaults = createDefaultState();

        if (!savedState || typeof savedState !== "object") {
            return defaults;
        }

        const state = {
            ...defaults,
            ...savedState
        };

        state.balance = Math.max(
            0,
            safeNumber(state.balance, DEFAULT_BALANCE)
        );

        state.totalIncome = Math.max(
            0,
            safeNumber(state.totalIncome)
        );

        state.totalExpenses = Math.max(
            0,
            safeNumber(state.totalExpenses)
        );

        state.debt = Math.max(
            0,
            safeNumber(state.debt)
        );

        state.totalDraws = Math.max(
            0,
            Math.floor(safeNumber(state.totalDraws))
        );

        state.bestWin = Math.max(
            0,
            safeNumber(state.bestWin)
        );

        state.sessionDraws = Math.max(
            0,
            Math.floor(safeNumber(state.sessionDraws))
        );

        state.sessionProfit = safeNumber(state.sessionProfit);

        state.codex = Array.isArray(state.codex)
            ? [...new Set(
                state.codex
                    .map(value => safeNumber(value, NaN))
                    .filter(value =>
                        Number.isInteger(value) &&
                        value >= MIN_REWARD &&
                        value <= MAX_REWARD
                    )
            )].sort((a, b) => a - b)
            : [];

        state.unlockedAchievements =
            Array.isArray(state.unlockedAchievements)
                ? [...new Set(state.unlockedAchievements)]
                : [];

        state.history = Array.isArray(state.history)
            ? state.history.slice(0, HISTORY_LIMIT)
            : [];

        state.settings = {
            ...defaults.settings,
            ...(state.settings || {})
        };

        state.stocks =
            state.stocks && typeof state.stocks === "object"
                ? state.stocks
                : {};

        state.stockPortfolioValue = Math.max(
            0,
            safeNumber(state.stockPortfolioValue)
        );

        state.stockRealizedProfit = safeNumber(
            state.stockRealizedProfit
        );

        return state;
    }


    function loadState() {
        try {
            if (
                window.VioletVaultSave &&
                typeof window.VioletVaultSave.load === "function"
            ) {
                const saved = window.VioletVaultSave.load();

                if (saved) {
                    return normalizeState(saved);
                }
            }
        } catch (error) {
            console.warn(
                "[Violet Vault] 외부 저장 시스템 사용 실패:",
                error
            );
        }

        return normalizeState(loadFallbackState());
    }


    let state = loadState();


    function saveState() {
        try {
            if (
                window.VioletVaultSave &&
                typeof window.VioletVaultSave.save === "function"
            ) {
                window.VioletVaultSave.save(state);
            } else {
                localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify(state)
                );
            }
        } catch (error) {
            console.error(
                "[Violet Vault] 저장 실패:",
                error
            );

            showToast(
                "저장 실패",
                "브라우저 저장 공간을 확인해 줘."
            );
        }
    }


    /* =====================================================
       6. 경제 및 희귀도 모듈 연결
       ===================================================== */

    function getDrawCost() {
        const data = window.VioletVaultData;

        const value = data
            ? safeNumber(data.DRAW_COST, DEFAULT_DRAW_COST)
            : DEFAULT_DRAW_COST;

        return Math.max(1, value);
    }


    function getRandomReward() {
        const raritySystem = window.VioletRarity;

        if (
            raritySystem &&
            typeof raritySystem.drawReward === "function"
        ) {
            const result = raritySystem.drawReward();

            const amount = typeof result === "object" && result !== null
                ? safeNumber(result.amount, NaN)
                : safeNumber(result, NaN);

            if (
                Number.isInteger(amount) &&
                amount >= MIN_REWARD &&
                amount <= MAX_REWARD
            ) {
                return amount;
            }
        }

        const data = window.VioletVaultData;

        const min = data
            ? safeNumber(data.MIN_REWARD, MIN_REWARD)
            : MIN_REWARD;

        const max = data
            ? safeNumber(data.MAX_REWARD, MAX_REWARD)
            : MAX_REWARD;

        return Math.floor(
            Math.random() * (max - min + 1)
        ) + min;
    }


    function getRarityInfo(amount) {
        const raritySystem = window.VioletRarity;

        if (
            raritySystem &&
            typeof raritySystem.getRarityInfo === "function"
        ) {
            const result = raritySystem.getRarityInfo(amount);

            if (result && typeof result === "object") {
                return {
                    name: result.name || "Common",
                    className: result.className || "rarity-common"
                };
            }
        }

        const rarity = DEFAULT_RARITIES.find(
            item => amount >= item.min && amount <= item.max
        );

        return rarity || DEFAULT_RARITIES[0];
    }


    function applyDrawEconomy(cost, reward) {
        const economy = window.VioletEconomy;

        if (
            economy &&
            typeof economy.processDraw === "function"
        ) {
            const result = economy.processDraw(
                state,
                cost,
                reward
            );

            if (result === false) {
                return false;
            }
        } else {
            /*
             * 기본 처리:
             * 뽑기 비용을 차감하고
             * 당첨금을 지급한다.
             *
             * 추후 economy.js가 만들어지면
             * 해당 파일의 공통 경제 함수를 사용한다.
             */

            if (state.balance < cost) {
                return false;
            }

            state.balance -= cost;
            state.totalExpenses += cost;

            state.balance += reward;
            state.totalIncome += reward;
        }

        return true;
    }


    /* =====================================================
       7. 알림
       ===================================================== */

    function showToast(title, message) {
        const container = getElement("toast-container");

        if (!container) {
            console.log(`[Violet Vault] ${title}: ${message}`);
            return;
        }

        const toast = document.createElement("div");
        toast.className = "toast";

        const heading = document.createElement("strong");
        heading.textContent = title;

        const paragraph = document.createElement("p");
        paragraph.textContent = message;

        toast.append(heading, paragraph);
        container.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 3500);
    }


    /* =====================================================
       8. 당첨 결과 표시
       ===================================================== */

    function showDrawResult(amount, rarity, instant = false) {
        const valueElement = getElement("result-value");
        const unitElement = getElement("result-unit");
        const messageElement = getElement("result-message");
        const badgeElement = getElement("rarity-badge");
        const machine = getElement("draw-machine");

        if (valueElement) {
            valueElement.textContent = String(amount);
        }

        if (unitElement) {
            unitElement.textContent = "Q";
        }

        if (messageElement) {
            if (amount === 100) {
                messageElement.textContent =
                    "최고 금액 당첨! 엄청난 행운이야!";
            } else if (amount >= 66) {
                messageElement.textContent =
                    "대단한 당첨이야! 행운이 따르고 있어!";
            } else if (amount >= 26) {
                messageElement.textContent =
                    "좋은 당첨이야! 자산이 늘어났어.";
            } else {
                messageElement.textContent =
                    "당첨 완료! 다음 행운도 기대해 봐.";
            }
        }

        if (badgeElement) {
            badgeElement.textContent = rarity.name;
            badgeElement.className =
                `rarity-badge ${rarity.className}`;
        }

        if (machine) {
            machine.classList.remove("is-winning");

            if (amount >= 66) {
                machine.classList.add("is-winning");
            }

            if (
                state.settings.effectsEnabled &&
                amount >= 66 &&
                window.VioletEffects &&
                typeof window.VioletEffects.playWin === "function"
            ) {
                window.VioletEffects.playWin({
                    amount,
                    rarity
                });
            }
        }

        if (valueElement && !instant &&
            state.settings.animationsEnabled) {

            valueElement.parentElement.classList.remove(
                "is-revealing"
            );

            /*
             * 브라우저가 클래스를 다시 적용하도록
             * 애니메이션을 재시작한다.
             */
            void valueElement.offsetWidth;

            valueElement.parentElement.classList.add(
                "is-revealing"
            );
        }
    }


    /* =====================================================
       9. 거래 기록
       ===================================================== */

    function addHistory(entry) {
        const record = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            ...entry
        };

        state.history.unshift(record);

        if (state.history.length > HISTORY_LIMIT) {
            state.history.length = HISTORY_LIMIT;
        }

        return record;
    }


    /* =====================================================
       10. 업적
       ===================================================== */

    function getAchievementDefinitions() {
        const module = window.VioletAchievements;

        if (
            module &&
            Array.isArray(module.definitions)
        ) {
            return module.definitions;
        }

        return DEFAULT_ACHIEVEMENTS;
    }


    function getAchievementProgress(achievement) {
        if (typeof achievement.getProgress === "function") {
            return Math.max(
                0,
                safeNumber(achievement.getProgress(state))
            );
        }

        if (typeof achievement.progress === "function") {
            return Math.max(
                0,
                safeNumber(achievement.progress(state))
            );
        }

        return 0;
    }


    function isAchievementUnlocked(achievement) {
        if (state.unlockedAchievements.includes(achievement.id)) {
            return true;
        }

        const progress = getAchievementProgress(achievement);
        const goal = Math.max(1, safeNumber(achievement.goal, 1));

        return progress >= goal;
    }


    function unlockAchievement(achievement) {
        if (
            state.unlockedAchievements.includes(achievement.id)
        ) {
            return;
        }

        state.unlockedAchievements.push(achievement.id);

        const notification = getElement(
            "achievement-notification"
        );

        setText(
            "notification-achievement-name",
            achievement.name
        );

        if (notification) {
            setHidden(notification, false);

            window.setTimeout(() => {
                setHidden(notification, true);
            }, 4000);
        }

        showToast(
            "업적 달성!",
            `${achievement.name} 업적을 달성했어!`
        );
    }


    function checkAchievements() {
        const definitions = getAchievementDefinitions();

        definitions.forEach(achievement => {
            if (typeof achievement.isUnlocked === "function") {
                if (achievement.isUnlocked(state)) {
                    unlockAchievement(achievement);
                }

                return;
            }

            if (!state.unlockedAchievements.includes(achievement.id)) {
                const progress = getAchievementProgress(achievement);
                const goal = Math.max(
                    1,
                    safeNumber(achievement.goal, 1)
                );

                if (progress >= goal) {
                    unlockAchievement(achievement);
                }
            }
        });
    }


    function renderAchievements() {
        const module = window.VioletAchievements;

        if (
            module &&
            typeof module.renderPreview === "function"
        ) {
            module.renderPreview(state);
        } else {
            const preview = getElement("achievement-preview");

            if (preview) {
                const definitions = getAchievementDefinitions();

                preview.innerHTML = definitions
                    .slice(0, 3)
                    .map(achievement => {
                        const progress = getAchievementProgress(
                            achievement
                        );

                        const goal = Math.max(
                            1,
                            safeNumber(achievement.goal, 1)
                        );

                        const unlocked =
                            isAchievementUnlocked(achievement);

                        return `
                            <div class="achievement-card">
                                <span class="achievement-symbol">
                                    ${unlocked ? "♛" : "✧"}
                                </span>

                                <div>
                                    <strong>
                                        ${escapeHTML(achievement.name)}
                                    </strong>

                                    <p>
                                        ${escapeHTML(
                                            achievement.description || ""
                                        )}
                                    </p>
                                </div>

                                <span class="achievement-progress">
                                    ${unlocked ? "완료" :
                                        `${formatAmount(
                                            Math.min(progress, goal)
                                        )}/${formatAmount(goal)}`}
                                </span>
                            </div>
                        `;
                    })
                    .join("");
            }
        }

        const fullList = getElement("achievements-content");

        if (
            fullList &&
            module &&
            typeof module.renderAll === "function"
        ) {
            module.renderAll(state);
        } else if (fullList) {
            const definitions = getAchievementDefinitions();

            fullList.innerHTML = definitions.map(achievement => {
                const progress = getAchievementProgress(achievement);

                const goal = Math.max(
                    1,
                    safeNumber(achievement.goal, 1)
                );

                const unlocked =
                    isAchievementUnlocked(achievement);

                const percentage = clamp(
                    progress / goal * 100,
                    0,
                    100
                );

                return `
                    <div class="achievement-card">
                        <span class="achievement-symbol">
                            ${unlocked ? "♛" : "✧"}
                        </span>

                        <div>
                            <strong>
                                ${escapeHTML(achievement.name)}
                            </strong>

                            <p>
                                ${escapeHTML(
                                    achievement.description || ""
                                )}
                            </p>

                            <div class="achievement-progress-bar"
                                 style="height:5px;margin-top:8px;
                                 border-radius:8px;
                                 background:rgba(168,85,247,.12);
                                 overflow:hidden">

                                <div style="height:100%;
                                     width:${percentage}%;
                                     background:#a855f7;
                                     border-radius:8px">
                                </div>
                            </div>
                        </div>

                        <span class="achievement-progress">
                            ${unlocked ? "달성" :
                                `${formatAmount(
                                    Math.min(progress, goal)
                                )}/${formatAmount(goal)}`}
                        </span>
                    </div>
                `;
            }).join("");
        }

        const unlockedCount = state.unlockedAchievements.length;

        setText(
            "achievement-count",
            `${unlockedCount}개 달성`
        );
    }


    /* =====================================================
       11. 도감
       ===================================================== */

    function renderCodex() {
        const module = window.VioletCodex;

        if (
            module &&
            typeof module.render === "function"
        ) {
            module.render(state);
            return;
        }

        const container = getElement("codex-content");

        setText(
            "codex-count",
            `${state.codex.length}종 수집`
        );

        const completion = Math.round(
            state.codex.length / MAX_REWARD * 100
        );

        setText("codex-completion", `${completion}%`);

        if (!container) return;

        if (state.codex.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    아직 수집한 금액이 없어. 첫 뽑기를 해 보자!
                </p>
            `;

            return;
        }

        container.innerHTML = state.codex.map(amount => {
            const rarity = getRarityInfo(amount);

            return `
                <div class="codex-entry ${rarity.className}"
                     style="display:flex;align-items:center;
                     justify-content:space-between;gap:12px;
                     padding:14px;border:1px solid rgba(168,85,247,.18);
                     border-radius:10px;background:rgba(168,85,247,.035)">

                    <div>
                        <strong>${formatQ(amount)}</strong>
                        <p style="margin:4px 0 0;color:#9582a8;font-size:11px">
                            ${escapeHTML(rarity.name)}
                        </p>
                    </div>

                    <span style="color:#c084fc;font-size:18px">◇</span>
                </div>
            `;
        }).join("");
    }


    /* =====================================================
       12. 희귀도 표시
       ===================================================== */

    function renderRarities() {
        const module = window.VioletRarity;

        if (
            module &&
            typeof module.renderList === "function"
        ) {
            module.renderList();
        }
    }


    /* =====================================================
       13. 통계 화면
       ===================================================== */

    function renderStatistics() {
        const module = window.VioletStatistics;

        if (
            module &&
            typeof module.render === "function"
        ) {
            module.render(state);
            return;
        }

        const container = getElement("statistics-content");

        if (!container) return;

        const netWorth = getNetWorth();
        const averageWin = state.totalDraws > 0
            ? state.totalIncome / state.totalDraws
            : 0;

        const stats = [
            ["현재 보유 금액", formatQ(state.balance)],
            ["누적 수익", formatQ(state.totalIncome)],
            ["누적 지출", formatQ(state.totalExpenses)],
            ["순자산", formatQ(netWorth)],
            ["누적 뽑기", `${formatAmount(state.totalDraws)}회`],
            ["최고 당첨", formatQ(state.bestWin)],
            ["평균 당첨금", formatQ(averageWin)],
            ["수집 금액 종류", `${state.codex.length}종`]
        ];

        container.innerHTML = stats.map(([label, value]) => `
            <div class="panel mini-stat-card">
                <p>${escapeHTML(label)}</p>
                <strong>${escapeHTML(value)}</strong>
            </div>
        `).join("");
    }


    /* =====================================================
       14. 거래 기록 화면
       ===================================================== */

    function getHistoryLabel(item) {
        const labels = {
            draw: "돈 뽑기",
            loan: "대출",
            repayment: "대출 상환",
            stock_buy: "주식 매수",
            stock_sell: "주식 매도"
        };

        return labels[item.type] || "거래";
    }


    function renderHistory() {
        const module = window.VioletHistory;

        if (
            module &&
            typeof module.render === "function"
        ) {
            module.render(state);
            return;
        }

        const container = getElement("history-content");

        if (!container) return;

        if (state.history.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    아직 거래 기록이 없어.
                </p>
            `;

            return;
        }

        container.innerHTML = state.history.map(item => {
            const date = new Date(
                safeNumber(item.timestamp, Date.now())
            );

            const time = date.toLocaleString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            });

            let detail = "";

            if (item.type === "draw") {
                detail = `당첨 ${formatQ(item.amount)}`;
            } else if (item.type === "loan") {
                detail = `대출 ${formatQ(item.amount)}`;
            } else if (item.type === "repayment") {
                detail = `상환 ${formatQ(item.amount)}`;
            } else if (item.type === "stock_buy") {
                detail = `매수 ${formatQ(item.amount)}`;
            } else if (item.type === "stock_sell") {
                detail = `매도 ${formatQ(item.amount)}`;
            } else {
                detail = formatQ(item.amount || 0);
            }

            return `
                <div class="recent-item">
                    <div class="recent-item-info">
                        <strong>
                            ${escapeHTML(getHistoryLabel(item))}
                        </strong>

                        <small>${escapeHTML(time)}</small>
                    </div>

                    <span class="recent-item-amount">
                        ${escapeHTML(detail)}
                    </span>
                </div>
            `;
        }).join("");
    }


    /* =====================================================
       15. 순자산
       ===================================================== */

    function getNetWorth() {
        const economy = window.VioletEconomy;

        if (
            economy &&
            typeof economy.netWorth === "function"
        ) {
            return safeNumber(economy.netWorth(state));
        }

        return (
            state.balance -
            state.debt +
            state.stockPortfolioValue
        );
    }


    /* =====================================================
       16. 최근 당첨 표시
       ===================================================== */

    function renderRecentResults() {
        const container = getElement("recent-results");

        if (!container) return;

        const recentDraws = state.history
            .filter(item => item.type === "draw")
            .slice(0, 5);

        if (recentDraws.length === 0) {
            container.innerHTML = `
                <p class="empty-message">
                    아직 당첨 기록이 없어.
                </p>
            `;

            return;
        }

        container.innerHTML = recentDraws.map(item => {
            const rarity = getRarityInfo(item.amount);

            return `
                <div class="recent-item">
                    <div class="recent-item-info">
                        <strong>${escapeHTML(rarity.name)}</strong>
                        <small>돈 뽑기</small>
                    </div>

                    <span class="recent-item-amount">
                        ${formatQ(item.amount)}
                    </span>
                </div>
            `;
        }).join("");
    }


    /* =====================================================
       17. 전체 화면 업데이트
       ===================================================== */

    function renderAll() {
        setText("balance-value", formatAmount(state.balance));
        setText("total-income", formatQ(state.totalIncome));
        setText("total-expenses", formatQ(state.totalExpenses));
        setText("net-worth", formatQ(getNetWorth()));
        setText("debt-value", formatQ(state.debt));

        setText("bank-debt", formatQ(state.debt));

        setText("session-draws", `${formatAmount(state.sessionDraws)}회`);
        setText("session-profit", formatQ(state.sessionProfit));
        setText("best-win", formatQ(state.bestWin));
        setText("sidebar-best-win", formatQ(state.bestWin));
        setText("total-draws", `${formatAmount(state.totalDraws)}회`);

        const completion = Math.round(
            state.codex.length / MAX_REWARD * 100
        );

        setText("codex-completion", `${completion}%`);
        setText("codex-count", `${state.codex.length}종 수집`);

        renderRecentResults();
        renderAchievements();
        renderCodex();
        renderRarities();
        renderStatistics();
        renderHistory();

        const bankModule = window.VioletBank;

        if (
            bankModule &&
            typeof bankModule.render === "function"
        ) {
            bankModule.render(state);
        }

        const stockModule = window.VioletStock;

        if (
            stockModule &&
            typeof stockModule.render === "function"
        ) {
            stockModule.render(state);
        }

        const settingsModule = window.VioletSettings;

        if (
            settingsModule &&
            typeof settingsModule.sync === "function"
        ) {
            settingsModule.sync(state);
        }
    }


    /* =====================================================
       18. 돈 뽑기 처리
       ===================================================== */

    let drawInProgress = false;
    let rollInterval = null;
    let drawTimeout = null;

    let autoDrawActive = false;
    let autoDrawTimer = null;


    function finishDraw(amount, instant = false) {
        const cost = getDrawCost();

        if (state.balance < cost) {
            drawInProgress = false;

            showToast(
                "잔액 부족",
                "돈이 부족해. 뽑기를 계속하려면 돈을 마련해 줘."
            );

            stopAutoDraw();
            return false;
        }

        const rarity = getRarityInfo(amount);

        const success = applyDrawEconomy(cost, amount);

        if (!success) {
            drawInProgress = false;
            stopAutoDraw();

            showToast(
                "뽑기 실패",
                "경제 시스템에서 거래를 처리하지 못했어."
            );

            return false;
        }

        state.totalDraws += 1;
        state.sessionDraws += 1;

        state.sessionProfit += amount - cost;

        state.bestWin = Math.max(
            state.bestWin,
            amount
        );

        if (!state.codex.includes(amount)) {
            state.codex.push(amount);
            state.codex.sort((a, b) => a - b);
        }

        addHistory({
            type: "draw",
            amount,
            cost,
            profit: amount - cost,
            rarity: rarity.name
        });

        checkAchievements();
        showDrawResult(amount, rarity, instant);

        saveState();
        renderAll();

        if (amount >= 66) {
            showToast(
                `${rarity.name} 당첨!`,
                `${formatQ(amount)}을 획득했어!`
            );
        }

        drawInProgress = false;

        return true;
    }


    function performDraw(instant = false) {
        if (drawInProgress) {
            return false;
        }

        const cost = getDrawCost();

        if (state.balance < cost) {
            showToast(
                "잔액 부족",
                "현재 보유 금액이 뽑기 비용보다 적어."
            );

            stopAutoDraw();
            return false;
        }

        drawInProgress = true;

        const amount = getRandomReward();

        const shouldAnimate =
            !instant &&
            state.settings.animationsEnabled;

        const drawButton = getElement("draw-button");

        if (drawButton) {
            drawButton.disabled = true;
        }

        if (!shouldAnimate) {
            const result = finishDraw(amount, true);

            if (drawButton) {
                drawButton.disabled = false;
            }

            return result;
        }

        const valueElement = getElement("result-value");
        const messageElement = getElement("result-message");
        const badgeElement = getElement("rarity-badge");

        if (messageElement) {
            messageElement.textContent = "행운을 확인하는 중...";
        }

        if (badgeElement) {
            badgeElement.textContent = "ROLLING...";
            badgeElement.className = "rarity-badge";
        }

        if (rollInterval) {
            clearInterval(rollInterval);
        }

        rollInterval = window.setInterval(() => {
            if (valueElement) {
                valueElement.textContent = String(
                    Math.floor(
                        Math.random() * (MAX_REWARD - MIN_REWARD + 1)
                    ) + MIN_REWARD
                );
            }
        }, DRAW_ANIMATION_SPEED);

        drawTimeout = window.setTimeout(() => {
            if (rollInterval) {
                clearInterval(rollInterval);
                rollInterval = null;
            }

            finishDraw(amount, false);

            if (drawButton) {
                drawButton.disabled = false;
            }

            drawTimeout = null;
        }, DRAW_ANIMATION_DURATION);

        return true;
    }


    /* =====================================================
       19. 자동 뽑기
       ===================================================== */

    function updateAutoDrawButton() {
        const button = getElement("auto-draw-button");
        const status = getElement("auto-draw-status");

        if (button) {
            button.classList.toggle(
                "is-active",
                autoDrawActive
            );

            button.setAttribute(
                "aria-pressed",
                String(autoDrawActive)
            );
        }

        if (status) {
            status.textContent = autoDrawActive ? "ON" : "OFF";
        }
    }


    function scheduleAutoDraw() {
        if (!autoDrawActive) return;

        if (autoDrawTimer) {
            clearTimeout(autoDrawTimer);
        }

        autoDrawTimer = window.setTimeout(() => {
            autoDrawTimer = null;

            if (!autoDrawActive) return;

            if (drawInProgress) {
                scheduleAutoDraw();
                return;
            }

            const started = performDraw(false);

            if (started) {
                scheduleAutoDraw();
            } else {
                stopAutoDraw();
            }
        }, AUTO_DRAW_DELAY);
    }


    function startAutoDraw() {
        if (autoDrawActive) return;

        if (state.balance < getDrawCost()) {
            showToast(
                "잔액 부족",
                "자동 뽑기를 시작할 수 없어."
            );

            return;
        }

        autoDrawActive = true;

        updateAutoDrawButton();

        showToast(
            "자동 뽑기 시작",
            "잔액이 부족하거나 자동 뽑기를 끌 때까지 진행돼."
        );

        scheduleAutoDraw();
    }


    function stopAutoDraw() {
        autoDrawActive = false;

        if (autoDrawTimer) {
            clearTimeout(autoDrawTimer);
            autoDrawTimer = null;
        }

        updateAutoDrawButton();
    }


    function toggleAutoDraw() {
        if (autoDrawActive) {
            stopAutoDraw();

            showToast(
                "자동 뽑기 종료",
                "자동 뽑기를 중지했어."
            );
        } else {
            startAutoDraw();
        }
    }


    /* =====================================================
       20. 메뉴 전환
       ===================================================== */

    const HOME_ELEMENTS = [
        ".welcome-section",
        ".achievement-summary",
        "#draw-panel",
        ".dashboard-grid"
    ];

    const CONTENT_PANELS = [
        "codex-panel",
        "achievements-panel",
        "bank-panel",
        "stock-panel",
        "statistics-panel",
        "history-panel"
    ];


    function showPanel(panelName) {
        const isHome = panelName === "draw";

        HOME_ELEMENTS.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                setHidden(element, !isHome);
            });
        });

        CONTENT_PANELS.forEach(id => {
            const panel = getElement(id);

            setHidden(
                panel,
                isHome || id !== `${panelName}-panel`
            );
        });

        document.querySelectorAll("[data-panel]").forEach(button => {
            const isActive =
                button.classList.contains("menu-button") &&
                button.dataset.panel === panelName;

            if (button.classList.contains("menu-button")) {
                button.classList.toggle("active", isActive);
            }
        });

        if (panelName === "codex") {
            renderCodex();
        }

        if (panelName === "achievements") {
            renderAchievements();
        }

        if (panelName === "statistics") {
            renderStatistics();
        }

        if (panelName === "history") {
            renderHistory();
        }

        if (panelName === "bank") {
            const module = window.VioletBank;

            if (module && typeof module.render === "function") {
                module.render(state);
            }
        }

        if (panelName === "stock") {
            const module = window.VioletStock;

            if (module && typeof module.render === "function") {
                module.render(state);
            }
        }

        window.scrollTo({
            top: 0,
            behavior: state.settings.animationsEnabled
                ? "smooth"
                : "auto"
        });
    }


    /* =====================================================
       21. 설정
       ===================================================== */

    function openSettings() {
        const modal = getElement("settings-modal");

        if (modal) {
            setHidden(modal, false);
        }

        syncSettingsInputs();
    }


    function closeSettings() {
        const modal = getElement("settings-modal");

        if (modal) {
            setHidden(modal, true);
        }
    }


    function syncSettingsInputs() {
        const effectsToggle = getElement("effects-toggle");
        const animationsToggle = getElement("animations-toggle");

        if (effectsToggle) {
            effectsToggle.checked =
                Boolean(state.settings.effectsEnabled);
        }

        if (animationsToggle) {
            animationsToggle.checked =
                Boolean(state.settings.animationsEnabled);
        }

        document.body.classList.toggle(
            "light-theme",
            state.settings.theme === "light"
        );
    }


    function updateSettings() {
        const effectsToggle = getElement("effects-toggle");
        const animationsToggle = getElement("animations-toggle");

        if (effectsToggle) {
            state.settings.effectsEnabled = effectsToggle.checked;
        }

        if (animationsToggle) {
            state.settings.animationsEnabled =
                animationsToggle.checked;
        }

        saveState();
    }


    /* =====================================================
       22. 데이터 백업
       ===================================================== */

    function exportSave() {
        try {
            const blob = new Blob(
                [JSON.stringify(state, null, 2)],
                { type: "application/json" }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = "violet-vault-backup.json";

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(url);

            showToast(
                "백업 완료",
                "저장 데이터를 JSON 파일로 내보냈어."
            );
        } catch (error) {
            console.error(error);

            showToast(
                "백업 실패",
                "데이터 파일을 만들지 못했어."
            );
        }
    }


    /* =====================================================
       23. 데이터 초기화
       ===================================================== */

    function resetGame() {
        const confirmed = window.confirm(
            "정말로 모든 데이터를 초기화할까?\n\n" +
            "돈, 뽑기 기록, 도감, 업적, 대출, 주식 데이터가 초기화돼."
        );

        if (!confirmed) return;

        stopAutoDraw();

        if (rollInterval) {
            clearInterval(rollInterval);
            rollInterval = null;
        }

        if (drawTimeout) {
            clearTimeout(drawTimeout);
            drawTimeout = null;
        }

        drawInProgress = false;

        state = createDefaultState();

        try {
            if (
                window.VioletVaultSave &&
                typeof window.VioletVaultSave.reset === "function"
            ) {
                window.VioletVaultSave.reset();
            }
        } catch (error) {
            console.warn(
                "[Violet Vault] 외부 초기화 실패:",
                error
            );
        }

        saveState();
        renderAll();
        showDrawResult(0, {
            name: "WAITING",
            className: "rarity-common"
        }, true);

        setText("result-value", "???");
        setText("result-message", "버튼을 눌러 운을 시험해 봐!");

        closeSettings();
        showPanel("draw");

        showToast(
            "초기화 완료",
            "모든 게임 데이터가 초기화됐어."
        );
    }


    /* =====================================================
       24. 기본 대출 기능
       bank.js가 존재하면 그 파일의 기능을 사용한다.
       ===================================================== */

    function initializeFallbackBank() {
        const module = window.VioletBank;

        if (module && typeof module.init === "function") {
            module.init(app);
            return;
        }

        const borrowButton = getElement("borrow-button");
        const repayButton = getElement("repay-button");

        if (borrowButton) {
            borrowButton.addEventListener("click", () => {
                const input = getElement("loan-amount");
                const amount = Number(input?.value);

                if (
                    !Number.isFinite(amount) ||
                    amount <= 0
                ) {
                    showToast(
                        "잘못된 금액",
                        "대출 금액을 1 이상으로 입력해 줘."
                    );

                    return;
                }

                state.balance += amount;
                state.debt += amount;

                addHistory({
                    type: "loan",
                    amount
                });

                saveState();
                renderAll();

                if (input) input.value = "";

                showToast(
                    "대출 완료",
                    `${formatQ(amount)}을 대출받았어. 이자는 없어.`
                );
            });
        }

        if (repayButton) {
            repayButton.addEventListener("click", () => {
                const input = getElement("repay-amount");
                const requested = Number(input?.value);

                if (
                    !Number.isFinite(requested) ||
                    requested <= 0
                ) {
                    showToast(
                        "잘못된 금액",
                        "상환 금액을 1 이상으로 입력해 줘."
                    );

                    return;
                }

                if (state.debt <= 0) {
                    showToast(
                        "대출 없음",
                        "현재 갚아야 할 대출이 없어."
                    );

                    return;
                }

                if (state.balance <= 0) {
                    showToast(
                        "잔액 부족",
                        "상환할 돈이 부족해."
                    );

                    return;
                }

                const amount = Math.min(
                    requested,
                    state.balance,
                    state.debt
                );

                state.balance -= amount;
                state.debt -= amount;

                addHistory({
                    type: "repayment",
                    amount
                });

                saveState();
                renderAll();

                if (input) input.value = "";

                showToast(
                    "상환 완료",
                    `${formatQ(amount)}을 상환했어.`
                );
            });
        }
    }


    /* =====================================================
       25. 이벤트 연결
       ===================================================== */

    function bindEvents() {
        const drawButton = getElement("draw-button");

        if (drawButton) {
            drawButton.addEventListener("click", () => {
                performDraw(false);
            });
        }

        const instantButton = getElement("instant-draw-button");

        if (instantButton) {
            instantButton.addEventListener("click", () => {
                performDraw(true);
            });
        }

        const autoButton = getElement("auto-draw-button");

        if (autoButton) {
            autoButton.addEventListener("click", toggleAutoDraw);
        }

        document.addEventListener("click", event => {
            const button = event.target.closest("[data-panel]");

            if (!button) return;

            showPanel(button.dataset.panel);
        });

        const settingsButton = getElement("settings-button");

        if (settingsButton) {
            settingsButton.addEventListener("click", openSettings);
        }

        const closeSettingsButton = getElement("close-settings");

        if (closeSettingsButton) {
            closeSettingsButton.addEventListener(
                "click",
                closeSettings
            );
        }

        const settingsModal = getElement("settings-modal");

        if (settingsModal) {
            settingsModal.addEventListener("click", event => {
                if (
                    event.target.dataset.closeModal === "settings"
                ) {
                    closeSettings();
                }
            });
        }

        const effectsToggle = getElement("effects-toggle");

        if (effectsToggle) {
            effectsToggle.addEventListener("change", updateSettings);
        }

        const animationsToggle = getElement("animations-toggle");

        if (animationsToggle) {
            animationsToggle.addEventListener(
                "change",
                updateSettings
            );
        }

        const exportButton = getElement("export-save-button");

        if (exportButton) {
            exportButton.addEventListener("click", exportSave);
        }

        const resetButton = getElement("reset-save-button");

        if (resetButton) {
            resetButton.addEventListener("click", resetGame);
        }

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                closeSettings();
            }
        });

        /*
         * 탭을 닫기 전에 자동 뽑기를 중지한다.
         * 진행 중인 애니메이션은 페이지 종료 시 사라진다.
         */
        window.addEventListener("pagehide", () => {
            stopAutoDraw();

            if (rollInterval) {
                clearInterval(rollInterval);
            }

            if (drawTimeout) {
                clearTimeout(drawTimeout);
            }

            saveState();
        });
    }


    /* =====================================================
       26. 다른 모듈에서 사용할 공개 API
       ===================================================== */

    const app = {
        get state() {
            return state;
        },

        save: saveState,
        render: renderAll,

        toast: showToast,
        showPanel,

        draw: performDraw,

        formatAmount,
        formatQ,

        addHistory,

        getNetWorth,

        getDrawCost,

        stopAutoDraw
    };

    window.VioletVaultApp = app;


    /* =====================================================
       27. 사이트 초기화
       ===================================================== */

    function initialize() {
        bindEvents();

        initializeFallbackBank();

        syncSettingsInputs();

        renderAll();

        updateAutoDrawButton();

        saveState();

        console.log(
            "%c VIOLET VAULT ",
            "background:#6b21a8;color:#fff;font-weight:bold;padding:6px 12px;"
        );

        console.log(
            "[Violet Vault] 사이트 초기화 완료."
        );
    }


    initialize();

})();
