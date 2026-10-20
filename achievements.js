```javascript
/* =========================================================
   VIOLET VAULT
   Achievements System — achievements.js
   =========================================================

   담당 기능
   - 업적 정의 및 진행도 계산
   - 업적 달성 여부 확인
   - 업적 목록 및 미리보기 표시
   - 달성 알림
   - 진행도 표시
   - 업적 상태 저장
   - 뽑기, 자산, 도감, 대출, 주식 관련 업적

   연결 파일
   - index.html
   - achievements.css
   - script.js
   - data.js
   - economy.js
   - save.js
   - codex.js
   - bank.js
   - stock.js

   저장 위치
   - script.js의 state.unlockedAchievements

   중요
   - 실제 돈이 아닌 가상 화폐 게임의 업적 시스템이다.
   - 업적 자체는 게임 잔액을 변경하지 않는다.
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. 기본 도구
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
        return `${formatNumber(value)} Q`;
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

    function ensureState(state) {
        if (!state || typeof state !== "object") {
            return false;
        }

        if (!Array.isArray(state.unlockedAchievements)) {
            state.unlockedAchievements = [];
        }

        if (!Array.isArray(state.history)) {
            state.history = [];
        }

        if (!Array.isArray(state.codex)) {
            state.codex = [];
        }

        return true;
    }


    /* =====================================================
       2. 공통 진행도 계산
       ===================================================== */

    function getTotalBorrowed(state) {
        if (!Array.isArray(state.history)) {
            return 0;
        }

        return state.history
            .filter(item => item.type === "loan")
            .reduce(
                (total, item) =>
                    total + Math.max(0, safeNumber(item.amount)),
                0
            );
    }

    function getTotalRepaid(state) {
        if (!Array.isArray(state.history)) {
            return 0;
        }

        return state.history
            .filter(item => item.type === "repayment")
            .reduce(
                (total, item) =>
                    total + Math.max(0, safeNumber(item.amount)),
                0
            );
    }

    function getStockBuyCount(state) {
        if (!Array.isArray(state.history)) {
            return 0;
        }

        return state.history.filter(
            item => item.type === "stock_buy"
        ).length;
    }

    function getStockSellCount(state) {
        if (!Array.isArray(state.history)) {
            return 0;
        }

        return state.history.filter(
            item => item.type === "stock_sell"
        ).length;
    }

    function getStockPortfolioValue(state) {
        return Math.max(
            0,
            safeNumber(state.stockPortfolioValue)
        );
    }

    function getNetWorth(state) {
        const balance = safeNumber(state.balance);
        const debt = safeNumber(state.debt);
        const portfolio = getStockPortfolioValue(state);

        return balance + portfolio - debt;
    }

    function hasWonAmount(state, amount) {
        return Array.isArray(state.history) &&
            state.history.some(item =>
                item.type === "draw" &&
                Number(item.amount) >= amount
            );
    }

    function hasRepaidAllDebt(state) {
        return (
            getTotalBorrowed(state) > 0 &&
            safeNumber(state.debt) <= 0
        );
    }


    /* =====================================================
       3. 업적 데이터
       =====================================================

       goal:
           업적을 달성하기 위한 목표값

       getProgress(state):
           현재 진행도를 반환하는 함수

       특별 조건형 업적은:
           진행도 0 = 미달성
           진행도 1 = 달성 조건 충족

       보상은 현재 지급하지 않는다.
       ===================================================== */

    const definitions = [

        /* -------------------------------------------------
           A. 뽑기 관련 업적
           ------------------------------------------------- */

        {
            id: "first-draw",
            name: "첫걸음",
            description: "첫 번째 돈 뽑기를 진행하세요.",
            category: "draw",
            icon: "✦",
            goal: 1,
            unit: "회",
            getProgress: state =>
                safeNumber(state.totalDraws)
        },

        {
            id: "draw-10",
            name: "행운의 입문자",
            description: "돈 뽑기를 10회 진행하세요.",
            category: "draw",
            icon: "◇",
            goal: 10,
            unit: "회",
            getProgress: state =>
                safeNumber(state.totalDraws)
        },

        {
            id: "draw-50",
            name: "뽑기 애호가",
            description: "돈 뽑기를 50회 진행하세요.",
            category: "draw",
            icon: "✧",
            goal: 50,
            unit: "회",
            getProgress: state =>
                safeNumber(state.totalDraws)
        },

        {
            id: "draw-100",
            name: "뽑기의 달인",
            description: "돈 뽑기를 100회 진행하세요.",
            category: "draw",
            icon: "♛",
            goal: 100,
            unit: "회",
            getProgress: state =>
                safeNumber(state.totalDraws)
        },

        {
            id: "draw-500",
            name: "멈추지 않는 행운",
            description: "돈 뽑기를 500회 진행하세요.",
            category: "draw",
            icon: "☄",
            goal: 500,
            unit: "회",
            getProgress: state =>
                safeNumber(state.totalDraws)
        },


        /* -------------------------------------------------
           B. 당첨금 관련 업적
           ------------------------------------------------- */

        {
            id: "win-10",
            name: "작은 행운",
            description: "한 번에 10 Q 이상 당첨되세요.",
            category: "reward",
            icon: "✧",
            goal: 1,
            unit: "회",
            getProgress: state =>
                safeNumber(state.bestWin) >= 10 ? 1 : 0
        },

        {
            id: "win-25",
            name: "제법 괜찮은데?",
            description: "한 번에 25 Q 이상 당첨되세요.",
            category: "reward",
            icon: "✦",
            goal: 1,
            unit: "회",
            getProgress: state =>
                safeNumber(state.bestWin) >= 25 ? 1 : 0
        },

        {
            id: "win-50",
            name: "반짝이는 행운",
            description: "한 번에 50 Q 이상 당첨되세요.",
            category: "reward",
            icon: "✷",
            goal: 1,
            unit: "회",
            getProgress: state =>
                safeNumber(state.bestWin) >= 50 ? 1 : 0
        },

        {
            id: "win-75",
            name: "대박의 기운",
            description: "한 번에 75 Q 이상 당첨되세요.",
            category: "reward",
            icon: "☄",
            goal: 1,
            unit: "회",
            getProgress: state =>
                safeNumber(state.bestWin) >= 75 ? 1 : 0
        },

        {
            id: "win-100",
            name: "궁극의 행운",
            description: "최고 금액인 100 Q에 당첨되세요.",
            category: "reward",
            icon: "♛",
            goal: 1,
            unit: "회",
            getProgress: state =>
                safeNumber(state.bestWin) >= 100 ? 1 : 0
        },


        /* -------------------------------------------------
           C. 수익 및 지출 관련 업적
           ------------------------------------------------- */

        {
            id: "income-100",
            name: "작은 부자",
            description: "누적 수익 100 Q를 달성하세요.",
            category: "economy",
            icon: "◇",
            goal: 100,
            unit: "Q",
            getProgress: state =>
                safeNumber(state.totalIncome)
        },

        {
            id: "income-500",
            name: "돈이 모인다!",
            description: "누적 수익 500 Q를 달성하세요.",
            category: "economy",
            icon: "✦",
            goal: 500,
            unit: "Q",
            getProgress: state =>
                safeNumber(state.totalIncome)
        },

        {
            id: "income-1000",
            name: "천천히 부자가 되는 중",
            description: "누적 수익 1,000 Q를 달성하세요.",
            category: "economy",
            icon: "♛",
            goal: 1000,
            unit: "Q",
            getProgress: state =>
                safeNumber(state.totalIncome)
        },

        {
            id: "expenses-100",
            name: "큰손",
            description: "누적 지출 100 Q를 기록하세요.",
            category: "economy",
            icon: "◆",
            goal: 100,
            unit: "Q",
            getProgress: state =>
                safeNumber(state.totalExpenses)
        },


        /* -------------------------------------------------
           D. 자산 관련 업적
           ------------------------------------------------- */

        {
            id: "balance-200",
            name: "자산 증식",
            description: "현재 보유 금액 200 Q를 달성하세요.",
            category: "wealth",
            icon: "✧",
            goal: 200,
            unit: "Q",
            getProgress: state =>
                safeNumber(state.balance)
        },

        {
            id: "net-worth-500",
            name: "안정적인 기반",
            description: "순자산 500 Q를 달성하세요.",
            category: "wealth",
            icon: "◇",
            goal: 500,
            unit: "Q",
            getProgress: state =>
                getNetWorth(state)
        },

        {
            id: "net-worth-1000",
            name: "천 Q의 가치",
            description: "순자산 1,000 Q를 달성하세요.",
            category: "wealth",
            icon: "✦",
            goal: 1000,
            unit: "Q",
            getProgress: state =>
                getNetWorth(state)
        },


        /* -------------------------------------------------
           E. 도감 관련 업적
           ------------------------------------------------- */

        {
            id: "codex-10",
            name: "수집의 시작",
            description: "서로 다른 금액 10종을 수집하세요.",
            category: "codex",
            icon: "▣",
            goal: 10,
            unit: "종",
            getProgress: state =>
                state.codex.length
        },

        {
            id: "codex-25",
            name: "수집가",
            description: "서로 다른 금액 25종을 수집하세요.",
            category: "codex",
            icon: "▤",
            goal: 25,
            unit: "종",
            getProgress: state =>
                state.codex.length
        },

        {
            id: "codex-50",
            name: "금액 탐험가",
            description: "서로 다른 금액 50종을 수집하세요.",
            category: "codex",
            icon: "✧",
            goal: 50,
            unit: "종",
            getProgress: state =>
                state.codex.length
        },

        {
            id: "codex-100",
            name: "완벽한 수집가",
            description: "1 Q부터 100 Q까지 모든 금액을 수집하세요.",
            category: "codex",
            icon: "♛",
            goal: 100,
            unit: "종",
            getProgress: state =>
                state.codex.length
        },


        /* -------------------------------------------------
           F. 대출 관련 업적
           ------------------------------------------------- */

        {
            id: "first-loan",
            name: "도움이 필요해",
            description: "첫 번째 대출을 받으세요.",
            category: "bank",
            icon: "⌂",
            goal: 1,
            unit: "회",
            getProgress: state =>
                getTotalBorrowed(state) > 0 ? 1 : 0
        },

        {
            id: "repayment-100",
            name: "갚을 건 갚자",
            description: "누적 상환액 100 Q를 달성하세요.",
            category: "bank",
            icon: "↗",
            goal: 100,
            unit: "Q",
            getProgress: state =>
                getTotalRepaid(state)
        },

        {
            id: "debt-free",
            name: "빚 없는 하루",
            description: "대출을 모두 상환하세요.",
            category: "bank",
            icon: "✓",
            goal: 1,
            unit: "회",
            getProgress: state =>
                hasRepaidAllDebt(state) ? 1 : 0
        },


        /* -------------------------------------------------
           G. 주식 관련 업적
           ------------------------------------------------- */

        {
            id: "first-stock",
            name: "첫 투자",
            description: "가상 주식을 처음 매수하세요.",
            category: "stock",
            icon: "↗",
            goal: 1,
            unit: "회",
            getProgress: state =>
                getStockBuyCount(state) >= 1 ? 1 : 0
        },

        {
            id: "first-stock-sale",
            name: "첫 매도",
            description: "보유한 주식을 처음 매도하세요.",
            category: "stock",
            icon: "↘",
            goal: 1,
            unit: "회",
            getProgress: state =>
                getStockSellCount(state) >= 1 ? 1 : 0
        }
    ];


    /* =====================================================
       4. 업적 진행도 조회
       ===================================================== */

    function getProgress(achievement, state) {
        if (!ensureState(state)) {
            return 0;
        }

        try {
            const value = typeof achievement.getProgress === "function"
                ? achievement.getProgress(state)
                : 0;

            return Math.max(0, safeNumber(value));
        } catch (error) {
            console.error(
                "[Violet Vault Achievements] 진행도 계산 실패:",
                achievement.id,
                error
            );

            return 0;
        }
    }


    function getGoal(achievement) {
        return Math.max(
            1,
            safeNumber(achievement.goal, 1)
        );
    }


    function isUnlocked(achievement, state) {
        if (!ensureState(state)) {
            return false;
        }

        if (
            state.unlockedAchievements.includes(achievement.id)
        ) {
            return true;
        }

        return (
            getProgress(achievement, state) >=
            getGoal(achievement)
        );
    }


    function getUnlockedCount(state) {
        if (!ensureState(state)) {
            return 0;
        }

        return definitions.filter(
            achievement => isUnlocked(achievement, state)
        ).length;
    }


    /* =====================================================
       5. 업적 확인 및 달성 처리
       ===================================================== */

    /*
     * script.js에서 자체 업적 검사를 수행한다.
     *
     * 이 함수는 다른 시스템에서 직접 업적을 검사하거나,
     * 은행 또는 주식 거래 후 진행도를 갱신할 때 사용할 수 있다.
     *
     * 이미 달성한 업적은 중복 등록되지 않는다.
     */

    function check(state) {
        if (!ensureState(state)) {
            return [];
        }

        const newlyUnlocked = [];

        definitions.forEach(achievement => {
            if (
                state.unlockedAchievements.includes(achievement.id)
            ) {
                return;
            }

            const progress = getProgress(achievement, state);
            const goal = getGoal(achievement);

            if (progress >= goal) {
                state.unlockedAchievements.push(achievement.id);
                newlyUnlocked.push(achievement);

                /*
                 * script.js가 이미 초기화된 경우
                 * 공통 알림 기능을 사용한다.
                 */

                const app = window.VioletVaultApp;

                if (app && typeof app.toast === "function") {
                    app.toast(
                        "업적 달성!",
                        `${achievement.name} 업적을 달성했어!`
                    );
                }
            }
        });

        return newlyUnlocked;
    }


    /* =====================================================
       6. 진행도 텍스트
       ===================================================== */

    function getProgressLabel(achievement, state) {
        const progress = getProgress(achievement, state);
        const goal = getGoal(achievement);

        if (isUnlocked(achievement, state)) {
            return "달성 완료";
        }

        if (achievement.id === "win-10") {
            return `${formatQ(state.bestWin || 0)} / 10 Q`;
        }

        if (
            achievement.id === "win-25" ||
            achievement.id === "win-50" ||
            achievement.id === "win-75" ||
            achievement.id === "win-100"
        ) {
            return `${formatQ(state.bestWin || 0)} / ${achievement.id.split("-")[1]} Q`;
        }

        return (
            `${formatNumber(Math.min(progress, goal))}` +
            ` / ${formatNumber(goal)} ${achievement.unit || ""}`
        ).trim();
    }


    function getProgressPercent(achievement, state) {
        const progress = getProgress(achievement, state);
        const goal = getGoal(achievement);

        return clamp(
            progress / goal * 100,
            0,
            100
        );
    }


    /* =====================================================
       7. 업적 카드 HTML 생성
       ===================================================== */

    function createAchievementCard(achievement, state) {
        const unlocked = isUnlocked(achievement, state);

        const progress = getProgress(achievement, state);
        const goal = getGoal(achievement);

        const percentage = getProgressPercent(
            achievement,
            state
        );

        const progressLabel = getProgressLabel(
            achievement,
            state
        );

        const cardClass = unlocked
            ? "achievement-entry is-unlocked"
            : "achievement-entry is-locked";

        return `
            <article
                class="${cardClass}"
                data-achievement-id="${escapeHTML(achievement.id)}">

                <div class="achievement-entry-icon">
                    ${escapeHTML(achievement.icon || "✧")}
                </div>

                <div class="achievement-entry-content">

                    <div class="achievement-entry-heading">
                        <h3>
                            ${escapeHTML(achievement.name)}
                        </h3>

                        <span class="achievement-entry-status">
                            ${unlocked ? "달성" : "미달성"}
                        </span>
                    </div>

                    <p class="achievement-entry-description">
                        ${escapeHTML(achievement.description)}
                    </p>

                    <div
                        class="achievement-entry-progress-track"
                        role="progressbar"
                        aria-label="${escapeHTML(achievement.name)} 진행도"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow="${percentage}">

                        <div
                            class="achievement-entry-progress-fill"
                            style="width:${percentage}%">
                        </div>

                    </div>

                    <div class="achievement-entry-progress-label">
                        <span>
                            ${escapeHTML(progressLabel)}
                        </span>

                        <span>
                            ${Math.floor(percentage)}%
                        </span>
                    </div>

                </div>

            </article>
        `;
    }


    /* =====================================================
       8. 업적 미리보기
       ===================================================== */

    /*
     * index.html의 #achievement-preview 영역을 사용한다.
     *
     * script.js에서 호출:
     * VioletAchievements.renderPreview(state)
     */

    function renderPreview(state) {
        if (!ensureState(state)) {
            return;
        }

        const container = getElement("achievement-preview");

        if (!container) {
            return;
        }

        /*
         * 우선순위:
         * 아직 달성하지 못한 업적 중 진행도가 높은 것,
         * 그다음 달성한 업적.
         */

        const sorted = [...definitions].sort((a, b) => {
            const unlockedA = isUnlocked(a, state);
            const unlockedB = isUnlocked(b, state);

            if (unlockedA !== unlockedB) {
                return unlockedA ? 1 : -1;
            }

            const percentA = getProgressPercent(a, state);
            const percentB = getProgressPercent(b, state);

            return percentB - percentA;
        });

        const previewItems = sorted.slice(0, 3);

        container.innerHTML = previewItems.map(achievement => {
            const unlocked = isUnlocked(achievement, state);
            const progress = getProgress(achievement, state);
            const goal = getGoal(achievement);

            return `
                <div class="achievement-card ${unlocked ? "is-unlocked" : ""}">

                    <span class="achievement-symbol">
                        ${escapeHTML(achievement.icon || "✧")}
                    </span>

                    <div>
                        <strong>
                            ${escapeHTML(achievement.name)}
                        </strong>

                        <p>
                            ${escapeHTML(achievement.description)}
                        </p>
                    </div>

                    <span class="achievement-progress">
                        ${unlocked
                            ? "완료"
                            : `${formatNumber(Math.min(progress, goal))}/${formatNumber(goal)}`}
                    </span>

                </div>
            `;
        }).join("");
    }


    /* =====================================================
       9. 전체 업적 목록
       ===================================================== */

    /*
     * script.js에서 호출:
     * VioletAchievements.renderAll(state)
     */

    function renderAll(state) {
        if (!ensureState(state)) {
            return;
        }

        const container = getElement("achievements-content");

        if (!container) {
            return;
        }

        const unlockedCount = getUnlockedCount(state);
        const totalCount = definitions.length;

        const unlocked = definitions.filter(
            achievement => isUnlocked(achievement, state)
        );

        const locked = definitions.filter(
            achievement => !isUnlocked(achievement, state)
        );

        const ordered = [...locked, ...unlocked];

        const categories = [
            {
                id: "draw",
                name: "뽑기"
            },
            {
                id: "reward",
                name: "당첨금"
            },
            {
                id: "economy",
                name: "수익 및 지출"
            },
            {
                id: "wealth",
                name: "자산"
            },
            {
                id: "codex",
                name: "도감"
            },
            {
                id: "bank",
                name: "대출"
            },
            {
                id: "stock",
                name: "주식"
            }
        ];

        const categoryHTML = categories.map(category => {
            const items = ordered.filter(
                achievement => achievement.category === category.id
            );

            if (items.length === 0) {
                return "";
            }

            return `
                <section class="achievement-category-section">

                    <div class="achievement-category-heading">
                        <h3>
                            ${escapeHTML(category.name)}
                        </h3>

                        <span>
                            ${items.filter(
                                achievement => isUnlocked(achievement, state)
                            ).length}
                            / ${items.length}
                        </span>
                    </div>

                    <div class="achievement-list">
                        ${items.map(achievement =>
                            createAchievementCard(achievement, state)
                        ).join("")}
                    </div>

                </section>
            `;
        }).join("");

        container.innerHTML = `
            <div class="achievement-system">

                <div class="achievement-overview">

                    <div class="achievement-overview-heading">
                        <div>
                            <p class="eyebrow">
                                ACHIEVEMENT COLLECTION
                            </p>

                            <h3>나의 업적</h3>
                        </div>

                        <strong class="achievement-total">
                            ${unlockedCount} / ${totalCount}
                        </strong>
                    </div>

                    <div
                        class="achievement-total-track"
                        role="progressbar"
                        aria-label="전체 업적 달성률"
                        aria-valuemin="0"
                        aria-valuemax="100"
                        aria-valuenow="${Math.round(
                            unlockedCount / totalCount * 100
                        )}">

                        <div
                            class="achievement-total-fill"
                            style="width:${unlockedCount / totalCount * 100}%">
                        </div>
                    </div>

                    <p class="achievement-total-description">
                        ${unlockedCount === totalCount
                            ? "축하해! 모든 업적을 달성했어!"
                            : `총 ${totalCount}개의 업적 중 ${unlockedCount}개를 달성했어.`}
                    </p>

                </div>

                ${categoryHTML}

            </div>
        `;

        const countElement = getElement("achievement-count");

        if (countElement) {
            countElement.textContent =
                `${unlockedCount} / ${totalCount}개 달성`;
        }
    }


    /* =====================================================
       10. 업적 초기화
       ===================================================== */

    /*
     * 업적만 초기화한다.
     * 돈, 도감, 주식 및 대출 데이터는 건드리지 않는다.
     */

    function reset(state) {
        if (!ensureState(state)) {
            return false;
        }

        state.unlockedAchievements = [];

        return true;
    }


    /* =====================================================
       11. 공개 API
       ===================================================== */

    const VioletAchievements = {
        definitions,

        check,

        renderPreview,

        renderAll,

        getProgress,

        getProgressPercent,

        getProgressLabel,

        isUnlocked,

        getUnlockedCount,

        reset,

        get totalAchievements() {
            return definitions.length;
        }
    };


    /* =====================================================
       12. 전역 등록
       ===================================================== */

    window.VioletAchievements = VioletAchievements;

    console.log(
        `[Violet Vault] 업적 시스템 로드 완료. ` +
        `총 ${definitions.length}개 업적.`
    );

})();
```
