/* =========================================================
   VIOLET VAULT
   Economy System — economy.js
   Compatible Economy API
   =========================================================

   담당 기능
   - 가상 화폐 잔액 관리
   - 뽑기 비용 차감 및 당첨금 지급
   - 수입 및 지출 기록
   - 무이자 대출 및 상환
   - 주식 매수 및 매도 지원
   - 순자산 계산
   - 거래 기록 저장
   - 기존 Economy API 호환

   연결 파일
   - data.js
   - save.js
   - script.js
   - bank.js
   - stock.js
   - statistics.js
   - achievements.js

   실제 금전 거래는 처리하지 않는다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const CURRENCY = DATA.CURRENCY || "Q";

    const STARTING_BALANCE = Number.isFinite(
        Number(DATA.STARTING_BALANCE)
    )
        ? Math.max(0, Number(DATA.STARTING_BALANCE))
        : 100;

    const DRAW_COST = Math.max(
        0.01,
        roundMoney(DATA.DRAW_COST ?? 1)
    );

    const MIN_REWARD = Number.isInteger(
        DATA.MIN_REWARD
    )
        ? DATA.MIN_REWARD
        : 1;

    const MAX_REWARD = Number.isInteger(
        DATA.MAX_REWARD
    )
        ? DATA.MAX_REWARD
        : 100;

    const HISTORY_LIMIT = Math.max(
        1,
        Math.floor(Number(DATA.HISTORY_LIMIT) || 300)
    );


    /* =====================================================
       2. 공통 숫자 처리
       ===================================================== */

    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    function roundMoney(value) {
        const number = toNumber(value);

        return Math.round(
            (number + Number.EPSILON) * 100
        ) / 100;
    }


    function isValidAmount(value) {
        const amount = Number(value);

        return (
            Number.isFinite(amount) &&
            amount > 0 &&
            roundMoney(amount) > 0
        );
    }


    function formatAmount(value) {
        return roundMoney(value).toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        );
    }


    function formatCurrency(value) {
        return `${formatAmount(value)} ${CURRENCY}`;
    }


    function createId() {
        return (
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 10)
        );
    }


    /* =====================================================
       3. 게임 상태 가져오기
       ===================================================== */

    function getState() {
        if (
            window.SaveStore &&
            typeof window.SaveStore.getState === "function"
        ) {
            return window.SaveStore.getState();
        }

        if (
            window.VioletVaultSave &&
            typeof window.VioletVaultSave.getState === "function"
        ) {
            return window.VioletVaultSave.getState();
        }

        if (
            window.VioletVaultApp &&
            window.VioletVaultApp.state
        ) {
            return window.VioletVaultApp.state;
        }

        return null;
    }


    function ensureState(state) {
        if (
            !state ||
            typeof state !== "object" ||
            Array.isArray(state)
        ) {
            throw new TypeError(
                "[Violet Economy] 올바른 게임 상태가 필요합니다."
            );
        }

        if (
            !Number.isFinite(Number(state.balance))
        ) {
            state.balance = STARTING_BALANCE;
        }

        if (
            !Number.isFinite(Number(state.totalIncome))
        ) {
            state.totalIncome = toNumber(
                state.totalEarned
            );
        }

        if (
            !Number.isFinite(Number(state.totalExpenses))
        ) {
            state.totalExpenses = toNumber(
                state.totalSpent
            );
        }

        if (
            !Number.isFinite(Number(state.debt))
        ) {
            state.debt = 0;
        }

        if (
            !Number.isFinite(
                Number(state.stockPortfolioValue)
            )
        ) {
            state.stockPortfolioValue = 0;
        }

        if (
            !Number.isFinite(
                Number(state.stockRealizedProfit)
            )
        ) {
            state.stockRealizedProfit = 0;
        }

        if (
            !Number.isFinite(Number(state.totalDraws))
        ) {
            state.totalDraws = 0;
        }

        if (
            !Number.isFinite(Number(state.bestWin))
        ) {
            state.bestWin = toNumber(
                state.highestPrize
            );
        }

        if (!Array.isArray(state.history)) {
            state.history = [];
        }

        if (!Array.isArray(state.codex)) {
            state.codex = [];
        }

        if (!Array.isArray(state.unlockedAchievements)) {
            state.unlockedAchievements = [];
        }

        if (
            !state.stocks ||
            typeof state.stocks !== "object" ||
            Array.isArray(state.stocks)
        ) {
            state.stocks = {};
        }

        return state;
    }


    /* =====================================================
       4. 잔액 및 부채 조회
       ===================================================== */

    function getBalance(state) {
        ensureState(state);

        return roundMoney(state.balance);
    }


    function getDebt(state) {
        ensureState(state);

        return roundMoney(state.debt);
    }


    function canAfford(state, amount) {
        ensureState(state);

        const value = roundMoney(amount);

        if (!isValidAmount(value)) {
            return false;
        }

        return getBalance(state) >= value;
    }


    /* =====================================================
       5. 공통 수입 처리
       ===================================================== */

    /*
     * 가상 화폐를 지급한다.
     *
     * options.recordIncome === false이면
     * 총수입 통계는 증가시키지 않는다.
     */

    function addMoney(state, amount, options = {}) {
        ensureState(state);

        const value = roundMoney(amount);

        if (!isValidAmount(value)) {
            return false;
        }

        const nextBalance = roundMoney(
            state.balance + value
        );

        const nextIncome =
            options.recordIncome === false
                ? roundMoney(state.totalIncome)
                : roundMoney(
                    state.totalIncome + value
                );

        if (
            !Number.isFinite(nextBalance) ||
            !Number.isFinite(nextIncome)
        ) {
            return false;
        }

        state.balance = nextBalance;
        state.totalIncome = nextIncome;

        return true;
    }


    /* =====================================================
       6. 공통 지출 처리
       ===================================================== */

    /*
     * 가상 화폐를 차감한다.
     *
     * 잔액이 부족하면 상태를 변경하지 않는다.
     *
     * options.recordExpense === false이면
     * 총지출 통계를 증가시키지 않는다.
     */

    function spendMoney(state, amount, options = {}) {
        ensureState(state);

        const value = roundMoney(amount);

        if (!isValidAmount(value)) {
            return false;
        }

        if (!canAfford(state, value)) {
            return false;
        }

        const nextBalance = roundMoney(
            state.balance - value
        );

        const nextExpenses =
            options.recordExpense === false
                ? roundMoney(state.totalExpenses)
                : roundMoney(
                    state.totalExpenses + value
                );

        if (
            !Number.isFinite(nextBalance) ||
            !Number.isFinite(nextExpenses)
        ) {
            return false;
        }

        state.balance = Math.max(
            0,
            nextBalance
        );

        state.totalExpenses = nextExpenses;

        return true;
    }


    /* =====================================================
       7. 뽑기 비용 및 당첨금 처리
       ===================================================== */

    /*
     * 기존 경제 API.
     *
     * 모든 검증이 성공한 뒤에만 잔액을 변경한다.
     * 여기서는 뽑기 횟수나 기록을 중복 추가하지 않는다.
     */

    function processDraw(state, cost, reward) {
        ensureState(state);

        const drawCost = roundMoney(cost);

        const rewardAmount = Number(reward);

        if (
            !isValidAmount(drawCost) ||
            !Number.isInteger(rewardAmount) ||
            rewardAmount < MIN_REWARD ||
            rewardAmount > MAX_REWARD
        ) {
            return false;
        }

        if (!canAfford(state, drawCost)) {
            return false;
        }

        const nextBalance = roundMoney(
            state.balance - drawCost + rewardAmount
        );

        const nextExpenses = roundMoney(
            state.totalExpenses + drawCost
        );

        const nextIncome = roundMoney(
            state.totalIncome + rewardAmount
        );

        if (
            !Number.isFinite(nextBalance) ||
            !Number.isFinite(nextExpenses) ||
            !Number.isFinite(nextIncome)
        ) {
            return false;
        }

        state.balance = Math.max(
            0,
            nextBalance
        );

        state.totalExpenses = nextExpenses;
        state.totalIncome = nextIncome;

        return true;
    }


    /* =====================================================
       8. 게임 상태 저장 및 변경 알림
       ===================================================== */

    function saveState(state) {
        if (
            window.SaveStore &&
            typeof window.SaveStore.save === "function"
        ) {
            return window.SaveStore.save(state);
        }

        if (
            window.VioletVaultSave &&
            typeof window.VioletVaultSave.save === "function"
        ) {
            return window.VioletVaultSave.save(state);
        }

        console.warn(
            "[Violet Economy] 저장 모듈을 찾을 수 없습니다."
        );

        return false;
    }


    function notifyDataChanged(state) {
        try {
            window.dispatchEvent(
                new CustomEvent("game:data-changed", {
                    detail: {
                        state
                    }
                })
            );
        } catch (error) {
            console.warn(
                "[Violet Economy] 화면 변경 알림 실패:",
                error
            );
        }
    }


    /* =====================================================
       9. 거래 기록 추가
       ===================================================== */

    function addHistory(state, entry) {
        ensureState(state);

        if (
            !entry ||
            typeof entry !== "object"
        ) {
            return false;
        }

        state.history.unshift({
            ...entry,

            id: entry.id || createId(),

            timestamp: Date.now()
        });

        if (state.history.length > HISTORY_LIMIT) {
            state.history.length = HISTORY_LIMIT;
        }

        return true;
    }


    /* =====================================================
       10. 기존 뽑기 버튼과 연결되는 API
       ===================================================== */

    /*
     * script.js는 다음과 같이 호출한다.
     *
     * Economy.canAfford(cost)
     * Economy.draw(prize)
     *
     * 아래 함수들은 현재 게임 상태를 자동으로 가져온다.
     */

    function draw(reward) {
        let state;

        try {
            state = ensureState(getState());
        } catch (error) {
            console.error(
                "[Violet Economy] 게임 상태를 불러오지 못했습니다.",
                error
            );

            return {
                ok: false,
                reason: "invalid"
            };
        }

        const prize = Number(reward);

        if (
            !Number.isInteger(prize) ||
            prize < MIN_REWARD ||
            prize > MAX_REWARD
        ) {
            return {
                ok: false,
                reason: "invalid"
            };
        }

        if (!canAfford(state, DRAW_COST)) {
            return {
                ok: false,
                reason: "funds"
            };
        }

        /*
         * 비용 차감과 당첨금 지급.
         */

        const success = processDraw(
            state,
            DRAW_COST,
            prize
        );

        if (!success) {
            return {
                ok: false,
                reason: "invalid"
            };
        }

        /*
         * 뽑기 횟수와 최고 당첨금 갱신.
         */

        state.totalDraws += 1;

        state.bestWin = Math.max(
            toNumber(state.bestWin),
            prize
        );

        state.highestPrize = state.bestWin;

        /*
         * 최근 당첨 정보 저장.
         */

        const timestamp = Date.now();

        state.lastPrize = {
            prize,
            amount: prize,
            reward: prize,
            cost: DRAW_COST,
            timestamp,
            at: timestamp
        };

        /*
         * 도감에 당첨 금액을 등록한다.
         * 이미 수집한 금액은 중복으로 추가하지 않는다.
         */

        if (
            Array.isArray(state.codex) &&
            !state.codex.includes(prize)
        ) {
            state.codex.push(prize);

            state.codex.sort(
                (a, b) => a - b
            );
        }

        /*
         * 뽑기 기록.
         *
         * amount에는 당첨금을 기록한다.
         * cost에는 차감된 뽑기 비용을 기록한다.
         */

        addHistory(state, {
            type: "draw",
            amount: prize,
            prize,
            reward: prize,
            cost: DRAW_COST
        });

        /*
         * 자동 저장 및 화면 갱신 알림.
         */

        saveState(state);

        notifyDataChanged(state);

        return {
            ok: true,
            reason: null,
            prize,
            reward: prize,
            cost: DRAW_COST,
            balance: state.balance
        };
    }


    /* =====================================================
       11. 대출 처리
       ===================================================== */

    function borrowMoney(state, amount) {
        ensureState(state);

        const value = roundMoney(amount);

        if (
            !Number.isSafeInteger(value) ||
            !isValidAmount(value)
        ) {
            return {
                success: false,
                amount: 0,
                reason: "invalid_amount"
            };
        }

        const config = DATA.BANK_CONFIG || {};

        const configuredLimit = config.MAX_LOAN;

        /*
         * MAX_LOAN이 null이면 한도를 지정하지 않는다.
         */

        if (
            configuredLimit !== null &&
            configuredLimit !== undefined &&
            Number.isFinite(Number(configuredLimit)) &&
            Number(configuredLimit) >= 0 &&
            value > Number(configuredLimit)
        ) {
            return {
                success: false,
                amount: 0,
                reason: "loan_limit"
            };
        }

        const nextBalance = roundMoney(
            state.balance + value
        );

        const nextDebt = roundMoney(
            state.debt + value
        );

        if (
            !Number.isFinite(nextBalance) ||
            !Number.isFinite(nextDebt)
        ) {
            return {
                success: false,
                amount: 0,
                reason: "invalid_amount"
            };
        }

        state.balance = nextBalance;
        state.debt = nextDebt;

        return {
            success: true,
            amount: value,
            balance: state.balance,
            debt: state.debt
        };
    }


    /* =====================================================
       12. 대출 상환
       ===================================================== */

    function repayDebt(state, requestedAmount) {
        ensureState(state);

        const requested = Number(requestedAmount);

        if (
            !Number.isSafeInteger(requested) ||
            requested <= 0
        ) {
            return {
                success: false,
                amount: 0,
                reason: "invalid_amount"
            };
        }

        const balance = getBalance(state);

        const debt = getDebt(state);

        if (debt <= 0) {
            return {
                success: false,
                amount: 0,
                reason: "no_debt"
            };
        }

        if (balance <= 0) {
            return {
                success: false,
                amount: 0,
                reason: "no_balance"
            };
        }

        const amount = roundMoney(
            Math.min(
                requested,
                balance,
                debt
            )
        );

        if (amount <= 0) {
            return {
                success: false,
                amount: 0,
                reason: "invalid_amount"
            };
        }

        state.balance = Math.max(
            0,
            roundMoney(balance - amount)
        );

        state.debt = Math.max(
            0,
            roundMoney(debt - amount)
        );

        return {
            success: true,
            amount,
            balance: state.balance,
            debt: state.debt
        };
    }


    /* =====================================================
       13. 주식 거래 지원
       ===================================================== */

    /*
     * 주식 매수 대금은 일반 지출로 처리한다.
     */

    function purchase(state, amount) {
        return spendMoney(
            state,
            amount
        );
    }


    /*
     * 주식 매도 대금을 지급한다.
     */

    function receiveProceeds(
        state,
        amount,
        options = {}
    ) {
        return addMoney(
            state,
            amount,
            options
        );
    }


    function getPortfolioValue(state) {
        ensureState(state);

        return Math.max(
            0,
            roundMoney(state.stockPortfolioValue)
        );
    }


    /* =====================================================
       14. 순자산 계산
       ===================================================== */

    /*
     * 순자산 = 현금 + 주식 평가액 - 부채
     */

    function netWorth(state) {
        ensureState(state);

        return roundMoney(
            getBalance(state) +
            getPortfolioValue(state) -
            getDebt(state)
        );
    }


    /* =====================================================
       15. 경제 요약 정보
       ===================================================== */

    function getSummary(state) {
        ensureState(state);

        return {
            balance: getBalance(state),

            totalIncome: roundMoney(
                state.totalIncome
            ),

            totalExpenses: roundMoney(
                state.totalExpenses
            ),

            debt: getDebt(state),

            stockPortfolioValue: getPortfolioValue(state),

            netWorth: netWorth(state),

            totalDraws: Math.max(
                0,
                Math.floor(
                    toNumber(state.totalDraws)
                )
            ),

            bestWin: roundMoney(
                state.bestWin
            )
        };
    }


    /* =====================================================
       16. VioletEconomy API
       ===================================================== */

    /*
     * 은행 및 주식 모듈에서 사용한다.
     *
     * 이 API의 금액 관련 함수는 state를 첫 번째
     * 인수로 전달하는 기존 방식을 유지한다.
     */

    const VioletEconomy = {
        ensureState,

        toNumber,

        roundMoney,

        isValidAmount,

        formatAmount,

        formatCurrency,

        getBalance,

        getDebt,

        canAfford,

        addMoney,

        spendMoney,

        processDraw,

        borrowMoney,

        repayDebt,

        purchase,

        receiveProceeds,

        getPortfolioValue,

        netWorth,

        getSummary,

        addHistory,

        saveState,

        get state() {
            return getState();
        }
    };


    /* =====================================================
       17. Economy API 호환
       ===================================================== */

    /*
     * 기존 script.js와 연결한다.
     *
     * Economy.canAfford(amount)
     * Economy.draw(prize)
     */

    const Economy = {
        canAfford(amount) {
            try {
                return canAfford(
                    getState(),
                    amount
                );
            } catch (error) {
                console.error(
                    "[Violet Economy] 잔액 확인 실패:",
                    error
                );

                return false;
            }
        },

        draw,

        getBalance() {
            return getBalance(
                getState()
            );
        },

        getDebt() {
            return getDebt(
                getState()
            );
        },

        formatAmount,

        formatCurrency,

        getSummary() {
            return getSummary(
                getState()
            );
        }
    };


    /* =====================================================
       18. 전역 등록
       ===================================================== */

    window.VioletEconomy = VioletEconomy;

    window.Economy = Economy;


    /* =====================================================
       19. 준비 완료
       ===================================================== */

    console.log(
        "[Violet Vault] 경제 시스템 로드 완료."
    );

    console.log(
        "[Violet Vault] Economy API 연결 완료."
    );

})();
