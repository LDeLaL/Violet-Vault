/* =========================================================
   VIOLET VAULT
   Bank & Loan System — bank.js
   Compatible with the current save.js, economy.js and script.js
   ========================================================= */
(() => {
    "use strict";

    const DATA = window.VioletVaultData || {};
    const BANK_CONFIG = DATA.BANK_CONFIG || {};
    const CURRENCY = DATA.CURRENCY || "Q";
    let app = null;

    const $ = (id) => document.getElementById(id);

    function number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function money(value) {
        return Math.round(
            (number(value) + Number.EPSILON) * 100
        ) / 100;
    }

    function format(value) {
        return money(value).toLocaleString("en-US", {
            maximumFractionDigits: 2
        });
    }

    function formatQ(value) {
        return `${format(value)} ${CURRENCY}`;
    }

    /* -------------------- 게임 상태 -------------------- */

    function getState() {
        if (typeof app?.getState === "function") {
            const current = app.getState();
            if (current && typeof current === "object") {
                return current;
            }
        }

        if (app?.state && typeof app.state === "object") {
            return app.state;
        }

        if (typeof window.SaveStore?.getState === "function") {
            const current = window.SaveStore.getState();
            if (current && typeof current === "object") {
                return current;
            }
        }

        if (typeof window.VioletVaultSave?.getState === "function") {
            const current = window.VioletVaultSave.getState();
            if (current && typeof current === "object") {
                return current;
            }
        }

        if (typeof window.VioletVaultApp?.getState === "function") {
            const current = window.VioletVaultApp.getState();
            if (current && typeof current === "object") {
                return current;
            }
        }

        const current = window.VioletVaultApp?.state;

        return current && typeof current === "object"
            ? current
            : null;
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

        if (!Array.isArray(state.unlockedAchievements)) {
            state.unlockedAchievements = [];
        }

        return true;
    }

    function getMaxLoan() {
        const configured = BANK_CONFIG.MAX_LOAN;

        if (
            configured === null ||
            configured === undefined ||
            configured === ""
        ) {
            return null;
        }

        const value = Number(configured);

        return Number.isFinite(value) && value >= 0
            ? value
            : null;
    }

    function isSuccess(result) {
        return (
            result === true ||
            result?.success === true ||
            result?.ok === true
        );
    }

    /* -------------------- 알림 -------------------- */

    function notify(title, message = "") {
        if (typeof app?.toast === "function") {
            app.toast(title, message);
            return;
        }

        if (typeof window.VioletVaultApp?.toast === "function") {
            window.VioletVaultApp.toast(title, message);
            return;
        }

        const stack = $("toast-stack");

        if (!stack) {
            console.info(
                `[Violet Vault Bank] ${title}` +
                (message ? `: ${message}` : "")
            );
            return;
        }

        const item = document.createElement("div");
        item.className = "toast";

        item.style.cssText = [
            "padding:13px 16px",
            "border:1px solid rgba(192,132,252,.42)",
            "border-radius:11px",
            "background:rgba(22,13,35,.97)",
            "color:#f5efff",
            "box-shadow:0 8px 30px rgba(0,0,0,.28)",
            "font-size:12px",
            "line-height:1.65"
        ].join(";");

        const heading = document.createElement("strong");
        heading.textContent = String(title || "Violet Vault");
        heading.style.cssText =
            "display:block;color:#c084fc;margin-bottom:3px;";

        item.appendChild(heading);

        if (message) {
            const body = document.createElement("div");
            body.textContent = String(message);
            item.appendChild(body);
        }

        stack.appendChild(item);
        window.setTimeout(() => item.remove(), 3800);
    }

    /* -------------------- 거래 기록 -------------------- */

    function recordTransaction(state, entry) {
        state.history.unshift({
            id: `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 8)}`,
            timestamp: Date.now(),
            ...entry
        });

        const limit = Math.max(
            1,
            Math.floor(number(DATA.HISTORY_LIMIT, 300))
        );

        if (state.history.length > limit) {
            state.history.length = limit;
        }
    }

    /* -------------------- 저장 및 갱신 -------------------- */

    function saveState(state) {
        try {
            if (typeof window.SaveStore?.save === "function") {
                window.SaveStore.save(state);
            } else if (
                typeof window.VioletVaultSave?.save === "function"
            ) {
                window.VioletVaultSave.save(state);
            } else if (typeof app?.save === "function") {
                app.save();
            } else if (
                typeof window.VioletVaultApp?.saveState === "function"
            ) {
                window.VioletVaultApp.saveState();
            }
        } catch (error) {
            console.error(
                "[Violet Vault Bank] 저장 실패:",
                error
            );
        }
    }

    function checkAchievements(state) {
        const module = window.VioletAchievements;

        if (typeof module?.check === "function") {
            try {
                module.check(state);
            } catch (error) {
                console.error(
                    "[Violet Vault Bank] 업적 검사 실패:",
                    error
                );
            }
        }
    }

    function refresh(state = getState()) {
        if (!ensureState(state)) {
            return;
        }

        saveState(state);
        render(state);

        window.dispatchEvent(
            new CustomEvent("game:data-changed", {
                detail: { state }
            })
        );

        if (typeof app?.render === "function") {
            try {
                app.render();
            } catch (error) {
                console.error(
                    "[Violet Vault Bank] 화면 갱신 실패:",
                    error
                );
            }
        }
    }

    /* -------------------- 금액 검사 -------------------- */

    function validateAmount(value) {
        const amount = Number(value);

        if (!Number.isFinite(amount)) {
            return {
                valid: false,
                reason: "invalid"
            };
        }

        if (!Number.isSafeInteger(amount)) {
            return {
                valid: false,
                reason: "integer"
            };
        }

        if (amount <= 0) {
            return {
                valid: false,
                reason: "positive"
            };
        }

        return {
            valid: true,
            amount
        };
    }

    /* -------------------- 대출 -------------------- */

    function borrow(requestedAmount) {
        const state = getState();

        if (!ensureState(state)) {
            notify("오류", "게임 상태를 불러오지 못했어.");

            return {
                success: false,
                reason: "state_unavailable"
            };
        }

        const checked = validateAmount(requestedAmount);

        if (!checked.valid) {
            const messages = {
                invalid: "대출 금액을 숫자로 입력해 줘.",
                integer: "대출 금액은 정수 Q로 입력해 줘.",
                positive: "대출 금액은 1 Q 이상이어야 해."
            };

            notify(
                "잘못된 금액",
                messages[checked.reason] ||
                "대출 금액을 확인해 줘."
            );

            return {
                success: false,
                reason: "invalid_amount"
            };
        }

        const amount = checked.amount;
        const maxLoan = getMaxLoan();

        if (maxLoan !== null && amount > maxLoan) {
            notify(
                "대출 한도 초과",
                `한 번에 최대 ${formatQ(maxLoan)}까지 대출할 수 있어.`
            );

            return {
                success: false,
                reason: "loan_limit"
            };
        }

        let result;
        const economy = window.VioletEconomy;

        if (typeof economy?.borrowMoney === "function") {
            try {
                result = economy.borrowMoney(state, amount);
            } catch (error) {
                console.error(
                    "[Violet Vault Bank] 대출 처리 실패:",
                    error
                );

                result = {
                    success: false,
                    reason: "borrow_failed"
                };
            }

            if (!isSuccess(result)) {
                const messages = {
                    loan_limit: "대출 한도를 초과했어.",
                    invalid_amount: "대출 금액을 다시 확인해 줘."
                };

                notify(
                    "대출 실패",
                    messages[result?.reason] ||
                    "대출을 처리하지 못했어."
                );

                return {
                    success: false,
                    reason: result?.reason || "borrow_failed"
                };
            }
        } else {
            // 경제 모듈이 없을 때만 사용하는 기본 처리
            state.balance = money(state.balance + amount);
            state.debt = money(state.debt + amount);

            result = {
                success: true,
                amount
            };
        }

        const actualAmount = money(result?.amount ?? amount);

        recordTransaction(state, {
            type: "loan",
            amount: actualAmount
        });

        checkAchievements(state);
        refresh(state);

        const input = $("loan-amount");

        if (input) {
            input.value = "";
        }

        notify(
            "대출 완료",
            `${formatQ(actualAmount)}을 빌렸어. 이자는 없어.`
        );

        return {
            success: true,
            amount: actualAmount,
            balance: state.balance,
            debt: state.debt
        };
    }

    /* -------------------- 대출 상환 -------------------- */

    function repay(requestedAmount) {
        const state = getState();

        if (!ensureState(state)) {
            notify("오류", "게임 상태를 불러오지 못했어.");

            return {
                success: false,
                reason: "state_unavailable"
            };
        }

        const checked = validateAmount(requestedAmount);

        if (!checked.valid) {
            const messages = {
                invalid: "상환 금액을 숫자로 입력해 줘.",
                integer: "상환 금액은 정수 Q로 입력해 줘.",
                positive: "상환 금액은 1 Q 이상이어야 해."
            };

            notify(
                "잘못된 금액",
                messages[checked.reason] ||
                "상환 금액을 확인해 줘."
            );

            return {
                success: false,
                reason: "invalid_amount"
            };
        }

        const debt = Math.max(0, money(state.debt));
        const balance = Math.max(0, money(state.balance));

        if (debt <= 0) {
            notify("대출 없음", "현재 갚아야 할 대출이 없어.");

            return {
                success: false,
                reason: "no_debt"
            };
        }

        if (balance <= 0) {
            notify("잔액 부족", "상환할 잔액이 없어.");

            return {
                success: false,
                reason: "no_balance"
            };
        }

        const economy = window.VioletEconomy;
        let result;

        if (typeof economy?.repayDebt === "function") {
            try {
                result = economy.repayDebt(state, checked.amount);
            } catch (error) {
                console.error(
                    "[Violet Vault Bank] 상환 처리 실패:",
                    error
                );

                result = {
                    success: false,
                    reason: "repayment_failed"
                };
            }

            if (!isSuccess(result)) {
                const messages = {
                    no_debt: "현재 갚아야 할 대출이 없어.",
                    no_balance: "상환할 잔액이 부족해.",
                    invalid_amount: "상환 금액을 다시 확인해 줘."
                };

                notify(
                    "상환 실패",
                    messages[result?.reason] ||
                    "상환을 처리하지 못했어."
                );

                return {
                    success: false,
                    reason: result?.reason || "repayment_failed"
                };
            }
        } else {
            const actual = money(
                Math.min(checked.amount, balance, debt)
            );

            if (actual <= 0) {
                return {
                    success: false,
                    reason: "invalid_amount"
                };
            }

            state.balance = money(balance - actual);
            state.debt = money(debt - actual);

            result = {
                success: true,
                amount: actual
            };
        }

        const paid = money(
            result?.amount ??
            Math.min(checked.amount, balance, debt)
        );

        recordTransaction(state, {
            type: "repayment",
            amount: paid
        });

        checkAchievements(state);
        refresh(state);

        const input = $("repay-amount");

        if (input) {
            input.value = "";
        }

        if (state.debt <= 0) {
            notify(
                "전액 상환 완료!",
                `${formatQ(paid)}을 갚고 모든 빚을 청산했어!`
            );
        } else {
            notify(
                "상환 완료",
                `${formatQ(paid)}을 상환했어. 남은 빚은 ${formatQ(state.debt)}이야.`
            );
        }

        return {
            success: true,
            amount: paid,
            balance: state.balance,
            debt: state.debt
        };
    }

    /* -------------------- 은행 화면 -------------------- */

    function renderSummary(state) {
        const summary = $("bank-account-summary");

        if (!summary) {
            return;
        }

        const debt = Math.max(0, money(state.debt));
        const balance = Math.max(0, money(state.balance));

        const status = debt > 0
            ? "대출 이용 중"
            : "대출을 이용할 수 있어.";

        const statusClass = debt > 0
            ? "bank-status-active"
            : "bank-status-available";

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
                <span>${status}</span>
            </div>

            <div class="bank-available-balance">
                <span>현재 보유 금액</span>
                <strong>${formatQ(balance)}</strong>
            </div>
        `;
    }

    function render(state = getState()) {
        if (!ensureState(state)) {
            return;
        }

        const balanceElement = $("bank-current-balance");
        const debtElement = $("bank-debt");
        const statusElement = $("bank-status");

        if (balanceElement) {
            balanceElement.textContent = formatQ(state.balance);
        }

        if (debtElement) {
            debtElement.textContent = formatQ(state.debt);
        }

        if (statusElement) {
            statusElement.textContent =
                number(state.debt) > 0
                    ? "대출 이용 중"
                    : "무이자";
        }

        renderSummary(state);

        const repayButton = $("repay-button");

        if (repayButton) {
            repayButton.disabled =
                number(state.debt) <= 0 ||
                number(state.balance) <= 0;
        }

        const loanInput = $("loan-amount");

        if (loanInput) {
            loanInput.min = "1";
            loanInput.step = "1";

            const limit = getMaxLoan();

            if (limit === null) {
                loanInput.removeAttribute("max");
            } else {
                loanInput.max = String(limit);
            }
        }

        const repayInput = $("repay-amount");

        if (repayInput) {
            repayInput.min = "1";
            repayInput.step = "1";
            repayInput.max = String(
                Math.max(0, Math.floor(number(state.balance)))
            );
        }
    }

    /* -------------------- 초기화 및 공개 API -------------------- */

    function init(application) {
        app = application || window.VioletVaultApp || app;
        render(getState());
        return true;
    }

    function open() {
        if (typeof window.VioletVaultMain?.openByName === "function") {
            window.VioletVaultMain.openByName("bank");
        } else {
            render(getState());
        }
    }

    window.VioletBank = {
        init,
        open,
        render,
        borrow,
        repay,

        getSummary(state = getState()) {
            if (!ensureState(state)) {
                return null;
            }

            const debt = money(state.debt);
            const balance = money(state.balance);

            return {
                balance,
                debt,
                interestRate: 0,
                hasDeadline: false,
                maxLoan: getMaxLoan(),
                canRepay: debt > 0 && balance > 0,
                isInDebt: debt > 0
            };
        },

        getMaxLoan,

        get state() {
            return getState();
        }
    };

    console.log("[Violet Vault] 은행 모듈 준비 완료.");
})();
