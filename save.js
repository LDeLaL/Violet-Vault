/* =========================================================
   VIOLET VAULT
   Save System — save.js
   Compatible State Management System
   =========================================================

   담당 기능
   - 게임 데이터 저장 및 불러오기
   - 저장 데이터 초기화
   - 브라우저 localStorage 연결
   - SaveStore 호환 API 제공
   - VioletVaultSave 호환 API 제공
   - VioletVaultApp 호환 API 제공
   - GAME_DATA 호환 데이터 제공
   - 다른 모듈에 게임 상태 공유

   연결 파일
   - index.html
   - data.js
   - economy.js
   - bank.js
   - stock.js
   - settings.js
   - script.js

   모든 금액은 가상 화폐 Q다.
   ========================================================= */

(() => {
    "use strict";

    /* =====================================================
       1. 기본 설정
       ===================================================== */

    const DATA = window.VioletVaultData || {};

    const STORAGE_KEY = "violet-vault-save-v1";

    const LAST_SAVED_KEY = "violet-vault-last-saved";

    const SAVE_VERSION = 1;

    const CURRENCY = DATA.CURRENCY || "Q";

    const STARTING_BALANCE = Number.isFinite(
        Number(DATA.STARTING_BALANCE)
    )
        ? Math.max(0, Number(DATA.STARTING_BALANCE))
        : 100;

    const HISTORY_LIMIT = Math.max(
        1,
        Math.floor(Number(DATA.HISTORY_LIMIT) || 300)
    );

    let currentState = null;

    let memorySave = null;

    let lastSavedAt = null;


    /* =====================================================
       2. 공통 유틸리티
       ===================================================== */

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


    function cloneData(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            console.error(
                "[Violet Vault Save] 데이터 복사 실패:",
                error
            );

            return null;
        }
    }


    function createId() {
        return (
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 10)
        );
    }


    /* =====================================================
       3. 기본 게임 데이터
       ===================================================== */

    function createDefaultState() {
        return {
            version: SAVE_VERSION,

            balance: STARTING_BALANCE,

            totalDraws: 0,

            totalIncome: 0,

            totalExpenses: 0,

            totalEarned: 0,

            totalSpent: 0,

            debt: 0,

            highestPrize: 0,

            bestWin: 0,

            lastPrize: null,

            history: [],

            codex: [],

            unlockedAchievements: [],

            stocks: {},

            stockPortfolioValue: 0,

            stockRealizedProfit: 0,

            marketLastUpdatedAt: Date.now(),

            settings: {
                theme: "dark",

                effectsEnabled:
                    DATA.DEFAULT_EFFECTS_ENABLED !== false,

                animationsEnabled:
                    DATA.DEFAULT_ANIMATIONS_ENABLED !== false,

                animations:
                    DATA.DEFAULT_ANIMATIONS_ENABLED !== false
            }
        };
    }


    /* =====================================================
       4. 이전 데이터와 새 데이터 호환
       ===================================================== */

    /*
     * 기존 파일은 totalEarned / totalSpent를 사용하고,
     * 경제 모듈은 totalIncome / totalExpenses를 사용한다.
     *
     * 두 이름이 같은 값을 가리키도록 연결한다.
     */

    function bindAlias(state, alias, original) {
        if (
            !state ||
            typeof state !== "object"
        ) {
            return;
        }

        const descriptor = Object.getOwnPropertyDescriptor(
            state,
            alias
        );

        if (
            descriptor &&
            typeof descriptor.get === "function"
        ) {
            return;
        }

        const existingAlias = safeNumber(
            state[alias],
            0
        );

        const existingOriginal = safeNumber(
            state[original],
            0
        );

        /*
         * 이전 저장 데이터에만 값이 존재하는 경우도 보존한다.
         */

        if (
            existingOriginal === 0 &&
            existingAlias !== 0
        ) {
            state[original] = existingAlias;
        }

        try {
            delete state[alias];

            Object.defineProperty(state, alias, {
                enumerable: true,

                configurable: true,

                get() {
                    return state[original];
                },

                set(value) {
                    const number = Number(value);

                    if (Number.isFinite(number)) {
                        state[original] = number;
                    }
                }
            });
        } catch (error) {
            /*
             * 별칭 등록이 불가능한 환경에서는
             * 일반 데이터로 유지한다.
             */

            state[alias] = state[original];
        }
    }


    function normalizeState(rawData) {
        const defaults = createDefaultState();

        const raw =
            rawData &&
            typeof rawData === "object" &&
            !Array.isArray(rawData)
                ? rawData
                : {};

        const state = Object.assign(
            defaults,
            raw
        );

        state.balance = Math.max(
            0,
            roundMoney(state.balance)
        );

        state.totalDraws = Math.max(
            0,
            Math.floor(safeNumber(state.totalDraws))
        );

        state.totalIncome = Math.max(
            0,
            roundMoney(
                Math.max(
                    safeNumber(raw.totalIncome),
                    safeNumber(raw.totalEarned)
                )
            )
        );

        state.totalExpenses = Math.max(
            0,
            roundMoney(
                Math.max(
                    safeNumber(raw.totalExpenses),
                    safeNumber(raw.totalSpent)
                )
            )
        );

        state.debt = Math.max(
            0,
            roundMoney(state.debt)
        );

        state.bestWin = Math.max(
            0,
            roundMoney(
                Math.max(
                    safeNumber(raw.bestWin),
                    safeNumber(raw.highestPrize)
                )
            )
        );

        state.highestPrize = state.bestWin;

        state.stockPortfolioValue = Math.max(
            0,
            roundMoney(state.stockPortfolioValue)
        );

        state.stockRealizedProfit = roundMoney(
            state.stockRealizedProfit
        );

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

        if (
            !state.settings ||
            typeof state.settings !== "object" ||
            Array.isArray(state.settings)
        ) {
            state.settings = {};
        }

        state.settings.theme =
            state.settings.theme === "light"
                ? "light"
                : "dark";

        state.settings.effectsEnabled =
            typeof state.settings.effectsEnabled === "boolean"
                ? state.settings.effectsEnabled
                : true;

        state.settings.animationsEnabled =
            typeof state.settings.animationsEnabled === "boolean"
                ? state.settings.animationsEnabled
                : true;

        state.settings.animations =
            typeof state.settings.animations === "boolean"
                ? state.settings.animations
                : state.settings.animationsEnabled;

        bindAlias(
            state,
            "totalEarned",
            "totalIncome"
        );

        bindAlias(
            state,
            "totalSpent",
            "totalExpenses"
        );

        bindAlias(
            state,
            "highestPrize",
            "bestWin"
        );

        return state;
    }


    /* =====================================================
       5. 저장 공간 확인
       ===================================================== */

    function isStorageAvailable() {
        try {
            const testKey = "__violet_vault_test__";

            window.localStorage.setItem(
                testKey,
                "test"
            );

            window.localStorage.removeItem(testKey);

            return true;
        } catch (error) {
            return false;
        }
    }


    function getLastSavedAt() {
        if (lastSavedAt !== null) {
            return lastSavedAt;
        }

        try {
            const value = window.localStorage.getItem(
                LAST_SAVED_KEY
            );

            if (value === null) {
                return null;
            }

            const timestamp = Number(value);

            if (!Number.isFinite(timestamp)) {
                return null;
            }

            lastSavedAt = timestamp;

            return timestamp;
        } catch (error) {
            return null;
        }
    }


    function getLastSavedDate() {
        const timestamp = getLastSavedAt();

        if (timestamp === null) {
            return null;
        }

        const date = new Date(timestamp);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }


    /* =====================================================
       6. 게임 상태 확인
       ===================================================== */

    function getState() {
        if (!currentState) {
            currentState = normalizeState(
                createDefaultState()
            );
        }

        return currentState;
    }


    function notifyDataChanged() {
        try {
            window.dispatchEvent(
                new CustomEvent("game:data-changed", {
                    detail: {
                        state: getState()
                    }
                })
            );
        } catch (error) {
            console.warn(
                "[Violet Vault Save] 상태 변경 알림 실패:",
                error
            );
        }
    }


    /* =====================================================
       7. 데이터 저장
       ===================================================== */

    function save(state = getState()) {
        if (
            !state ||
            typeof state !== "object" ||
            Array.isArray(state)
        ) {
            console.error(
                "[Violet Vault Save] 저장할 데이터가 올바르지 않아."
            );

            return false;
        }

        const snapshot = cloneData(state);

        if (!snapshot) {
            return false;
        }

        snapshot.version = SAVE_VERSION;

        snapshot.savedAt = Date.now();

        memorySave = snapshot;

        lastSavedAt = snapshot.savedAt;

        try {
            window.localStorage.setItem(
                LAST_SAVED_KEY,
                String(lastSavedAt)
            );
        } catch (error) {
            /*
             * 저장 시간 기록에 실패해도
             * 게임 데이터 저장을 계속 시도한다.
             */
        }

        if (!isStorageAvailable()) {
            console.warn(
                "[Violet Vault Save] 브라우저 저장 공간을 사용할 수 없어. " +
                "현재 페이지에서만 임시 저장할게."
            );

            return false;
        }

        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(snapshot)
            );

            return true;
        } catch (error) {
            console.error(
                "[Violet Vault Save] 저장 실패:",
                error
            );

            return false;
        }
    }


    /* =====================================================
       8. 데이터 불러오기
       ===================================================== */

    function load() {
        let loadedData = null;

        if (isStorageAvailable()) {
            try {
                const raw = window.localStorage.getItem(
                    STORAGE_KEY
                );

                if (raw !== null) {
                    const parsed = JSON.parse(raw);

                    if (
                        parsed &&
                        typeof parsed === "object" &&
                        !Array.isArray(parsed) &&
                        typeof parsed.balance === "number" &&
                        Number.isFinite(parsed.balance) &&
                        parsed.balance >= 0
                    ) {
                        loadedData = parsed;
                    } else {
                        console.warn(
                            "[Violet Vault Save] 저장 데이터 형식이 올바르지 않아."
                        );
                    }
                }
            } catch (error) {
                console.error(
                    "[Violet Vault Save] 데이터 불러오기 실패:",
                    error
                );
            }
        }

        if (!loadedData && memorySave) {
            loadedData = memorySave;
        }

        currentState = normalizeState(
            loadedData || createDefaultState()
        );

        if (
            loadedData &&
            Number.isFinite(Number(loadedData.savedAt))
        ) {
            lastSavedAt = Number(loadedData.savedAt);
        }

        notifyDataChanged();

        return currentState;
    }


    /* =====================================================
       9. 데이터 수정
       ===================================================== */

    function update(callback) {
        const state = getState();

        if (typeof callback !== "function") {
            console.error(
                "[Violet Vault Save] update에는 함수가 필요해."
            );

            return false;
        }

        try {
            const result = callback(state);

            save(state);

            notifyDataChanged();

            return result === undefined
                ? true
                : result;
        } catch (error) {
            console.error(
                "[Violet Vault Save] 데이터 수정 실패:",
                error
            );

            return false;
        }
    }


    /* =====================================================
       10. 거래 기록 추가
       ===================================================== */

    function addHistory(entry) {
        if (
            !entry ||
            typeof entry !== "object"
        ) {
            return false;
        }

        const state = getState();

        state.history.unshift({
            ...entry,

            id: entry.id || createId(),

            timestamp:
                Number.isFinite(Number(entry.timestamp))
                    ? Number(entry.timestamp)
                    : Date.now()
        });

        if (state.history.length > HISTORY_LIMIT) {
            state.history.length = HISTORY_LIMIT;
        }

        save(state);

        return true;
    }


    /* =====================================================
       11. 데이터 초기화
       ===================================================== */

    function reset() {
        currentState = normalizeState(
            createDefaultState()
        );

        memorySave = null;

        lastSavedAt = null;

        try {
            window.localStorage.removeItem(STORAGE_KEY);

            window.localStorage.removeItem(LAST_SAVED_KEY);
        } catch (error) {
            console.warn(
                "[Violet Vault Save] 기존 저장 파일 삭제 실패:",
                error
            );
        }

        /*
         * 새 게임의 기본 상태를 즉시 저장한다.
         */

        save(currentState);

        notifyDataChanged();

        return currentState;
    }


    function removeSavedData() {
        memorySave = null;

        lastSavedAt = null;

        try {
            window.localStorage.removeItem(STORAGE_KEY);

            window.localStorage.removeItem(LAST_SAVED_KEY);

            return true;
        } catch (error) {
            console.error(
                "[Violet Vault Save] 저장 데이터 삭제 실패:",
                error
            );

            return false;
        }
    }


    function hasSave() {
        if (memorySave) {
            return true;
        }

        if (!isStorageAvailable()) {
            return false;
        }

        try {
            return window.localStorage.getItem(
                STORAGE_KEY
            ) !== null;
        } catch (error) {
            return false;
        }
    }


    function getInfo() {
        return {
            version: SAVE_VERSION,

            storageAvailable: isStorageAvailable(),

            hasSave: hasSave(),

            lastSavedAt: getLastSavedAt(),

            lastSavedDate: getLastSavedDate()
        };
    }


    /* =====================================================
       12. 이전 데이터 이름 호환
       ===================================================== */

    /*
     * 기존 script.js에서 사용하는 GAME_DATA 이름을
     * 현재 VioletVaultData 구조에 연결한다.
     *
     * 원래 데이터와 설정은 변경하지 않는다.
     */

    window.GAME_DATA = Object.assign(
        {},
        DATA,
        {
            currency: CURRENCY,

            minPrize: safeNumber(
                DATA.MIN_REWARD,
                1
            ),

            maxPrize: safeNumber(
                DATA.MAX_REWARD,
                100
            ),

            drawCost: safeNumber(
                DATA.DRAW_COST,
                1
            ),

            autoDrawInterval: safeNumber(
                DATA.AUTO_DRAW_DELAY,
                1000
            ),

            rarities: Array.isArray(DATA.RARITIES)
                ? DATA.RARITIES
                : [],

            achievements: Array.isArray(DATA.ACHIEVEMENTS)
                ? DATA.ACHIEVEMENTS
                : [],

            stocks: Array.isArray(DATA.STOCKS)
                ? DATA.STOCKS
                : []
        }
    );


    /* =====================================================
       13. SaveStore API
       ===================================================== */

    /*
     * 기존 script.js와 연결하기 위한 API다.
     *
     * SaveStore.getState()
     * SaveStore.load()
     * SaveStore.save()
     * SaveStore.update()
     * SaveStore.reset()
     */

    window.SaveStore = {
        getState,

        load,

        save,

        update,

        reset,

        addHistory,

        hasSave,

        getInfo,

        removeSavedData,

        getLastSavedAt,

        getLastSavedDate,

        get state() {
            return getState();
        }
    };


    /* =====================================================
       14. VioletVaultSave API
       ===================================================== */

    /*
     * 다른 모듈에서 사용하는 기존 이름도 유지한다.
     */

    window.VioletVaultSave = {
        getState,

        save,

        load,

        update,

        reset,

        addHistory,

        hasSave,

        getInfo,

        removeSavedData,

        getLastSavedAt,

        getLastSavedDate
    };


    /* =====================================================
       15. VioletVaultApp API
       ===================================================== */

    /*
     * 은행, 주식, 설정 모듈이 공통 게임 상태를
     * 사용할 수 있도록 호환 인터페이스를 제공한다.
     */

    const VioletVaultApp = {
        get state() {
            return getState();
        },

        getState,

        save,

        saveState: save,

        addHistory,

        render() {
            if (
                window.VioletVaultMain &&
                typeof window.VioletVaultMain.render === "function"
            ) {
                window.VioletVaultMain.render();
            }

            if (
                window.VioletBank &&
                typeof window.VioletBank.render === "function"
            ) {
                window.VioletBank.render(getState());
            }

            if (
                window.VioletStock &&
                typeof window.VioletStock.render === "function"
            ) {
                window.VioletStock.render(getState());
            }
        },

        toast(title, message) {
            showToast(title, message);
        }
    };


    /* =====================================================
       16. 알림 표시
       ===================================================== */

    function showToast(title, message) {
        const container = document.getElementById(
            "toast-stack"
        );

        /*
         * 알림 영역이 없을 때도 기능은 계속 작동하도록 한다.
         */

        if (!container) {
            console.log(
                "[Violet Vault]",
                title,
                message || ""
            );

            return;
        }

        const toast = document.createElement("div");

        toast.style.cssText = [
            "padding:14px 16px",
            "margin-top:8px",
            "border:1px solid rgba(192,132,252,.4)",
            "border-radius:12px",
            "background:rgba(22,13,35,.97)",
            "color:#f5efff",
            "box-shadow:0 8px 30px rgba(0,0,0,.25)",
            "font-size:12px",
            "line-height:1.7",
            "overflow-wrap:anywhere"
        ].join(";");

        const heading = document.createElement("strong");

        heading.textContent = String(title || "Violet Vault");

        heading.style.cssText = [
            "display:block",
            "margin-bottom:3px",
            "color:#c084fc",
            "font-weight:800"
        ].join(";");

        toast.appendChild(heading);

        if (message) {
            const body = document.createElement("div");

            body.textContent = String(message);

            toast.appendChild(body);
        }

        container.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 4000);
    }


    window.VioletVaultApp = VioletVaultApp;


    /* =====================================================
       17. 저장 시스템 시작
       ===================================================== */

    currentState = normalizeState(
        createDefaultState()
    );

    console.log(
        "[Violet Vault Save] 저장 시스템 준비 완료."
    );

    console.log(
        "[Violet Vault Save] SaveStore 호환 API 등록 완료."
    );

})();
