```javascript
/* =========================================================
   VIOLET VAULT
   Economy System — economy.js
   =========================================================

   담당 기능
   - 현재 보유 금액 관리
   - 돈 뽑기 비용 차감 및 당첨금 지급
   - 일반 수입 및 지출 처리
   - 대출 및 상환 처리
   - 주식 매수 등에 필요한 금액 차감
   - 순자산 계산
   - 거래 가능 여부 검증

   연결 파일
   - data.js
   - script.js
   - bank.js
   - stock.js
   - statistics.js

   중요:
   실제 돈이 아닌 게임 내부의 가상 화폐만 처리한다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const CURRENCY = DATA.CURRENCY || "Q";

    const DEFAULT_STARTING_BALANCE = Number.isFinite(
        Number(DATA.STARTING_BALANCE)
    )
        ? Number(DATA.STARTING_BALANCE)
        : 100;


    /* =====================================================
       2. 공통 숫자 처리
       ===================================================== */

    /**
     * 숫자를 안전하게 변환한다.
     *
     * 숫자로 변환할 수 없는 값은 fallback을 반환한다.
     */
    function toNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }


    /**
     * 금액을 소수점 둘째 자리까지 정리한다.
     *
     * 뽑기 보상은 정수 Q를 사용하지만,
     * 주식 가격 계산 등에는 소수점이 필요할 수 있다.
     */
    function roundMoney(amount) {
        const number = toNumber(amount, 0);

        return Math.round(
            (number + Number.EPSILON) * 100
        ) / 100;
    }


    /**
     * 유효한 양수 금액인지 검사한다.
     */
    function isValidAmount(amount) {
        const number = Number(amount);

        return (
            Number.isFinite(number) &&
            number > 0 &&
            roundMoney(number) > 0
        );
    }


    /**
     * 금액 표시용 문자열을 반환한다.
     */
    function formatAmount(amount) {
        return roundMoney(amount).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    }


    /**
     * 통화 단위를 포함하여 표시한다.
     */
    function formatCurrency(amount) {
        return `${formatAmount(amount)} ${CURRENCY}`;
    }


    /* =====================================================
       3. 게임 상태 검사
       ===================================================== */

    /**
     * 전달된 게임 상태에 필요한 기본 항목을 준비한다.
     *
     * script.js에서 관리하는 state 객체를 그대로 사용한다.
     * 별도의 돈 잔액을 만들지 않는다.
     */
    function ensureState(state) {
        if (!state || typeof state !== "object") {
            throw new TypeError(
                "[Violet Economy] 올바른 게임 상태가 필요합니다."
            );
        }

        if (!Number.isFinite(Number(state.balance))) {
            state.balance = DEFAULT_STARTING_BALANCE;
        }

        if (!Number.isFinite(Number(state.totalIncome))) {
            state.totalIncome = 0;
        }

        if (!Number.isFinite(Number(state.totalExpenses))) {
            state.totalExpenses = 0;
        }

        if (!Number.isFinite(Number(state.debt))) {
            state.debt = 0;
        }

        if (!Number.isFinite(Number(state.stockPortfolioValue))) {
            state.stockPortfolioValue = 0;
        }

        return state;
    }


    /**
     * 현재 보유 금액을 반환한다.
     */
    function getBalance(state) {
        ensureState(state);

        return roundMoney(state.balance);
    }


    /**
     * 현재 대출 잔액을 반환한다.
     */
    function getDebt(state) {
        ensureState(state);

        return roundMoney(state.debt);
    }


    /**
     * 보유 금액으로 해당 지출을 감당할 수 있는지 검사한다.
     */
    function canAfford(state, amount) {
        ensureState(state);

        if (!isValidAmount(amount)) {
            return false;
        }

        return (
            getBalance(state) >= roundMoney(amount)
        );
    }


    /* =====================================================
       4. 공통 수입 처리
       ===================================================== */

    /**
     * 게임에 돈을 지급한다.
     *
     * state: script.js의 게임 상태
     * amount: 지급할 금액
     * options.recordIncome:
     *   false이면 누적 수입에 반영하지 않는다.
     *
     * 성공 시 true, 실패 시 false를 반환한다.
     */
    function addMoney(state, amount, options = {}) {
        ensureState(state);

        const value = roundMoney(amount);

        if (!isValidAmount(value)) {
            return false;
        }

        const recordIncome = options.recordIncome !== false;

        const newBalance = roundMoney(
            state.balance + value
        );

        const newIncome = recordIncome
            ? roundMoney(state.totalIncome + value)
            : roundMoney(state.totalIncome);

        state.balance = newBalance;
        state.totalIncome = newIncome;

        return true;
    }


    /* =====================================================
       5. 공통 지출 처리
       ===================================================== */

    /**
     * 게임에서 돈을 차감한다.
     *
     * state: script.js의 게임 상태
     * amount: 차감할 금액
     * options.recordExpense:
     *   false이면 누적 지출에 반영하지 않는다.
     *
     * 잔액이 부족하면 아무것도 변경하지 않는다.
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

        const recordExpense = options.recordExpense !== false;

        const newBalance = roundMoney(
            state.balance - value
        );

        const newExpenses = recordExpense
            ? roundMoney(state.totalExpenses + value)
            : roundMoney(state.totalExpenses);

        state.balance = Math.max(0, newBalance);
        state.totalExpenses = newExpenses;

        return true;
    }


    /* =====================================================
       6. 돈 뽑기 경제 처리
       ===================================================== */

    /**
     * 뽑기 1회의 경제 처리를 실행한다.
     *
     * script.js에서 다음과 같이 호출한다.
     *
     * VioletEconomy.processDraw(state, cost, reward)
     *
     * 처리 순서:
     * 1. 뽑기 비용과 당첨금 검증
     * 2. 잔액 확인
     * 3. 뽑기 비용 지출 처리
     * 4. 당첨금 수입 처리
     *
     * 모든 검증이 끝나기 전에는 상태를 변경하지 않는다.
     */
    function processDraw(state, cost, reward) {
        ensureState(state);

        const drawCost = roundMoney(cost);
        const rewardAmount = roundMoney(reward);

        // 뽑기 비용 검증
        if (!isValidAmount(drawCost)) {
            console.warn(
                "[Violet Economy] 잘못된 뽑기 비용입니다."
            );

            return false;
        }

        // 당첨금 검증
        if (!isValidAmount(rewardAmount)) {
            console.warn(
                "[Violet Economy] 잘못된 당첨금입니다."
            );

            return false;
        }

        // 돈 뽑기는 정수 Q 단위로 지급한다.
        if (!Number.isInteger(rewardAmount)) {
            console.warn(
                "[Violet Economy] 당첨금은 정수 Q여야 합니다."
            );

            return false;
        }

        // 뽑기 비용을 감당할 수 있는지 확인한다.
        if (!canAfford(state, drawCost)) {
            return false;
        }

        /*
         * 모든 검증이 끝났으므로 실제 거래를 처리한다.
         *
         * 비용을 먼저 차감하고 당첨금을 지급한다.
         * 두 작업 모두 이 함수 안에서 처리하므로
         * script.js가 같은 거래를 중복 처리하지 않는다.
         */

        const nextBalance = roundMoney(
            state.balance - drawCost + rewardAmount
        );

        const nextExpenses = roundMoney(
            state.totalExpenses + drawCost
        );

        const nextIncome = roundMoney(
            state.totalIncome + rewardAmount
        );

        state.balance = Math.max(0, nextBalance);
        state.totalExpenses = nextExpenses;
        state.totalIncome = nextIncome;

        return true;
    }


    /* =====================================================
       7. 대출 처리
       ===================================================== */

    /**
     * 대출을 실행한다.
     *
     * 대출금은 보유 금액에 추가하고 부채에도 기록한다.
     * 대출금 자체는 수익으로 계산하지 않는다.
     */
    function borrowMoney(state, amount) {
        ensureState(state);

        const value = roundMoney(amount);

        if (!isValidAmount(value)) {
            return {
                success: false,
                amount: 0,
                reason: "invalid_amount"
            };
        }

        const config = DATA.BANK_CONFIG || {};

        if (
            Number.isFinite(Number(config.MAX_LOAN)) &&
            Number(config.MAX_LOAN) >= 0 &&
            value > Number(config.MAX_LOAN)
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
       8. 대출 상환 처리
       ===================================================== */

    /**
     * 대출금을 상환한다.
     *
     * 요청 금액이 현재 잔액이나 대출 잔액보다 많으면
     * 실제 상환 가능한 금액까지만 상환한다.
     *
     * 상환금은 소비가 아니라 부채 상환으로 취급하므로
     * totalIncome이나 totalExpenses에 반영하지 않는다.
     */
    function repayDebt(state, requestedAmount) {
        ensureState(state);

        const requested = roundMoney(requestedAmount);

        if (!isValidAmount(requested)) {
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
            Math.min(requested, balance, debt)
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
       9. 주식 및 투자 보조 기능
       ===================================================== */

    /**
     * 주식 매수 등에 사용할 수 있는 공통 지출 함수.
     *
     * 매수 대금이 비용으로 집계되므로
     * stock.js에서 같은 금액을 다시 차감하지 않도록 한다.
     */
    function purchase(state, amount) {
        return spendMoney(state, amount);
    }


    /**
     * 주식 매도 대금 등을 지급한다.
     *
     * options.recordIncome을 false로 전달하면
     * 지급된 매도 대금을 총수입에 포함하지 않을 수 있다.
     */
    function receiveProceeds(state, amount, options = {}) {
        return addMoney(state, amount, options);
    }


    /**
     * 현재 보유 주식의 평가 금액을 반환한다.
     *
     * stock.js에서 state.stockPortfolioValue를
     * 갱신하도록 설계한다.
     */
    function getPortfolioValue(state) {
        ensureState(state);

        return Math.max(
            0,
            roundMoney(state.stockPortfolioValue)
        );
    }


    /* =====================================================
       10. 순자산 계산
       ===================================================== */

    /**
     * 순자산 = 현금 + 주식 평가 금액 - 대출 잔액
     *
     * 누적 수익이나 누적 지출을 다시 더하거나 빼지 않는다.
     * 이미 현재 보유 금액에 반영되어 있기 때문이다.
     */
    function netWorth(state) {
        ensureState(state);

        const balance = getBalance(state);
        const debt = getDebt(state);
        const portfolioValue = getPortfolioValue(state);

        return roundMoney(
            balance + portfolioValue - debt
        );
    }


    /* =====================================================
       11. 경제 요약 정보
       ===================================================== */

    /**
     * 화면이나 통계에 사용할 수 있는
     * 현재 경제 상태 요약을 반환한다.
     */
    function getSummary(state) {
        ensureState(state);

        return {
            balance: getBalance(state),

            totalIncome: roundMoney(state.totalIncome),

            totalExpenses: roundMoney(state.totalExpenses),

            debt: getDebt(state),

            stockPortfolioValue: getPortfolioValue(state),

            netWorth: netWorth(state),

            totalDraws: Math.max(
                0,
                Math.floor(toNumber(state.totalDraws))
            ),

            bestWin: roundMoney(state.bestWin)
        };
    }


    /* =====================================================
       12. 공개 API
       ===================================================== */

    const VioletEconomy = {
        // 기본 검사 및 표시
        ensureState,
        toNumber,
        roundMoney,
        isValidAmount,
        formatAmount,
        formatCurrency,

        // 잔액 조회
        getBalance,
        getDebt,
        canAfford,

        // 일반적인 돈 관리
        addMoney,
        spendMoney,

        // 뽑기
        processDraw,

        // 대출 및 상환
        borrowMoney,
        repayDebt,

        // 주식 및 투자 보조 기능
        purchase,
        receiveProceeds,
        getPortfolioValue,

        // 순자산과 요약
        netWorth,
        getSummary
    };


    /* =====================================================
       13. 전역 등록
       ===================================================== */

    window.VioletEconomy = VioletEconomy;

    console.log(
        "[Violet Vault] 경제 시스템 로드 완료."
    );

})();
```
