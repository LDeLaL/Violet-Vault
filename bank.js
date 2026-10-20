/* =========================================================
   VIOLET VAULT
   Bank & Loan System — bank.js
   =========================================================

   담당 기능
   - 무이자 대출
   - 상환 기한 없는 대출
   - 대출 신청 및 상환
   - 대출 잔액 표시
   - 거래 기록 연동
   - 경제 시스템 연동
   - 자동 저장 연동
   - 업적 시스템 연동

   연결 파일
   - index.html
   - bank.css
   - data.js
   - economy.js
   - save.js
   - achievements.js
   - script.js

   대출 규칙
   - 이자율: 0%
   - 상환 기한: 없음
   - 부분 상환: 허용
   - 상환 금액: 현재 잔액과 부채를 초과할 수 없음
   - MAX_LOAN이 null이면 별도 대출 한도 없음

   실제 돈이 아닌 게임 내부의 가상 화폐만 처리한다.
   ========================================================= */

(() => {
    "use strict";


    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const BANK_CONFIG = DATA.BANK_CONFIG || {};

    const CURRENCY = DATA.CURRENCY || "Q";

    const DEFAULT_MAX_LOAN = null;

    let app = null;

    let initialized = false;


    /* =====================================================
       2. 공통 유틸리티
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


    function formatAmount(value) {
        return roundMoney(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }


    function formatQ(value) {
        return `${formatAmount(value)} ${CURRENCY}`;
    }


    function showMessage(title, message) {
        if (app && typeof app.toast === "function") {
            app.toast(title, message);
        } else {
            console.log(`[Violet Vault Bank] ${title}: ${message}`);
        }
    }


    function getState() {
        if (app && app.state) {
            return app.state;
        }

        return null;
    }


    function getEconomy() {
        return window.VioletEconomy || null;
    }


    function ensureState(state) {
        if (!state || typeof state !== "object") {
            return false;
        }

        if (!Number.isFinite(Number(state.balance))) {
            state.balance = 0;
        }

        if (!Number.isFinite(Number(state.debt))) {
            state.debt = 0;
        }

        if (!Array.isArray(state.history)) {
            state.history = [];
        }

        return true;
    }


    /* =====================================================
       3. 입력값 검증
       ===================================================== */

    function validateAmount(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return {
                valid: false,
                amount: 0,
                reason: "invalid"
            };
        }

        if (!Number.isSafeInteger(amount)) {
            return {
                valid: false,
                amount: 0,
                reason: "integer"
            };
        }

        if (amount <= 0) {
            return {
                valid: false,
                amount: 0,
                reason: "positive"
            };
        }

        return {
            valid: true,
            amount,
            reason: null
        };
    }


    function getMaxLoan() {
        const configured = BANK_CONFIG.MAX_LOAN;

        if (configured === null || configured === undefined) {
            return DEFAULT_MAX_LOAN;
        }

        const value = Number(configured);

        if (!Number.isFinite(value) || value < 0) {
            return DEFAULT_MAX_LOAN;
        }

        return value;
    }


    /* =====================================================
       4. 경제 시스템 연결
       ===================================================== */

    /**
     * 대출금을 지급한다.
     *
     * 중요:
     * 대출은 수입이 아니다.
     * 현재 잔액과 부채를 같은 금액만큼 증가시킨다.
     *
     * economy.js의 기존 borrowMoney() 함수는
     * MAX_LOAN이 null일 때 이를 0으로 해석할 수 있으므로,
     * 한도가 없는 경우 addMoney()를 이용해 처리한다.
     */

    function processBorrow(state, amount) {
        const economy = getEconomy();

        if (!economy) {
            return {
                success: false,
                reason: "economy_unavailable"
            };
        }

        const maxLoan = getMaxLoan();

        if (
            maxLoan !== null &&
            amount > maxLoan
        ) {
            return {
                success: false,
                reason: "loan_limit"
            };
        }

        /*
         * 한도가 명시적으로 설정되어 있다면
         * economy.js의 공통 대출 함수를 사용한다.
         */

        if (
            maxLoan !== null &&
            typeof economy.borrowMoney === "function"
        ) {
            const result = economy.borrowMoney(state, amount);

            if (!result || result.success !== true) {
                return {
                    success: false,
                    reason: result?.reason || "borrow_failed"
                };
            }

            return {
                success: true,
                amount
            };
        }

        /*
         * 무제한 대출:
         *
         * 대출금 지급은 공통 경제 시스템의 addMoney()로 처리한다.
         * recordIncome: false이므로 총수입은 증가하지 않는다.
         */

        if (typeof economy.addMoney !== "function") {
            return {
                success: false,
                reason: "economy_unavailable"
            };
        }

        const added = economy.addMoney(
            state,
            amount,
            {
                recordIncome: false
            }
        );

        if (!added) {
            return {
                success: false,
                reason: "borrow_failed"
            };
        }

        state.debt = roundMoney(
            safeNumber(state.debt) + amount
        );

        return {
            success: true,
            amount
        };
    }


    /**
     * 상환금을 처리한다.
     *
     * economy.js의 repayDebt()가 실제 상환 가능 금액을
     * 계산하고 잔액과 부채를 변경한다.
     */

    function processRepayment(state, amount) {
        const economy = getEconomy();

        if (
            !economy ||
            typeof economy.repayDebt !== "function"
        ) {
            return {
                success: false,
                amount: 0,
                reason: "economy_unavailable"
            };
        }

        return economy.repayDebt(state, amount);
    }


    /* =====================================================
       5. 거래 기록
       ===================================================== */

    function recordTransaction(state, entry) {
        if (
            app &&
            typeof app.addHistory === "function"
        ) {
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
            Math.floor(
                safeNumber(DATA.HISTORY_LIMIT, 300)
            )
        );

        if (state.history.length > limit) {
            state.history.length = limit;
        }
    }


    /* =====================================================
       6. 업적 검사
       ===================================================== */

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
       7. 저장 및 화면 갱신
       ===================================================== */

    function refresh() {
        if (app && typeof app.save === "function") {
            app.save();
        }

        /*
         * script.js의 전체 렌더링을 호출한다.
         *
         * 이 과정에서 은행 잔액, 자산 현황, 순자산,
         * 거래 기록 및 업적 표시도 갱신된다.
         */

        if (app && typeof app.render === "function") {
            app.render();
        } else {
            render(getState());
        }
    }


    /* =====================================================
       8. 대출 실행
       ===================================================== */

    function borrow(requestedAmount) {
        const state = getState();

        if (!ensureState(state)) {
            showMessage(
                "오류",
                "게임 상태를 불러오지 못했어."
            );

            return false;
        }

        const validation = validateAmount(requestedAmount);

        if (!validation.valid) {
            const messages = {
                invalid: "대출 금액을 숫자로 입력해 줘.",
                integer: "대출 금액은 정수 Q로 입력해 줘.",
                positive: "대출 금액은 1 Q 이상이어야 해."
            };

            showMessage(
                "잘못된 금액",
                messages[validation.reason] ||
                    "대출 금액을 다시 확인해 줘."
            );

            return false;
        }

        const amount = validation.amount;

        /*
         * 상태 변경 전에 한도를 검사한다.
         */

        const maxLoan = getMaxLoan();

        if (
            maxLoan !== null &&
            amount > maxLoan
        ) {
            showMessage(
                "대출 한도 초과",
                `한 번에 최대 ${formatQ(maxLoan)}까지 대출할 수 있어.`
            );

            return false;
        }

        const result = processBorrow(state, amount);

        if (!result.success) {
            const messages = {
                loan_limit: "대출 한도를 초과했어.",
                economy_unavailable: "경제 시스템을 불러오지 못했어.",
                borrow_failed: "대출 거래를 처리하지 못했어."
            };

            showMessage(
                "대출 실패",
                messages[result.reason] ||
                    "대출을 처리하는 중 문제가 발생했어."
            );

            return false;
        }

        /*
         * 거래 기록:
         * 대출금은 수익이 아니라 부채로 기록한다.
         */

        recordTransaction(state, {
            type: "loan",
            amount
        });

        checkAchievements(state);

        refresh();

        const input = getElement("loan-amount");

        if (input) {
            input.value = "";
        }

        showMessage(
            "대출 완료",
            `${formatQ(amount)}을 대출받았어. 이자는 없고 상환 기한도 없어!`
        );

        return true;
    }


    /* =====================================================
       9. 대출 상환
       ===================================================== */

    function repay(requestedAmount) {
        const state = getState();

        if (!ensureState(state)) {
            showMessage(
                "오류",
                "게임 상태를 불러오지 못했어."
            );

            return false;
        }

        const validation = validateAmount(requestedAmount);

        if (!validation.valid) {
            const messages = {
                invalid: "상환 금액을 숫자로 입력해 줘.",
                integer: "상환 금액은 정수 Q로 입력해 줘.",
                positive: "상환 금액은 1 Q 이상이어야 해."
            };

            showMessage(
                "잘못된 금액",
                messages[validation.reason] ||
                    "상환 금액을 다시 확인해 줘."
            );

            return false;
        }

        const requested = validation.amount;

        const debt = Math.max(
            0,
            roundMoney(state.debt)
        );

        const balance = Math.max(
            0,
            roundMoney(state.balance)
        );

        if (debt <= 0) {
            showMessage(
                "대출 없음",
                "현재 갚아야 할 대출이 없어."
            );

            return false;
        }

        if (balance <= 0) {
            showMessage(
                "잔액 부족",
                "현재 보유 금액이 없어. 돈을 먼저 마련해 줘."
            );

            return false;
        }

        /*
         * 실제 상환 금액은 다음 세 금액 중
         * 가장 작은 값으로 결정된다.
         *
         * 1. 사용자가 요청한 금액
         * 2. 현재 보유 금액
         * 3. 현재 부채
         */

        const expectedAmount = Math.min(
            requested,
            balance,
            debt
        );

        const result = processRepayment(
            state,
            requested
        );

        if (!result || result.success !== true) {
            const messages = {
                no_debt: "현재 상환할 대출이 없어.",
                no_balance: "상환할 돈이 부족해.",
                invalid_amount: "상환 금액을 다시 확인해 줘."
            };

            showMessage(
                "상환 실패",
                messages[result?.reason] ||
                    "상환을 처리하는 중 문제가 발생했어."
            );

            return false;
        }

        const paidAmount = roundMoney(
            result.amount || expectedAmount
        );

        if (paidAmount <= 0) {
            showMessage(
                "상환 실패",
                "상환 가능한 금액이 없어."
            );

            return false;
        }

        recordTransaction(state, {
            type: "repayment",
            amount: paidAmount
        });

        checkAchievements(state);

        refresh();

        const input = getElement("repay-amount");

        if (input) {
            input.value = "";
        }

        if (state.debt <= 0) {
            showMessage(
                "전액 상환 완료!",
                `${formatQ(paidAmount)}을 갚고 모든 빚을 청산했어!`
            );
        } else {
            showMessage(
                "상환 완료",
                `${formatQ(paidAmount)}을 상환했어. 남은 빚은 ${formatQ(state.debt)}이야.`
            );
        }

        return true;
    }


    /* =====================================================
       10. 입력창 이벤트
       ===================================================== */

    function handleBorrowClick() {
        const input = getElement("loan-amount");

        if (!input) {
            showMessage(
                "오류",
                "대출 금액 입력창을 찾을 수 없어."
            );

            return;
        }

        borrow(input.value);
    }


    function handleRepayClick() {
        const input = getElement("repay-amount");

        if (!input) {
            showMessage(
                "오류",
                "상환 금액 입력창을 찾을 수 없어."
            );

            return;
        }

        repay(input.value);
    }


    function bindEvents() {
        const borrowButton = getElement("borrow-button");
        const repayButton = getElement("repay-button");

        const loanInput = getElement("loan-amount");
        const repayInput = getElement("repay-amount");

        if (borrowButton) {
            borrowButton.addEventListener(
                "click",
                handleBorrowClick
            );
        }

        if (repayButton) {
            repayButton.addEventListener(
                "click",
                handleRepayClick
            );
        }

        /*
         * 입력창에서 Enter를 눌러도 실행되도록 한다.
         */

        if (loanInput) {
            loanInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    handleBorrowClick();
                }
            });
        }

        if (repayInput) {
            repayInput.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    handleRepayClick();
                }
            });
        }
    }


    /* =====================================================
       11. 은행 요약 정보
       ===================================================== */

    function ensureBankSummaryElement() {
        const panel = getElement("bank-panel");

        if (!panel) {
            return null;
        }

        let summary = getElement("bank-account-summary");

        if (summary) {
            return summary;
        }

        const balanceCard = panel.querySelector(
            ".bank-balance-card"
        );

        if (!balanceCard) {
            return null;
        }

        summary = document.createElement("div");
        summary.id = "bank-account-summary";
        summary.className = "bank-account-summary";

        balanceCard.insertAdjacentElement(
            "afterend",
            summary
        );

        return summary;
    }


    function renderSummary(state) {
        const summary = ensureBankSummaryElement();

        if (!summary) {
            return;
        }

        const debt = Math.max(
            0,
            roundMoney(state.debt)
        );

        const balance = Math.max(
            0,
            roundMoney(state.balance)
        );

        let statusText = "대출을 이용할 수 있어.";
        let statusClass = "bank-status-available";

        if (debt > 0) {
            statusText = "대출 이용 중";
            statusClass = "bank-status-active";
        }

        summary.innerHTML = `
            <div class="bank-policy-grid">

                <div class="bank-policy-item">
                    <span>이자율</span>
                    <strong>0%</strong>
                </div>

                <div class="bank-policy-item">
                    <span>상환 기한</span>
                    <strong>없음</strong>
                </div>

            </div>

            <div class="bank-account-status ${statusClass}">
                <span class="bank-account-status-dot"></span>
                <span>${statusText}</span>
            </div>

            <div class="bank-available-balance">
                <span>현재 보유 금액</span>
                <strong>${formatQ(balance)}</strong>
            </div>
        `;
    }


    /* =====================================================
       12. 은행 화면 렌더링
       ===================================================== */

    function render(state = getState()) {
        if (!ensureState(state)) {
            return;
        }

        setText("bank-debt", formatQ(state.debt));

        const status = getElement("bank-status");

        if (status) {
            status.textContent = "무이자";
        }

        renderSummary(state);

        /*
         * 상환할 부채가 없으면 상환 버튼을 비활성화한다.
         */

        const repayButton = getElement("repay-button");

        if (repayButton) {
            repayButton.disabled =
                safeNumber(state.debt) <= 0 ||
                safeNumber(state.balance) <= 0;
        }

        const borrowInput = getElement("loan-amount");
        const repayInput = getElement("repay-amount");

        if (borrowInput) {
            borrowInput.min = "1";
            borrowInput.step = "1";

            const maxLoan = getMaxLoan();

            if (maxLoan !== null) {
                borrowInput.max = String(maxLoan);
            } else {
                borrowInput.removeAttribute("max");
            }
        }

        if (repayInput) {
            repayInput.min = "1";
            repayInput.step = "1";
            repayInput.max = String(
                Math.max(0, Math.floor(state.balance))
            );
        }
    }


    function setText(id, value) {
        const element = getElement(id);

        if (element) {
            element.textContent = String(value);
        }
    }


    /* =====================================================
       13. 대출 정보 조회
       ===================================================== */

    function getSummary(state = getState()) {
        if (!ensureState(state)) {
            return null;
        }

        const debt = roundMoney(state.debt);
        const balance = roundMoney(state.balance);

        return {
            balance,
            debt,

            interestRate: 0,

            hasDeadline: false,

            maxLoan: getMaxLoan(),

            canRepay: debt > 0 && balance > 0,

            isInDebt: debt > 0
        };
    }


    /* =====================================================
       14. 초기화
       ===================================================== */

    function init(application) {
        if (initialized) {
            return;
        }

        app = application || null;

        bindEvents();

        render(getState());

        initialized = true;

        console.log(
            "[Violet Vault] 은행 및 대출 시스템 로드 완료."
        );
    }


    /* =====================================================
       15. 공개 API
       ===================================================== */

    window.VioletBank = {
        init,

        render,

        borrow,

        repay,

        getSummary,

        getMaxLoan,

        get state() {
            return getState();
        }
    };


    console.log(
        "[Violet Vault] 은행 모듈 준비 완료."
    );

})();
